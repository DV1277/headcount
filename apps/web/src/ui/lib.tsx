import { useState } from 'react';
import { ROSTER, type AgentId, type ArtifactKind, type EventEnvelope, type TaskStatus } from '@hc/contracts';
import type { TownState } from '@hc/engine';

export type StatusTone = 'ok' | 'warn' | 'err' | 'info' | 'muted';

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function eventAgent(event: EventEnvelope): AgentId {
  const data = event.data as { agent?: unknown; from?: unknown; to?: unknown; artifact?: { agent?: unknown } };
  const named = (value: unknown): value is AgentId => typeof value === 'string' && value in ROSTER;
  if (named(data.agent)) return data.agent;
  if (named(data.from)) return data.from;
  if (data.artifact && named(data.artifact.agent)) return data.artifact.agent;
  if (event.type.startsWith('founder')) return 'founder';
  return 'mayor';
}

export function taskTitle(taskId: string | null | undefined, state: TownState): string {
  if (!taskId) return 'a task';
  return state.tasks[taskId]?.def.title ?? taskId;
}

export function artifactTitle(artifactId: string, state: TownState): string {
  return state.artifacts[artifactId]?.title ?? artifactId;
}

export function sourceLabel(source: 'model' | 'repaired' | 'template' | null | undefined): string {
  if (source === 'repaired') return 'Repaired plan';
  if (source === 'template') return 'Standard plan';
  return "Mayor's plan";
}

export function viaLabel(via: string | undefined): string {
  switch (via) {
    case 'creao-realtime': return 'CREAO agent';
    case 'creao-async': return 'CREAO agent · async run';
    case 'mayor-cover': return 'Covered by Mayor';
    case 'mock': return 'Mock run';
    default: return 'Agent work';
  }
}

export function viaNote(via: string | undefined): string {
  if (via === 'mayor-cover') return ', covered by the Mayor';
  if (via === 'mock') return ', mock run';
  if (via === 'creao-async') return ', async CREAO run';
  return '';
}

export const KIND_META: Record<ArtifactKind, { icon: string; label: string }> = {
  research: { icon: '📜', label: 'Research' },
  site: { icon: '🌐', label: 'Site' },
  launch_kit: { icon: '📣', label: 'Launch kit' },
  brief: { icon: '🧠', label: 'Brief' },
};

export const DELIVERABLE_LABEL: Record<ArtifactKind, string> = { research: 'Research', site: 'Site', launch_kit: 'Launch', brief: 'Brief' };

export type PillMeta = { tone: StatusTone; word: string; icon: 'check' | 'hourglass' | 'bang' | 'dot' | 'ring' };
/** Status pill content for a deliverable's task: always an icon plus a word, never color alone (HC-N-033). */
export function pillFor(status: TaskStatus | null | undefined): PillMeta {
  switch (status) {
    case 'accepted': return { tone: 'ok', word: 'accepted', icon: 'check' };
    case 'submitted': case 'under_review': return { tone: 'warn', word: 'in review', icon: 'hourglass' };
    case 'revising': return { tone: 'warn', word: 'revising', icon: 'hourglass' };
    case 'failed': return { tone: 'err', word: 'failed', icon: 'bang' };
    case 'working': case 'dispatched': case 'covered': return { tone: 'info', word: 'working', icon: 'dot' };
    case 'skipped': return { tone: 'muted', word: 'skipped', icon: 'ring' };
    default: return { tone: 'muted', word: 'waiting', icon: 'ring' };
  }
}

/** The town's storybook clock: a run starts at 9:00 and one real second is twenty town seconds. */
export function simClock(ms: number): string {
  const minutes = 9 * 60 + Math.floor(Math.max(0, ms) / 1000 * 20 / 60);
  return `${Math.floor(minutes / 60) % 24}:${String(minutes % 60).padStart(2, '0')}`;
}

