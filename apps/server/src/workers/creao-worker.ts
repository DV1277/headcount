// CREAO worker (A-05/A-06, HC-F-041). One call carries a full attempt: realtime NDJSON (rung A)
// → async run + poll every 3 s (rung B). A realtime run that established a run_id is NEVER
// re-created: the fallback polls that same run ("never duplicate completed runs casually").
// Failures are typed; configuration errors surface honestly (retryable: false); no CREAO output
// is ever faked. The app path (agent.creao.ai trigger) is async-only by design (documented gap).
import type { DeptId, ErrorCode } from '@hc/contracts';
import { creao } from '../../../../integrations/index.mjs';
import { createMayor } from '../mayor';
import { buildRoleInput, roleKinds } from './inputs';
import { parseAgentOutput } from './parse';
import type { Mayor } from '../mayor';
import type { Worker, WorkerEvent, WorkerInput, WorkerResult } from './index';

export type CreaoWorkerOptions = {
  /** Async poll cadence in ms. PRD HC-F-041: 3 s. Tests may shrink this. */
  intervalMs?: number;
  /** Rung A watchdog: no stream event within this window switches rungs (§11.5: 90 s). */
  noEventTimeoutMs?: number;
  /** Synthetic `agent.progress` heartbeat while in the async rung: every 10 s. */
  progressIntervalMs?: number;
  /** Initial transient HTTP backoff (test override). Production starts at 10 s. */
  retryDelayMs?: number;
  /** Mayor used for the (single) repair step; defaults to createMayor(). */
  mayor?: Mayor;
};

type Completion =
  | { ok: true; raw: string; credits: number | null }
  | { ok: false; error: { code: ErrorCode; message: string }; retryable: boolean; credits?: number|null };

type StreamOutcome =
  | { status: 'completed'; raw: string; credits: number | null }
  | { status: 'aborted' }
  | { status: 'stream-ended'; runId: string | null; message: string }
  | { status: 'run-failed'; message: string; credits: number | null };

type Config = { mode: 'account' | 'app'; agentId: string; apiKey: string; missing: string[] };

export function creaoConfig(agent: DeptId): Config {
  const role = agent.toUpperCase();
  const mode = process.env.CREAO_API_MODE === 'account' ? 'account' : 'app';
  const missing: string[] = [];
  if (mode === 'app') {
    const appId = process.env[`CREAO_${role}_APP_ID`]?.trim() ?? '';
    const apiKey = process.env[`CREAO_${role}_APP_KEY`]?.trim() || process.env.CREAO_APP_KEY?.trim() || process.env.CREAO_API_KEY?.trim() || '';
    if (!appId) missing.push(`CREAO_${role}_APP_ID`);
    if (!apiKey) missing.push(`CREAO_${role}_APP_KEY or CREAO_APP_KEY`);
    return { mode, agentId: appId, apiKey, missing };
  }
  const agentId = process.env[`CREAO_${role}_AGENT_ID`]?.trim() ?? '';
  const apiKey = process.env.CREAO_API_KEY?.trim() || '';
  if (!agentId) missing.push(`CREAO_${role}_AGENT_ID`);
  if (!apiKey) missing.push('CREAO_API_KEY (cr_sk_)');
  return { mode, agentId, apiKey, missing };
}

