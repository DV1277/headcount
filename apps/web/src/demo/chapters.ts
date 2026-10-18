import type { AgentId, EventEnvelope } from '@hc/contracts';

export type DemoView =
  | 'town'
  | 'plan'
  | 'agent'
  | 'research'
  | 'org'
  | 'logs'
  | 'site'
  | 'launch'
  | 'final';

export type DemoChapter = {
  id: string;
  title: string;
  detail: string;
  t: number;
  view: DemoView;
  agent?: AgentId;
  artifactId?: string;
  holdMs: number;
};

type AnyEvent = EventEnvelope;

const byType = <T extends AnyEvent['type']>(
  events: readonly AnyEvent[],
  type: T,
): Extract<AnyEvent, { type: T }>[] =>
  events.filter(
    (e): e is Extract<AnyEvent, { type: T }> => e.type === type,
  );

const firstByType = <T extends AnyEvent['type']>(
  events: readonly AnyEvent[],
  type: T,
): Extract<AnyEvent, { type: T }> | undefined => byType(events, type)[0];

const clip = (value: string, max = 140): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

export function buildDemoChapters(events: readonly EventEnvelope[]): DemoChapter[] {
  if (events.length === 0) return [];

  const runCreated = firstByType(events, 'run.created');
  const mayorPlanning = byType(events, 'mayor.thinking').find(
    (e) => e.data.phase === 'plan',
  );
  const planProposed = firstByType(events, 'plan.proposed');
  const planApproved = firstByType(events, 'plan.approved');
  const starts = byType(events, 'task.started');
  const verdicts = byType(events, 'review.verdict');
  const revisings = byType(events, 'task.revising');
  const completions = byType(events, 'task.completed');
  const handoffs = byType(events, 'handoff');
  const redirect = firstByType(events, 'founder.redirect');
  const briefReady = firstByType(events, 'brief.ready');
  const runCompleted = firstByType(events, 'run.completed');

  const created = new Map<string, { t: number; kind: string; title: string; agent: AgentId }>();
  for (const e of byType(events, 'artifact.created')) {
    if (!created.has(e.data.artifact.id)) {
      created.set(e.data.artifact.id, {
        t: e.t,
        kind: e.data.artifact.kind,
        title: e.data.artifact.title,
        agent: e.data.artifact.agent,
      });
    }
  }
  const existsAt = (id: string, t: number): boolean => {
    const known = created.get(id);
    return known !== undefined && known.t <= t;
  };

  const planTasks =
    planProposed?.data.plan.tasks ?? planApproved?.data.plan.tasks ?? [];
  const taskTitle = (taskId: string): string =>
    planTasks.find((task) => task.id === taskId)?.title ?? taskId;

  const scoutStart = starts.find((e) => e.data.agent === 'scout');
  const makerStart = starts.find((e) => e.data.agent === 'maker');
  const heraldStart = starts.find((e) => e.data.agent === 'herald');

  const firstReviseVerdict = verdicts.find((v) => v.data.verdict === 'revise');
  const firstRevisionT =
    firstReviseVerdict?.t ?? revisings[0]?.t ?? -1;

  const researchAccepted = completions.find(
    (c) => created.get(c.data.artifactId)?.kind === 'research',
  );
  const siteAccepted = [...completions]
    .reverse()
    .find((c) => created.get(c.data.artifactId)?.kind === 'site');
  const launchAccepted = [...completions]
    .reverse()
    .find((c) => created.get(c.data.artifactId)?.kind === 'launch_kit');

  const siteRevision = verdicts.find(
    (v) =>
      v.data.verdict === 'revise' &&
      v.t !== firstRevisionT &&
      created.get(v.data.artifactId)?.kind === 'site',
  );

  const openingT = runCreated?.t ?? events[0].t;
  const idea = runCreated?.data.idea ?? 'a late-night boba delivery idea';

  const candidates: (DemoChapter | null)[] = [];

  candidates.push({
    id: 'opening',
    title: 'The founder prompt',
    detail: `Founder prompt: "${clip(idea, 120)}"`,
    t: openingT,
    view: 'town',
    holdMs: 0,
  });

  if (mayorPlanning) {
    candidates.push({
      id: 'mayor-planning',
      title: 'Mayor drafts the work plan',
      detail: 'Mayor starts planning the town workload.',
      t: mayorPlanning.t,
      view: 'agent',
      agent: 'mayor',
      holdMs: 4000,
    });
  }

  if (planProposed) {
    const count = planProposed.data.plan.tasks.length;
    candidates.push({
      id: 'plan-proposed',
      title: 'Work plan proposed',
      detail: `Mayor proposes "${clip(planProposed.data.plan.title, 80)}" with ${count} tasks, before approval.`,
      t: planProposed.t,
      view: 'plan',
      agent: 'mayor',
      holdMs: 5000,
    });
  }

  if (planApproved) {
    candidates.push({
      id: 'plan-approved',
      title: 'Founder approves the plan',
      detail: planApproved.data.edited
        ? 'founder approves the edited plan and work begins.'
        : 'founder approves the plan and work begins.',
      t: planApproved.t,
      view: 'plan',
      agent: 'founder',
      holdMs: 4000,
    });
  }

  if (scoutStart) {
    candidates.push({
      id: 'scout-research',
      title: 'Scout starts research',
      detail: `Scout starts "${clip(taskTitle(scoutStart.data.taskId), 80)}".`,
      t: scoutStart.t,
      view: 'agent',
      agent: 'scout',
      holdMs: 5000,
    });
  }

  if (firstReviseVerdict) {
    candidates.push({
      id: 'first-revision',
      title: 'First review sends it back',
      detail: `Mayor requests a revision: "${clip(firstReviseVerdict.data.note, 100)}"`,
      t: firstReviseVerdict.t,
      view: 'research',
      agent: created.get(firstReviseVerdict.data.artifactId)?.agent ?? 'scout',
      artifactId: firstReviseVerdict.data.artifactId,
      holdMs: 5000,
    });
  } else if (revisings[0]) {
    candidates.push({
      id: 'first-revision',
      title: 'First revision requested',
      detail: `Mayor requests a revision: "${clip(revisings[0].data.note, 100)}"`,
      t: revisings[0].t,
      view: 'research',
      agent: 'scout',
      holdMs: 5000,
    });
  }

  if (researchAccepted) {
    const meta = created.get(researchAccepted.data.artifactId);
    candidates.push({
      id: 'research-accepted',
      title: 'Research accepted',
      detail: `research accepted: ${clip(meta?.title ?? taskTitle(researchAccepted.data.taskId), 80)}.`,
      t: researchAccepted.t,
      view: 'research',
      agent: meta?.agent ?? 'scout',
      artifactId: researchAccepted.data.artifactId,
      holdMs: 5000,
    });
  }

  if (handoffs[0]) {
    const group = handoffs.filter(
      (h) =>
        h.data.artifactId === handoffs[0].data.artifactId &&
        h.t < handoffs[0].t + 1000,
    );
    const routes = group
      .map((h) => `${h.data.from}→${h.data.to}`)
      .join(', ');
    candidates.push({
      id: 'handoffs',
      title: 'Research handed off',
      detail: `research routes onward (${clip(routes, 80)}).`,
      t: Math.max(...group.map((h) => h.t)),
      view: 'org',
      artifactId: handoffs[0].data.artifactId,
      holdMs: 4000,
    });
  }

  const parallelStarts = [makerStart, heraldStart].filter(
    (s): s is NonNullable<typeof s> => s !== undefined,
  );
  if (parallelStarts.length > 0) {
    const latest = parallelStarts.reduce((a, b) => (a.t >= b.t ? a : b));
    const parts = parallelStarts.map(
      (s) => `${s.data.agent} starts "${clip(taskTitle(s.data.taskId), 60)}"`,
    );
    candidates.push({
      id: 'parallel-build',
      title: 'Maker and Herald build in parallel',
      detail: `${clip(parts.join('; '), 130)}`,
      t: latest.t,
      view: 'agent',
      agent: 'maker',
      holdMs: 5000,
    });
  }

  if (siteRevision) {
    candidates.push({
      id: 'site-revision',
      title: 'Site sent back for revision',
      detail: `Mayor requests a site revision: "${clip(siteRevision.data.note, 100)}"`,
      t: siteRevision.t,
      view: 'site',
      agent: 'maker',
      artifactId: siteRevision.data.artifactId,
      holdMs: 5000,
    });
  }

  if (redirect) {
    candidates.push({
      id: 'founder-redirect',
      title: 'Founder redirects Herald',
      detail: `founder to ${redirect.data.agent}: "${clip(redirect.data.note, 110)}"`,
      t: redirect.t,
      view: 'logs',
      agent: redirect.data.agent,
      holdMs: 6000,
    });
  }

  if (siteAccepted) {
    const meta = created.get(siteAccepted.data.artifactId);
    candidates.push({
      id: 'site-accepted',
      title: 'Final site accepted',
      detail: `final site accepted: ${clip(meta?.title ?? 'waitlist landing page', 80)}.`,
      t: siteAccepted.t,
      view: 'site',
      agent: meta?.agent ?? 'maker',
      artifactId: siteAccepted.data.artifactId,
      holdMs: 5000,
    });
  }

  if (launchAccepted) {
    const meta = created.get(launchAccepted.data.artifactId);
    candidates.push({
      id: 'launch-accepted',
      title: 'Launch kit accepted',
      detail: `launch kit accepted: ${clip(meta?.title ?? 'launch outreach', 80)}.`,
      t: launchAccepted.t,
      view: 'launch',
      agent: meta?.agent ?? 'herald',
      artifactId: launchAccepted.data.artifactId,
      holdMs: 5000,
    });
  }

  const finalT = runCompleted?.t;
  if (finalT !== undefined) {
    const siteUrl = runCompleted?.data.siteUrl;
    candidates.push({
      id: 'founder-brief',
      title: 'Founder brief and finale',
      detail: briefReady
        ? `founder brief ready.${siteUrl ? ` Site: ${siteUrl}` : ''}`
        : `Run complete.${siteUrl ? ` Site: ${siteUrl}` : ''}`,
      t: finalT,
      view: 'final',
      agent: 'mayor',
      artifactId: briefReady?.data.artifactId,
      holdMs: 0,
    });
  }

  const chapters: DemoChapter[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const prev = chapters[chapters.length - 1];
    if (prev && !(candidate.t > prev.t)) continue;
    if (candidate.artifactId && !existsAt(candidate.artifactId, candidate.t)) {
      const rest: DemoChapter = {
        id: candidate.id,
        title: candidate.title,
        detail: candidate.detail,
        t: candidate.t,
        view: candidate.view,
        holdMs: candidate.holdMs,
      };
      if (candidate.agent) rest.agent = candidate.agent;
      chapters.push(rest);
      continue;
    }
    chapters.push(candidate);
  }
  return chapters;
}