/** "Pink or midnight blue?" → ['Pink', 'Midnight blue']. Returns [] when the question is open-ended. */
export function parseChoices(text: string): string[] {
  const sentence = text.trim().split(/(?<=[.!?])\s+/).filter((part) => part.endsWith('?')).pop();
  if (!sentence || !/\bor\b/i.test(sentence)) return [];
  const body = sentence.replace(/\?$/, '');
  const orAt = body.search(/\s+or\s+/i);
  const last = body.slice(orAt).replace(/^\s+or\s+/i, '');
  // Everything before "or", from the last colon or comma-delimited list start.
  const head = body.slice(0, orAt).split(/[:;]/).pop() ?? '';
  const parts = head.split(',').map((part) => part.trim());
  const options = [...(parts.length > 1 ? parts : [parts[0]]), last].map((option) => option.trim().replace(/^(?:a|an|the)\s+/i, '')).filter(Boolean);
  // A long head ("Juno wants a color for the site, pink") is a lead-in, not an option.
  const trimmed = options.length === 3 && options[0].split(' ').length > 4 ? options.slice(1) : options;
  if (trimmed.length < 2 || trimmed.length > 3 || trimmed.some((option) => option.length > 32 || option.split(' ').length > 4)) return [];
  return trimmed.map((option) => option[0].toUpperCase() + option.slice(1));
}

const SWATCHES: Record<string, string> = {
  pink: '#F2A7C3', 'midnight blue': '#1F2A5A', blue: '#3D7DD8', navy: '#1F2A5A', green: '#3E9B57', red: '#D64545',
  orange: '#F08A3C', purple: '#8C6CF2', yellow: '#F2C94C', teal: '#3FB8AF', cream: '#F6EFE1', black: '#1D1A2B', white: '#FFFFFF',
};
export const swatchFor = (option: string): string | null => SWATCHES[option.toLowerCase()] ?? null;

export function taskStatusMeta(status: TaskStatus): { icon: string; word: string; tone: StatusTone } {
  switch (status) {
    case 'accepted': return { icon: '✓', word: 'accepted', tone: 'ok' };
    case 'failed': return { icon: '✕', word: 'failed', tone: 'err' };
    case 'revising': return { icon: '↻', word: 'revising', tone: 'warn' };
    case 'blocked': return { icon: '⧗', word: 'waiting on inputs', tone: 'warn' };
    case 'submitted': return { icon: '⧗', word: 'awaiting review', tone: 'warn' };
    case 'under_review': return { icon: '⧗', word: 'under review', tone: 'warn' };
    case 'dispatched': return { icon: '→', word: 'on the way', tone: 'info' };
    case 'working': return { icon: '⚙', word: 'working', tone: 'info' };
    case 'covered': return { icon: '⚙', word: 'covered by Mayor', tone: 'info' };
    case 'skipped': return { icon: '—', word: 'skipped', tone: 'muted' };
    default: return { icon: '·', word: status, tone: 'muted' };
  }
}

export type UrlKind = 'none' | 'local' | 'lan' | 'public';
export const ILLUSTRATIVE_RECORDINGS=['fixture:golden-boba','fixture:failure-retry','fixture:redirect'];
export const isIllustrativeRecording=(source:string)=>ILLUSTRATIVE_RECORDINGS.includes(source);

export function safeWebHref(value:string):string|undefined {
  try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:undefined;}catch{return undefined;}
}

export function publicUrlKind(url: string | null | undefined): UrlKind {
  if (!url) return 'none';
  let parsed: URL;
  try { parsed = new URL(url); } catch { return 'none'; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'none';
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host.endsWith('.invalid') || host.endsWith('.example') || ['example.com','example.net','example.org'].some(example => host === example || host.endsWith(`.${example}`))) return 'none';
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host.endsWith('.localhost')) return 'local';
  if (/^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.endsWith('.local')) return 'lan';
  return 'public';
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch { return false; }
}