export function createCreaoWorker(agent: DeptId, opts: CreaoWorkerOptions = {}): Worker {
  const intervalMs = opts.intervalMs ?? 3_000;
  const noEventTimeoutMs = opts.noEventTimeoutMs ?? 90_000;
  const heartbeatMs = opts.progressIntervalMs ?? 10_000;
  const mayor = opts.mayor ?? createMayor();

  return {
    async run(input: WorkerInput, onEvent: (e: WorkerEvent) => void, signal: AbortSignal): Promise<WorkerResult> {
      const deliverable = input.task.deliverable;
      if (!(roleKinds as readonly string[]).includes(deliverable)) return fail('unknown', `task deliverable ${deliverable} is not a CREAO role`, false);
      const kind = deliverable as Exclude<typeof deliverable, 'brief'>;
      const config = creaoConfig(agent);
      if (config.missing.length) return fail('upstream', `CREAO configuration incomplete for ${agent}: ${config.missing.join(', ')}`, false);

      const roleInput = buildRoleInput(input, config.mode);
      const envelope = process.env.CREAO_INPUT_AS_REQUEST === '1' ? { request: JSON.stringify(roleInput) } : roleInput;
      const ctx: Ctx = { employer: agent, kind, mayor, signal, onEvent, onStarted: startedOnce(onEvent), intervalMs, heartbeatMs, retryDelayMs: opts.retryDelayMs ?? 10_000 };

      if (config.mode === 'app') {
        // Documented limitation: the app trigger has no realtime endpoint we can verify, so the
        // app path starts at rung B directly and relies on its heartbeat for progress.
        return await createAndPollAttempt(ctx, config, envelope);
      }

      const stream = await streamRealtime(ctx, config, envelope, noEventTimeoutMs);
      if (stream.status === 'completed') {
        const parsed = await parseAgentOutput(kind, stream.raw, ctx.mayor);
        return parsed.ok
          ? { ok: true, payload: parsed.payload, credits: stream.credits, raw: stream.raw, via: 'creao-realtime', mayorUsage: parsed.usage ?? undefined }
          : { ...fail('unparseable', `${agent}: ${parsed.reason}`, false), credits: stream.credits, mayorUsage: parsed.usage ?? undefined };
      }
      if (stream.status === 'run-failed') return { ...fail('upstream', `CREAO run failed mid-stream: ${stream.message}`, true), credits: stream.credits };
      if (stream.status === 'aborted') return fail('cancelled', 'aborted by executor during realtime run', false);

      // stream-ended: converge on the SAME run if one exists, else create exactly one async run.
      if (signal.aborted) return fail('cancelled', 'aborted by executor before CREAO finished', false);
      if (stream.runId) {
        const sameRun = await pollUntilTerminal(ctx, config, stream.runId, 'account');
        if (sameRun.ok) {
          const parsed = await parseAgentOutput(kind, sameRun.raw, ctx.mayor);
          return parsed.ok
            ? { ok: true, payload: parsed.payload, credits: sameRun.credits, raw: sameRun.raw, via: 'creao-async', mayorUsage: parsed.usage ?? undefined }
            : { ...fail('unparseable', `${agent}: ${parsed.reason}`, false), credits: sameRun.credits, mayorUsage: parsed.usage ?? undefined };
        }
        return sameRun;
      }
      return await createAndPollAttempt(ctx, config, envelope);
    },
  };
}

// ------------------------------------------------------------------------------------------------
// internals
// ------------------------------------------------------------------------------------------------

type Ctx = {
  employer: DeptId;
  kind: 'research' | 'site' | 'launch_kit';
  mayor: Mayor;
  signal: AbortSignal;
  onEvent: (e: WorkerEvent) => void;
  onStarted: (externalRunId: string | undefined) => void;
  intervalMs: number;
  heartbeatMs: number;
  retryDelayMs: number;
};

// One trigger key can back several apps. Reserve shared request slots so the
// parallel DAG does not multiply the account's polling rate.
const nextRequestAt = new Map<string, number>();
async function pace(ctx: Ctx, config: Config): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextRequestAt.get(config.apiKey) ?? 0);
  nextRequestAt.set(config.apiKey, slot + Math.min(ctx.intervalMs, 2500));
  await sleepOrAbort(Math.max(0, slot - now), ctx.signal);
}
function transientStatus(error: unknown): number | null {
  const status = (error as { status?: number } | null)?.status;
  return status === 429 || (typeof status === 'number' && status >= 500) ? status : null;
}
async function backoff(ctx: Ctx, config: Config, attempt: number, status: number, error?: unknown) {
  const reported = (error as { retryAfterMs?: number } | null)?.retryAfterMs;
  const ms = Math.max(Math.min(ctx.retryDelayMs * 2 ** Math.min(attempt, 3), 60_000), typeof reported === 'number' && Number.isFinite(reported) ? Math.min(Math.max(0, reported), 360_000) : 0);
  nextRequestAt.set(config.apiKey, Math.max(nextRequestAt.get(config.apiKey) ?? 0, Date.now() + ms));
  ctx.onEvent({ kind: 'progress', note: status === 429 ? 'CREAO rate limit; waiting before trying again.' : 'CREAO temporarily unavailable; retrying the same run.' });
  await sleepOrAbort(ms, ctx.signal);
}

