import { useMemo } from 'react';
import { DEPARTMENTS, ROSTER, type AgentId, type DeptId, type EventEnvelope } from '@hc/contracts';
import type { TownState } from '@hc/engine';
import { ARTIFACT_ICON, IconList } from './icons';
import { DELIVERABLE_LABEL, formatClock, pillFor } from './lib';
import { StatusPill } from './parts';

const TEAM: AgentId[] = ['mayor', ...DEPARTMENTS];

/** Plain-words status for the team list. Words only; the dot is identity, not status. */
export function teamStatusWord(agent: AgentId, state: TownState, waitingOnFounder: boolean): string {
  const person = state.agents[agent];
  const finished = Object.values(state.tasks).some((task) => task.def.owner === agent && task.status === 'accepted');
  const owned = Object.values(state.tasks).filter((task) => task.def.owner === agent && task.status !== 'skipped');
  if (agent === 'mayor') {
    if (waitingOnFounder) return 'waiting on you';
    if (state.status === 'completed') return 'done';
    if (person.status === 'working' || state.status === 'drafting' || state.status === 'finishing') return 'coordinating';
    if (person.status === 'idle' && state.status === 'awaiting_approval') return 'waiting on you';
    return person.status === 'idle' ? 'idle' : person.status;
  }
  if (person.status === 'paused') return 'paused';
  if (waitingOnFounder && owned.some((task) => task.status === 'blocked' || task.status === 'dispatched' || task.status === 'working')) return 'needs you';
  if (person.status === 'idle' && finished && owned.every((task) => task.status === 'accepted')) return 'done';
  return person.status;
}

export type ShelfProps = {
  state: TownState;
  events: readonly EventEnvelope[];
  selected: AgentId | null;
  waitingOnFounder: boolean;
  hasPlan: boolean;
  showLog: boolean;
  logEvents: readonly EventEnvelope[];
  canShowFinal: boolean;
  planOpen: boolean;
  onSelect(agent: AgentId | null): void;
  onOpenArtifact(artifactId: string): void;
  onTogglePlan(): void;
  onToggleLog(): void;
  onFinal(): void;
};

export function Shelf(p: ShelfProps) {
  const { state } = p;
  // One card per deliverable-producing task, so a card exists (and shows "working") before its artifact does.
  const cards = useMemo(() => Object.values(state.tasks)
    .filter((task) => task.def.enabled && task.status !== 'skipped')
    .map((task) => {
      const artifact = task.artifactId ? state.artifacts[task.artifactId] : undefined;
      return { task, artifact, kind: task.def.deliverable, owner: task.def.owner as DeptId };
    }), [state.tasks, state.artifacts]);

  return <aside className="hc-shelf" aria-label="Deliverables and team">
    <h2 className="hc-region-heading">Deliverables</h2>
    {cards.length === 0 && <p className="hc-shelf-empty">Deliverables appear here as the team produces them.</p>}
    <div className="hc-deliv-list">
      {cards.map(({ task, artifact, kind, owner }) => {
        const Icon = ARTIFACT_ICON[kind];
        const meta = pillFor(artifact?.stale ? 'skipped' : task.status);
        const label = DELIVERABLE_LABEL[kind];
        const open = artifact ? () => p.onOpenArtifact(artifact.id) : undefined;
        return <button type="button" className="hc-deliv" key={task.def.id} disabled={!open}
          aria-label={`${label}, ${ROSTER[owner].name}, ${meta.word}${open ? ' — open viewer' : ''}`} title={artifact ? `${artifact.title} — open viewer` : `${label} is not ready yet`} onClick={open}>
          <span className="hc-deliv-icon" style={{ borderColor: ROSTER[owner].color }}><Icon size={16} /></span>
          <span className="hc-deliv-main">
            <span className="hc-deliv-title">{label}</span>
            <span className="hc-deliv-sub">{ROSTER[owner].name}{artifact ? ` · ${artifact.title}` : ` · ${task.def.title}`}</span>
            <StatusPill meta={meta} />
          </span>
        </button>;
      })}
    </div>

    <hr className="hc-rule" />
    <h2 className="hc-region-heading">Team</h2>
    <div className="hc-team">
      {TEAM.map((id) => {
        const agent = ROSTER[id];
        const word = teamStatusWord(id, state, p.waitingOnFounder);
        return <button type="button" className="hc-team-row" key={id} aria-pressed={p.selected === id}
          aria-label={`${agent.name} · ${word} · inspect agent`} title={`${agent.name} — click to inspect`} onClick={() => p.onSelect(p.selected === id ? null : id)}>
          <span className="hc-agent-dot" style={{ background: agent.color }} />
          <span className="hc-agent-initials" style={{ background: agent.color }}>{agent.initials}</span>
          <span className="hc-team-name">{agent.name.replace('Mayor ', '')}</span>
          <span className="hc-team-status">{word}</span>
        </button>;
      })}
    </div>

    <div className="hc-shelf-tools">
      {p.hasPlan && <button type="button" className="hc-ghost" aria-label={`Plan · ${Object.keys(state.tasks).length} tasks`} title="Open plan" aria-expanded={p.planOpen} onClick={p.onTogglePlan}><IconList size={14} /><span>Plan · {Object.keys(state.tasks).length} tasks</span></button>}
      <button type="button" className="hc-ghost" aria-label={p.showLog ? 'Hide event log' : `Event log · ${p.logEvents.length}`} title="Event log" aria-expanded={p.showLog} aria-controls="hc-event-log" onClick={p.onToggleLog}><IconList size={14} /><span>{p.showLog ? 'Hide event log' : `Event log · ${p.logEvents.length}`}</span></button>
      {p.canShowFinal && <button type="button" className="hc-ghost" aria-label="Founder brief" title="Founder brief" onClick={p.onFinal}><IconList size={14} /><span>Founder brief</span></button>}
    </div>
    {p.showLog && <section className="hc-event-log" id="hc-event-log" aria-label="Events reached so far">
      <h3 className="hc-section-title">Recent events</h3>
      {p.logEvents.slice(-14).reverse().map((event) => <div className="hc-event-row" key={event.seq}>
        <span>{formatClock(event.t)}</span><strong>{event.type}</strong>
      </div>)}
      {!p.logEvents.length && <p className="hc-shelf-empty">Events will appear here as the run advances.</p>}
    </section>}
  </aside>;
}
