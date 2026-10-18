// Mayor Mabel on step-5-preview (A-03/A-04). The model is fixed by STEPFUN_MODEL policy
// ("step-5-preview" only). Prompt bodies live in mayor/prompts/*.md. Untrusted idea/artifact text is
// wrapped in <idea>/<artifact> tags and '</' sequences are neutralized so data cannot close a tag.
import type { Artifact, ArtifactKind, BriefPayload, Plan, PlanTask } from '@hc/contracts';
import { ArtifactSchemas } from '@hc/contracts';
import { jsonCandidate, parseLooseJson } from '../llm/json';
import { addUsage, CALL_TIMEOUT_MS, PLAN_TIMEOUT_MS, SAY_TIMEOUT_MS, chatRaw, type ChatOptions } from '../llm/stepfun';
import { fill, prompt, untrusted } from './prompts';
import { BRIEF_JSON_SCHEMA, KIND_TO_JSON_SCHEMA, PLAN_JSON_SCHEMA, REPAIR_VALUE_JSON_SCHEMA, REVIEW_JSON_SCHEMA } from './schemas';
import { CANNED_SAY, SAY_INTERVAL_MS, taskLine, vetSay, type SayMoment } from './canned';
import { validatePlan } from './validate';
import { templatePlan } from './template';
import type { Mayor, Usage } from './index';

/** Raised when a hard deadline fired; callers map it to the documented fallback. */
class DeadlineError extends Error {
  constructor() {
    super('mayor call deadline exceeded');
    this.name = 'DeadlineError';
  }
}

async function withDeadline<T>(timeoutMs: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (controller.signal.aborted && err instanceof Error && err.name === 'AbortError') throw new DeadlineError();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Wrap untrusted content in a bounded <tag> block. */
function block(tag: string, content: string, capChars = 80_000): string {
  const body = content.length > capChars ? `${content.slice(0, capChars)}…(truncated)` : content;
  return `<${tag}>\n${untrusted(body)}\n</${tag}>`;
}

function answersBlock(answers: { q: string; a: string }[] | undefined): string {
  if (!answers?.length) return '';
  const body = answers.slice(0, 4).map((a) => `q: ${a.q.slice(0, 280)}\na: ${a.a.slice(0, 400)}`).join('\n---\n');
  return `## Founder answers (untrusted data)\n${block('answers', body)}\n\n`;
}

/** Prompt-safe serialization of an artifact payload (meta header note, capped body). */
function payloadJson(artifact: Artifact, capChars: number): string {
  const meta = {kind:artifact.kind,title:artifact.title,...(artifact.url?{url:artifact.url}:{})};
  const text = JSON.stringify(artifact.payload, null, 1);
  const body = text.length > capChars ? {truncated:true,preview:text.slice(0,capChars)} : artifact.payload;
  return JSON.stringify({_meta:meta,payload:body});
}

function verdictOf(candidate: unknown): { verdict: 'accept' | 'revise'; note: string } | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const c = candidate as { verdict?: unknown; note?: unknown };
  const verdict = c.verdict === 'accept' ? 'accept' : c.verdict === 'revise' ? 'revise' : null;
  if (!verdict) return null;
  const note = typeof c.note === 'string' ? c.note.replace(/\s+/g, ' ').trim().slice(0, 140) : '';
  return { verdict, note };
}