function fail(code: ErrorCode, message: string, retryable: boolean): Extract<WorkerResult,{ok:false}> {
  return { ok: false, error: { code, message }, retryable };
}

function startedOnce(onEvent: (e: WorkerEvent) => void): (externalRunId: string | undefined) => void {
  let fired = false;
  return (externalRunId) => {
    if (fired) return;
    fired = true;
    onEvent(externalRunId ? { kind: 'started', externalRunId } : { kind: 'started' });
  };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message || err.name : String(err);
}

function asId(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function creditsOf(run: Record<string, unknown> | undefined): number | null {
  const usage = run?.usage as { credits?: unknown } | undefined;
  const credits = usage?.credits;
  return typeof credits === 'number' && Number.isFinite(credits) && credits > 0 ? credits : null;
}

function errorMessageOf(ev: Record<string, unknown>): string {
  const err = ev.error ?? ev;
  if (typeof err === 'string') return err.slice(0, 300);
  if (err && typeof err === 'object') {
    const m = (err as Record<string, unknown>).message ?? (err as Record<string, unknown>).description;
    if (typeof m === 'string') return m.slice(0, 300);
  }
  return 'unknown CREAO error';
}

/** Extract the final textual output from a run payload; tolerate wrappers around `result`.
 * App-trigger GET shape: result.text, possibly result.chatText (task card §18). */
function finalRawOf(run: Record<string, unknown>): string {
  const direct = run.result;
  if (typeof direct === 'string') return direct;
  const nested = direct && typeof direct === 'object' ? (direct as Record<string, unknown>) : null;
  // App form results can be only a short summary/count object. The full
  // assistant response contains the required final fenced role payload.
  if (nested && typeof nested.chatText === 'string' && nested.chatText.trim()) return nested.chatText;
  if (nested && typeof nested.result === 'string') return nested.result;
  if (nested && typeof nested.text === 'string') return nested.text;
  if (typeof run.chatText === 'string') return run.chatText;
  if (direct === undefined || direct === null) return '';
  return JSON.stringify(direct);
}

/** Typed failure mapping for thrown errors (external abort / timeout / 429-5xx / other). */
function errorToFailure(signal: AbortSignal, err: unknown): { code: ErrorCode; message: string; retryable: boolean } {
  const message = messageOf(err);
  if (signal.aborted) return { code: 'cancelled', message: 'aborted by executor', retryable: false };
  if (err instanceof Error && err.name === 'AbortError') return { code: 'cancelled', message, retryable: false };
  if (/timed out/i.test(message)) return { code: 'timeout', message, retryable: false };
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === 'number' && (status === 429 || status >= 500)) return { code: 'upstream', message, retryable: true };
  return { code: 'upstream', message, retryable: false };
}

// --- rung A: realtime NDJSON -------------------------------------------------------------------