export function downloadText(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function artifactFileName(id: string, kind: ArtifactKind): string {
  const ext = kind === 'site' ? 'html' : kind === 'brief' ? 'md' : 'json';
  const safe = id.replace(/[^a-z0-9_-]+/gi, '-');
  return `${safe}.${ext}`;
}

export function describeEvent(e: EventEnvelope, state: TownState): string | null {
  const name = (id: AgentId) => ROSTER[id].name;
  switch (e.type) {
    case 'run.created': return `Idea received: “${e.data.idea}”`;
    case 'mayor.thinking': return `Mayor is thinking (${e.data.phase}${e.data.taskId ? ` · ${e.data.taskId}` : ''}).`;
    case 'founder.question': return `Mayor asks: “${e.data.text}”`;
    case 'founder.answer': return `You answered: “${e.data.text || '(skipped)'}”`;
    case 'plan.proposed': return `Plan ready for approval: “${e.data.plan.title}” · ${sourceLabel(e.data.source)} · ${e.data.plan.tasks.length} tasks.`;
    case 'plan.approved': return `Plan approved${e.data.edited ? ' (edited by you)' : ''}. The team is starting.`;
    case 'handoff': return `${name(e.data.from)} handed work to ${name(e.data.to)} · ${e.data.summary}`;
    case 'task.dispatched': return `${name(e.data.agent)} takes “${taskTitle(e.data.taskId, state)}” (attempt ${e.data.attempt}${viaNote(e.data.via)}).`;
    case 'task.started': return `${name(e.data.agent)} started “${taskTitle(e.data.taskId, state)}”.`;
    case 'agent.tool': return `${name(e.data.agent)} · ${e.data.label}`;
    case 'agent.progress': return `${name(e.data.agent)} · ${e.data.note}`;
    case 'agent.say': return `${name(e.data.agent)} says “${e.data.text}”`;
    case 'artifact.created': return `Deliverable created: “${e.data.artifact.title}” (${KIND_META[e.data.artifact.kind].label}${viaNote(e.data.artifact.via)}).`;
    case 'task.submitted': return `Submitted “${artifactTitle(e.data.artifactId, state)}” for the Mayor's review.`;
    case 'review.verdict': return e.data.verdict === 'accept'
      ? `Mayor accepted “${taskTitle(e.data.taskId, state)}”: “${e.data.note}”`
      : `Mayor asked one revision on “${taskTitle(e.data.taskId, state)}”: “${e.data.note}”`;
    case 'task.revising': return `Revision under way (${e.data.by === 'founder' ? 'founder note' : 'Mayor note'}): “${e.data.note}”`;
    case 'task.completed': return `“${taskTitle(e.data.taskId, state)}” accepted${e.data.revised ? ' (revised)' : ''}.`;
    case 'task.failed': return `${name(state.tasks[e.data.taskId]?.def.owner ?? 'mayor')} hit a problem on “${taskTitle(e.data.taskId, state)}”: ${e.data.error.message}${e.data.willRetry ? ' Retrying once.' : e.data.next === 'mayor-cover' ? ' The Mayor will cover it.' : ' Task skipped.'}`;
    case 'task.skipped': return `Skipped “${taskTitle(e.data.taskId, state)}” — ${e.data.reason}`;
    case 'founder.redirect': return `You redirected ${name(e.data.agent)}: “${e.data.note}”`;
    case 'run.paused': return 'Run paused. Sims freeze in place.';
    case 'run.resumed': return 'Run resumed.';
    case 'run.finishing': return 'All tasks settled. The Mayor is writing your founder brief.';
    case 'brief.ready': return 'Your founder brief is ready.';
    case 'run.completed': return `Run completed · ${e.data.stats.tasks} tasks · ${e.data.stats.handoffs} handoffs · ${e.data.stats.credits.toFixed(2)} cr · $${e.data.stats.usd.toFixed(2)}.`;
    case 'run.failed': return `Run failed: ${e.data.error.message}`;
    case 'payroll.tick': return null;
    default: return null;
  }
}

export function eventTone(e: EventEnvelope): StatusTone {
  switch (e.type) {
    case 'task.failed': case 'run.failed': return 'err';
    case 'task.skipped': return 'warn';
    case 'review.verdict': return e.data.verdict === 'accept' ? 'ok' : 'warn';
    case 'task.completed': case 'run.completed': return 'ok';
    default: return 'info';
  }
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle');
  const click = async () => {
    const ok = await copyText(text);
    setState(ok ? 'done' : 'fail');
    setTimeout(() => setState('idle'), 1800);
  };
  return <button className="hc-button hc-button--small" type="button" onClick={() => void click()}>{state === 'done' ? 'Copied ✓' : state === 'fail' ? 'Copy failed' : label}</button>;
}

export function DownloadButton({ name, text, mime }: { name: string; text: string; mime: string }) {
  return <button className="hc-button hc-button--small" type="button" onClick={() => downloadText(name, text, mime)}>{`Download .${name.split('.').at(-1)}`}</button>;
}