function briefOf(candidate: unknown): BriefPayload | null {
  const parsed = ArtifactSchemas.brief.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

const FALLBACK_NEXT_STEPS: [string, string, string] = ['Book the domain and publish the page.', 'Email the personas from the launch kit.', 'Review competitor pricing weekly.'];

export class StepfunMayor implements Mayor {
  private lastModelSayAt = 0;

  async plan(i: { idea: string; answers?: { q: string; a: string }[] }): Promise<{ plan: Plan; source: 'model' | 'repaired' | 'template'; usage: Usage }> {
    const usage: Usage = { tokensIn: 0, tokensOut: 0 };
    // AC-02.2 test hook: force the invalid-JSON path without waiting for the network.
    if (process.env.HC_FORCE_BAD_PLAN === '1') {
      return this.planFromContent(i.idea, 'Say something poetic about boba instead of producing JSON.', usage, new AbortController().signal);
    }
    try {
      return await withDeadline(PLAN_TIMEOUT_MS, async (signal) => {
        const user = fill(prompt('plan'), {
          IDEA: block('idea', i.idea, 4_000),
          ANSWERS_BLOCK: answersBlock(i.answers),
        });
        const res = await chatRaw([{ role: 'system', content: prompt('system') }, { role: 'user', content: user }], {
          json: { name: 'plan', schema: PLAN_JSON_SCHEMA },
          reasoningEffort: 'medium',
          signal,
        });
        Object.assign(usage, addUsage(usage, res.usage));
        return this.planFromContent(i.idea, res.message.content, usage, signal);
      });
    } catch (err) {
      // 60 s hard deadline (HC-F-021): keep the run alive with the labeled template plan.
      if (err instanceof DeadlineError) return { plan: templatePlan(i.idea), source: 'template', usage };
      throw err;
    }
  }

  /** Validate the model content; then one repair carrying the errors; then the template plan. */
  private planFromContent(idea: string, content: string, usage: Usage, signal: AbortSignal): Promise<{ plan: Plan; source: 'model' | 'repaired' | 'template'; usage: Usage }> {
    const fallback = (): { plan: Plan; source: 'template'; usage: Usage } => ({ plan: templatePlan(idea), source: 'template', usage: { ...usage } });
    const first = validatePlan(parseLooseJson(content));
    if (first.ok) return Promise.resolve({ plan: first.plan, source: 'model', usage });
    return this.repairInternal({
      label: 'plan',
      raw: jsonCandidate(content),
      errors: first.issues,
      schema: KIND_TO_JSON_SCHEMA.plan,
      sig: { signal },
    })
      .catch(() => null)
      .then((repaired) => {
        if (repaired) {
          const second = validatePlan(repaired.value);
          if (second.ok) return { plan: second.plan, source: 'repaired', usage: addUsage(usage, repaired.usage) };
          return { ...fallback(), usage: addUsage(usage, repaired.usage) };
        }
        return fallback();
      });
  }

  async review(i: { idea: string; task: PlanTask; artifact: Artifact }): Promise<{ verdict: 'accept' | 'revise'; note: string; usage: Usage }> {
    const usage: Usage = { tokensIn: 0, tokensOut: 0 };
    let content = '';
    try {
      content = await withDeadline(CALL_TIMEOUT_MS, async (signal) => {
        const user = fill(prompt('review'), {
          IDEA: block('idea', i.idea, 4_000),
          TASK: block('task', taskLine(i.task), 1_200),
          // Review the actual validated payload. Do not prepend a loose
          // metadata line that the model can mistake for malformed output.
          ARTIFACT: untrusted(JSON.stringify(i.artifact.payload)),
        });
        const res = await chatRaw([{ role: 'system', content: prompt('system') }, { role: 'user', content: user }], {
          json: { name: 'review_verdict', schema: REVIEW_JSON_SCHEMA },
          reasoningEffort: 'medium',
          signal,
        });
        Object.assign(usage, addUsage(usage, res.usage));
        return res.message.content;
      });
      const verdict = verdictOf(parseLooseJson(content));
      if (verdict) return { ...verdict, usage };
    } catch (err) {
      if (!(err instanceof DeadlineError)) throw err;
    }
    const repaired = await this.repairInternal({
      label: 'review verdict',
      raw: jsonCandidate(content),
      errors: 'Expected {"verdict":"accept"|"revise","note":string}.',
      schema: REVIEW_JSON_SCHEMA,
    }).catch(() => null);
    const merged = repaired ? addUsage(usage, repaired.usage) : usage;
    const verdict = repaired ? verdictOf(repaired.value) : null;
    if (verdict) return { ...verdict, usage: merged };
    // Unparseable review degrades to accept; the executor enforces the at-most-one-revise cap.
    return { verdict: 'accept', note: 'Review output unparseable; accepted without notes.', usage: merged };
  }

  async brief(i: { idea: string; plan: Plan; artifacts: Artifact[] }): Promise<{ brief: BriefPayload; usage: Usage }> {
    const usage: Usage = { tokensIn: 0, tokensOut: 0 };
    const artifactBlocks = i.artifacts.map((a) => block('artifact', payloadJson(a, 40_000))).join('\n\n') || '(no artifacts)';
    try {
      const content = await withDeadline(CALL_TIMEOUT_MS, async (signal) => {
        const user = fill(prompt('brief'), {
          IDEA: block('idea', i.idea, 4_000),
          PLAN: block('plan', JSON.stringify({ title: i.plan.title, summary: i.plan.summary, tasks: i.plan.tasks.map((t) => ({ id: t.id, owner: t.owner, title: t.title, deliverable: t.deliverable })) }), 2_000),
          ARTIFACTS: artifactBlocks,
        });
        const res = await chatRaw([{ role: 'system', content: prompt('system') }, { role: 'user', content: user }], {
          json: { name: 'brief', schema: BRIEF_JSON_SCHEMA },
          reasoningEffort: 'medium',
          signal,
        });
        Object.assign(usage, addUsage(usage, res.usage));
        return res.message.content;
      });
      const brief = briefOf(parseLooseJson(content));
      if (brief) return { brief, usage };
    } catch (err) {
      if (!(err instanceof DeadlineError)) throw err;
    }
    // Fallback brief synthesized only from data we already hold (plan summary + artifact links).
    const links = i.artifacts.filter((a) => a.url).map((a) => `- [${a.title}](${a.url})`);
    const markdown = [
      '## What we built', '', i.plan.summary, '',
      '## What we learned', '',
      `- The run produced ${i.artifacts.length} deliverable(s); details are on the shelf.`, '',
      '## Next 3 steps', '', ...FALLBACK_NEXT_STEPS.map((s) => `- ${s}`), '',
      '## Links', '', links.length ? links.join('\n') : '- (no URLs recorded)',
    ].join('\n');
    const fallback = ArtifactSchemas.brief.safeParse({ markdown, nextSteps: [...FALLBACK_NEXT_STEPS] });
    return { brief: fallback.success ? fallback.data : { markdown, nextSteps: [...FALLBACK_NEXT_STEPS] }, usage };
  }

  async say(i: { moment: 'planned' | 'approved' | 'handoff' | 'accepted' | 'completed'; context: string }): Promise<{ text: string; source: 'model' | 'canned'; usage: Usage }> {
    const canned = (): { text: string; source: 'canned'; usage: Usage } => ({ text: CANNED_SAY[i.moment as SayMoment] ?? CANNED_SAY.planned, source: 'canned', usage: { tokensIn: 0, tokensOut: 0 } });
    // Rate limit (HC-F-025): at most one model line every 8 s; anything else is canned.
    if (this.lastModelSayAt && Date.now() - this.lastModelSayAt < SAY_INTERVAL_MS) return canned();
    this.lastModelSayAt = Date.now();
    try {
      const completion = await withDeadline(SAY_TIMEOUT_MS, async (signal) => {
        const user = fill(prompt('say'), {
          MOMENT: i.moment,
          CONTEXT: `"${(i.context || 'no context').slice(0, 600)}"`,
        });
        return chatRaw([{ role: 'system', content: prompt('system') }, { role: 'user', content: user }], {
          reasoningEffort: 'low',
          maxTokens: 64,
          signal,
        });
      });
      const line = vetSay(completion.message.content);
      if (!line) return { ...canned(), usage: completion.usage };
      this.lastModelSayAt = Date.now();
      return { text: line, source: 'model', usage: addUsage({ tokensIn: 0, tokensOut: 0 }, completion.usage) };
    } catch {
      return canned();
    }
  }

  async cover(i: { idea: string; task: PlanTask; inputs: Artifact[] }): Promise<{ payload: unknown; usage: Usage }> {
    const kind = i.task.deliverable as ArtifactKind;
    if (kind !== 'research' && kind !== 'site' && kind !== 'launch_kit') {
      throw new Error(`cover: brief is never covered (${kind})`);
    }
    const usage: Usage = { tokensIn: 0, tokensOut: 0 };
    try {
      return await withDeadline(CALL_TIMEOUT_MS, async (signal): Promise<{ payload: unknown; usage: Usage }> => {
        const artifactBlocks = i.inputs.map((a) => block('artifact', payloadJson(a, 40_000))).join('\n\n') || '(no dependency artifacts)';
        const user = fill(prompt('cover'), {
          IDEA: block('idea', i.idea, 4_000),
          TASK: block('task', taskLine(i.task), 1_200),
          INPUTS: artifactBlocks,
        });
        const res = await chatRaw([{ role: 'system', content: prompt('system') }, { role: 'user', content: user }], {
          json: { name: `${kind}_cover`, schema: KIND_TO_JSON_SCHEMA[kind] },
          reasoningEffort: 'medium',
          signal,
        });
        Object.assign(usage, addUsage(usage, res.usage));
        const c1 = parseLooseJson(res.message.content);
        const v1 = c1 != null ? ArtifactSchemas[kind].safeParse(c1) : null;
        if (v1?.success) return { payload: v1.data, usage };
        const repaired = await this.repairInternal({
          label: `${kind} payload`,
          raw: jsonCandidate(res.message.content),
          errors: v1 && !v1.success ? v1.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') : 'output was not JSON',
          schema: KIND_TO_JSON_SCHEMA[kind],
          sig: { signal },
        }).catch(() => null);
        const merged = repaired ? addUsage(usage, repaired.usage) : usage;
        if (repaired?.value != null) {
          const v2 = ArtifactSchemas[kind].safeParse(repaired.value);
          if (v2.success) return { payload: v2.data, usage: merged };
        }
        const e = new Error(`cover: could not produce a valid ${kind} payload after one repair`);
        e.name = 'CoverUnparseable';
        throw e;
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'CoverUnparseable') throw err;
      if (err instanceof DeadlineError) {
        const e = new Error('cover: deadline exceeded (60 s hard timeout)');
        e.name = 'CoverUnparseable';
        throw e;
      }
      throw err;
    }
  }

  public async repairJson<T>(i: { raw: string; schemaName: 'plan' | ArtifactKind; errors: string }): Promise<{ value: T | null; usage: Usage }> {
    const schema = i.schemaName === 'plan' ? KIND_TO_JSON_SCHEMA.plan : KIND_TO_JSON_SCHEMA[i.schemaName];
    const res = await this.repairInternal({ label: i.schemaName, raw: i.raw, errors: i.errors, schema });
    return { value: (res.value ?? null) as T | null, usage: res.usage };
  }

  /**
   * One repair attempt on raw candidate text (A-04). `sig.signal` lets an outer hard deadline
   * (plan's 60 s) cancel the repair; the in-flight chat call is bounded by the remaining budget.
   */
  private async repairInternal(i: { label: string; raw: string; errors: string; schema: unknown; sig?: { signal: AbortSignal } }): Promise<{ value: unknown; usage: Usage }> {
    const opts: ChatOptions = { json: { name: 'repair_value', schema: REPAIR_VALUE_JSON_SCHEMA as Record<string, unknown> }, reasoningEffort: 'low', timeoutMs: CALL_TIMEOUT_MS, maxTokens: 32_000 };
    if (i.sig) {
      opts.signal = i.sig.signal;
      opts.timeoutMs = PLAN_TIMEOUT_MS; // outer withDeadline(60 s) aborts first if the plan budget ran out
    }
    const user = fill(prompt('repair'), {
      SCHEMA_NAME: `${i.label}\n${JSON.stringify(i.schema)}`,
      ERRORS: i.errors.slice(0, 1_600),
      RAW: block('candidate', i.raw, 160_000),
    });
    const res = await chatRaw([{ role: 'system', content: prompt('system') }, { role: 'user', content: user }], opts);
    const parsed = parseLooseJson(res.message.content) as { value?: unknown } | null;
    const value = parsed && typeof parsed === 'object' && 'value' in parsed ? (parsed.value ?? null) : null;
    return { value, usage: res.usage };
  }
}