async function streamRealtime(ctx: Ctx, config: Config, envelope: unknown, noEventTimeoutMs: number): Promise<StreamOutcome> {
  const signal = ctx.signal;
  if (signal.aborted) return { status: 'aborted' };
  const controller = new AbortController();
  const relay = () => controller.abort();
  signal.addEventListener('abort', relay, { once: true });
  let watchedOut = false;
  const watchdog: { timer: ReturnType<typeof setTimeout> | undefined; disarm(): void; reset(): void } = {
    timer: undefined,
    disarm() {
      if (watchdog.timer) clearTimeout(watchdog.timer);
      watchdog.timer = undefined;
    },
    reset() {
      if (watchdog.timer) clearTimeout(watchdog.timer);
      watchdog.timer = setTimeout(() => {
        watchdog.timer = undefined;
        watchedOut = true;
        controller.abort();
      }, noEventTimeoutMs);
    },
  };

  try {
    const res = (await creao.createRealtimeRun(config.agentId, envelope, { signal: controller.signal })) as unknown as { body?: ReadableStream<Uint8Array> };
    if (!res?.body) throw new Error('CREAO realtime response has no body');
    watchdog.reset();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let carry = '';
    let runId: string | null = null;
    let finalRaw: string | null = null;
    let credits: number | null = null;
    let failedMessage: string | null = null;
    let chars = 0;
    let lastProgressAt = 0;

    const map = (ev: Record<string, unknown>): 'continue' | 'completed' | 'failed' => {
      const type = typeof ev.type === 'string' ? ev.type : typeof ev.event === 'string' ? ev.event : '';
      if (type === 'run.created') {
        runId = asId(ev.run_id) ?? asId(ev.id) ?? runId;
        ctx.onStarted(runId ?? undefined);
        return 'continue';
      }
      if (type === 'tool.started') {
        const tool = typeof ev.tool === 'string' ? ev.tool : 'tool';
        const label = typeof ev.title === 'string' && ev.title ? ev.title.slice(0, 80) : tool.slice(0, 80);
        ctx.onEvent({ kind: 'tool', tool, label });
        return 'continue';
      }
      if (type === 'search.started') {
        // search.* maps to its own label form and is never folded into the tool branch (HC-F-041).
        const query = typeof ev.query === 'string' && ev.query ? ev.query : '';
        const label = query ? `Searching: ${query}`.slice(0, 80) : 'Searching the web';
        ctx.onEvent({ kind: 'tool', tool: 'search', label });
        return 'continue';
      }
      if (type === 'output_text.delta') {
        chars += typeof ev.delta === 'string' ? ev.delta.length : 0;
        const now = Date.now();
        if (now - lastProgressAt >= 1_000) {
          lastProgressAt = now;
          ctx.onEvent({ kind: 'progress', note: `Writing… ${chars} chars so far` });
        }
        return 'continue';
      }
      if (type === 'artifact.created') {
        ctx.onEvent({ kind: 'progress', note: `Artifact: ${String(ev.title ?? ev.kind ?? 'saved').slice(0, 80)}` });
        return 'continue';
      }
      if (type === 'run.completed') {
        finalRaw = finalRawOf(ev as Record<string, unknown>);
        credits = creditsOf(ev as Record<string, unknown>);
        return 'completed';
      }
      if (type === 'run.failed') {
        failedMessage = errorMessageOf(ev);
        return 'failed';
      }
      if (type === 'error') {
        if (runId) return 'continue'; // converge by polling the established run instead
        failedMessage = errorMessageOf(ev);
        return 'failed';
      }
      return 'continue'; // ping | message.created | thinking.* | todo.updated | unknown → ignored
    };

    const handleLine = (line: string): 'completed' | 'failed' | 'continue' | 'malformed' => {
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return 'malformed';
      }
      return map(ev);
    };

    for (;;) {
      const chunk = await reader.read();
      watchdog.reset(); // any bytes at all prove the stream is alive
      carry += chunk.value ? decoder.decode(chunk.value, { stream: true }) : '';
      let newlineAt = carry.indexOf('\n');
      while (newlineAt >= 0) {
        const line = carry.slice(0, newlineAt).trim();
        carry = carry.slice(newlineAt + 1);
        newlineAt = carry.indexOf('\n');
        if (!line) continue;
        const outcome = handleLine(line);
        if (outcome === 'completed') {
          watchdog.disarm();
          return { status: 'completed', raw: finalRaw ?? '', credits };
        }
        if (outcome === 'failed') {
          watchdog.disarm();
          return { status: 'run-failed', message: failedMessage ?? 'CREAO run failed', credits };
        }
      }
      if (chunk.done) {
        const tail = carry.trim();
        carry = '';
        if (tail) {
          const outcome = handleLine(tail);
          if (outcome === 'completed') {
            watchdog.disarm();
            return { status: 'completed', raw: finalRaw ?? '', credits };
          }
          if (outcome === 'failed') {
            watchdog.disarm();
            return { status: 'run-failed', message: failedMessage ?? 'CREAO run failed', credits };
          }
        }
        watchdog.disarm();
        return { status: 'stream-ended', runId, message: 'CREAO realtime stream ended without a terminal event' };
      }
    }
  } catch (err) {
    watchdog.disarm();
    if (signal.aborted) return { status: 'aborted' };
    if (watchedOut) return { status: 'stream-ended', runId: null, message: `no CREAO realtime event within ${noEventTimeoutMs} ms` };
    return { status: 'stream-ended', runId: null, message: messageOf(err) };
  } finally {
    signal.removeEventListener('abort', relay);
    watchdog.disarm();
  }
}

// --- rung B: create + poll, or poll an existing run ----------------------------------------------

