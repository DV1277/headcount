import { useMemo, useState } from 'react';
import { DEPARTMENTS, ROSTER, type AgentId, type DeptId } from '@hc/contracts';
import { useStore } from '../data/store';
import { ARTIFACT_ICON, IconClose, IconCoin } from './icons';
import { DELIVERABLE_LABEL, formatClock, pillFor, taskStatusMeta } from './lib';
import { Portrait, StatusPill } from './parts';

const KILO = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function InspectorAgent({ agent, onOpenArtifact, onClose }: { agent: AgentId; onOpenArtifact(artifactId: string): void; onClose(): void }) {
  const meta = ROSTER[agent];
  const state = useStore((s) => s.state);
  const events = useStore((s) => s.events);
  const mode = useStore((s) => s.mode);
  const liveEditable = useStore((s) => s.mode === 'live' && !s.history);
  const runStatus = useStore((s) => s.state.status);
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const isDept = (DEPARTMENTS as readonly string[]).includes(agent);
  const person = state.agents[agent];
  const reported = useMemo(() => events.some((e) => e.seq <= state.lastSeq && e.type === 'payroll.tick' && e.data.agent === agent && e.data.credits != null), [events, state.lastSeq, agent]);
  const tokens = useMemo(() => events.reduce((sum, e) => (e.seq <= state.lastSeq && e.type === 'payroll.tick' && e.data.agent === agent ? sum + (e.data.tokensIn ?? 0) + (e.data.tokensOut ?? 0) : sum), 0), [events, state.lastSeq, agent]);
  const task = person.taskId ? state.tasks[person.taskId] : null;
  const taskStatus = task ? taskStatusMeta(task.status) : null;
  const platform = meta.platform === 'stepfun' ? 'StepFun Step 5' : meta.platform === 'creao' ? 'CREAO agent' : 'The human founder';
  const artifacts = Object.values(state.artifacts).filter((a) => a.agent === agent && !a.stale);
  const canRedirect = liveEditable && isDept && (runStatus === 'running' || runStatus === 'paused');
  const first = meta.name.replace('Mayor ', '');
  const where = ({ hall: 'City Hall', library: 'Library', workshop: 'Workshop', post: 'Post Office', home: 'Home', plaza: 'Plaza' } as const)[meta.building];
  const send = async () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    try {
      await useStore.getState().redirect(agent as DeptId, trimmed);
      setNote('');
      setFeedback({ tone: 'ok', text: 'Note sent — the task re-dispatches with your note attached.' });
    } catch { setFeedback({ tone: 'err', text: 'Could not send the note. Check the notice above the town for details.' }); }
  };
  const working = person.status === 'working';
  const statusMeta = working ? { tone: 'info' as const, word: 'working', icon: 'dot' as const }
    : person.status === 'idle' ? { tone: 'ok' as const, word: 'idle', icon: 'ring' as const }
      : { tone: 'warn' as const, word: person.status, icon: 'ring' as const };

  return <div className="hc-inspector-agent">
    <div className="hc-insp-head">
      <Portrait agent={agent} />
      <div className="hc-insp-title">
        <h2 className="hc-agent-name">{agent === 'founder' ? 'YOU' : first.toUpperCase()} · {agent === 'mayor' ? 'Mayor' : agent === 'scout' ? 'Scout' : agent === 'maker' ? 'Maker' : agent === 'herald' ? 'Herald' : 'Founder'}</h2>
        <p className="hc-agent-role">{meta.role} · {where}</p>
      </div>
      <button className="hc-icon-btn hc-icon-btn--small" type="button" aria-label="Close inspector" onClick={onClose}><IconClose size={14} /></button>
    </div>
    <div className="hc-chip-line">
      <span className="hc-tag">{platform}</span>
      <StatusPill meta={statusMeta} />
    </div>

    <dl className="hc-facts">
      <div><dt>Task</dt><dd>{task
        ? <><span className="hc-task-id">{task.def.id}</span><strong>{task.def.title}</strong></>
        : <span className="hc-muted">None right now</span>}</dd></div>
      {task && taskStatus && <div><dt>Status</dt><dd><StatusPill meta={pillFor(task.status)} /></dd></div>}
    </dl>

    <section className="hc-insp-section">
      <h3 className="hc-section-title">Recent events</h3>
      {person.log.length
        ? <div className="hc-agent-log" role="log" aria-label={`Recent events for ${first}`}>
          {[...person.log].reverse().slice(0, 8).map((entry) => <div className="hc-log-row" key={entry.seq}>
            <span>{formatClock(entry.t)}</span><span>{entry.text}</span>
          </div>)}
        </div>
        : <p className="hc-shelf-empty">No events for {first} yet.</p>}
    </section>

    {artifacts.length > 0 && <section className="hc-insp-section">
      <h3 className="hc-section-title">Deliverables</h3>
      <div className="hc-insp-artifacts">
        {artifacts.map((artifact) => {
          const Icon = ARTIFACT_ICON[artifact.kind];
          return <button className="hc-ghost hc-ghost--row" type="button" key={artifact.id} onClick={() => onOpenArtifact(artifact.id)}>
            <Icon size={14} /><span>{DELIVERABLE_LABEL[artifact.kind]} · {artifact.title}</span>
          </button>;
        })}
      </div>
    </section>}

    <div className="hc-spend">
      <IconCoin size={14} />
      <span>{meta.platform === 'creao' && state.mode === 'live' && !reported ? 'Not reported by CREAO' : <>
        {person.credits.toFixed(0)} cr · ${person.usd.toFixed(2)}{meta.platform === 'creao' && person.usd > 0 ? ' est.' : ''}{tokens > 0 ? ` · ${KILO(tokens)} tok` : ''}
        {mode === 'replay' ? ' · recorded' : ''}</>}</span>
    </div>

    {isDept && <section className="hc-insp-section hc-redirect">
      <h3 className="hc-section-title">Redirect</h3>
      <p className="hc-inspector-hint">Send a note to steer {first}. A working task is redone with your note attached.</p>
      <div className="hc-redirect-row">
        <input className="hc-input" value={note} maxLength={200} disabled={!canRedirect} placeholder={canRedirect ? `Note for ${first}…` : 'Needs a live run that is working or paused.'} aria-label={`Redirect note for ${first}`}
          onChange={(e) => { setNote(e.currentTarget.value); setFeedback(null); }} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} />
        <button className="hc-btn hc-btn--primary hc-btn--sm" type="button" disabled={!canRedirect || !note.trim()} title={canRedirect ? undefined : 'Redirect needs a live run that is working or paused.'} onClick={() => void send()}>Send note</button>
      </div>
      {feedback && <p className="hc-modal-note" data-tone={feedback.tone} role="status">{feedback.text}</p>}
    </section>}
  </div>;
}