async function createAndPollAttempt(ctx: Ctx, config: Config, envelope: unknown): Promise<WorkerResult> {
  const { signal } = ctx;
  try {
    let started;
    for (let rejected = 0;; rejected++) {
      await pace(ctx, config);
      try {
        started = config.mode === 'account'
          ? await creao.createRun(config.agentId, envelope)
          : await creao.createAppRunWith(config.agentId, config.apiKey, envelope, { signal });
        break;
      } catch (error) {
        // A 429 explicitly rejects creation. Do not retry ambiguous POST 5xx.
        if (transientStatus(error) !== 429 || rejected >= 2) throw error;
        await backoff(ctx, config, rejected, 429, error);
      }
    }
    const runId = asId((started as Record<string, unknown>)?.run_id) ?? asId((started as Record<string, unknown>)?.id);
    ctx.onStarted(runId ?? undefined);
    if (!runId) return fail('upstream', 'CREAO did not return a run id for the async run', true);
    const completion = await pollUntilTerminal(ctx, config, runId, config.mode);
    if (!completion.ok) return completion;
    const parsed = await parseAgentOutput(ctx.kind, completion.raw, ctx.mayor);
    return parsed.ok
      ? { ok: true, payload: parsed.payload, credits: completion.credits, raw: completion.raw, via: 'creao-async', mayorUsage: parsed.usage ?? undefined }
      : { ...fail('unparseable', `${ctx.employer}: ${parsed.reason}`, false), credits: completion.credits, mayorUsage: parsed.usage ?? undefined };
  } catch (err) {
    const f = errorToFailure(signal, err);
    return fail(f.code, f.message, f.retryable);
  }
}

/** Poll an EXISTING run (rung B after a realtime stream ended; never creates a duplicate). */
async function pollUntilTerminal(ctx: Ctx, config: Config, runId: string, mode: 'account' | 'app'): Promise<Completion> {
  const signal = ctx.signal;
  ctx.onStarted(runId);
  const heartbeatEvery = Math.max(Math.round(ctx.heartbeatMs / Math.max(ctx.intervalMs, 1)), 1);
  let polls = 0;
  let transientFailures = 0;
  try {
    for (;;) {
      if (signal.aborted) throw abortError(`poll of CREAO run ${runId} aborted`);
      await pace(ctx, config);
      let run;
      try {
        run = mode === 'account'
          ? await creao.getRun(runId)
          : await creao.getAppRunWith(config.agentId, config.apiKey, runId, { signal });
        transientFailures = 0;
      } catch (error) {
        const status = transientStatus(error) ?? (error instanceof Error && /timed out|timeout|fetch failed|network|ECONN|ENOTFOUND/i.test(error.message) ? 503 : null);
        if (status === null || signal.aborted) throw error;
        await backoff(ctx, config, transientFailures++, status, error);
        continue; // Keep polling this exact external run; never create another.
      }
      const record = (run ?? {}) as Record<string, unknown>;
      const status = typeof record.status === 'string' ? record.status.toLowerCase() : '';
      polls++;
      if (polls % heartbeatEvery === 0) ctx.onEvent({ kind: 'progress', note: 'Running (async)…' });
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        ctx.onStarted(runId);
        return finalizeRunRecord(record);
      }
      await sleepOrAbort(ctx.intervalMs, signal);
    }
  } catch (err) {
    const f = errorToFailure(signal, err);
    return { ok: false, error: { code: f.code, message: f.message }, retryable: f.retryable };
  }
}

function finalizeRunRecord(run: Record<string, unknown>): Completion {
  const status = typeof run.status === 'string' ? run.status.toLowerCase() : '';
  const credits = creditsOf(run);
  if (status === 'completed') return { ok: true, raw: finalRawOf(run), credits };
  if (status === 'failed') return { ok: false, error: { code: 'upstream', message: `CREAO run failed: ${errorMessageOf(run)}` }, retryable: true, credits };
  if (status === 'cancelled') return { ok: false, error: { code: 'cancelled', message: 'CREAO run was cancelled upstream' }, retryable: false, credits };
  return { ok: false, error: { code: 'upstream', message: `CREAO run ended with status ${status || 'unknown'}` }, retryable: false };
}

function abortError(message: string): Error {
  const e = new Error(message);
  e.name = 'AbortError';
  return e;
}

async function sleepOrAbort(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  if (signal.aborted) throw abortError('aborted by executor');
}
