import { useState } from 'react';
import { DEPARTMENTS, ROSTER, type AgentId, type DeptId } from '@hc/contracts';
import { useStore } from '../data/store';
import { KIND_META, formatClock, taskStatusMeta } from './lib';

export function InspectorAgent({ agent, onOpenArtifact }: { agent: AgentId; onOpenArtifact(artifactId: string): void }) {
  const meta = ROSTER[agent];
  const state = useStore((s) => s.state);
  const mode = useStore((s) => s.mode);
  const liveEditable = useStore((s) => s.mode === 'live' && !s.history);
  const runStatus = useStore((s) => s.state.status);
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const isDept = (DEPARTMENTS as readonly string[]).includes(agent);
  const person = state.agents[agent];
  const task = person.taskId ? state.tasks[person.taskId] : null;
  const taskStatus = task ? taskStatusMeta(task.status) : null;
  const platform = meta.platform === 'stepfun' ? 'StepFun Step 5' : meta.platform === 'creao' ? 'CREAO agent' : 'You — the human founder';
  const artifacts = Object.values(state.artifacts).filter((a) => a.agent === agent);
  const canRedirect = liveEditable && isDept && (runStatus === 'running' || runStatus === 'paused');
  const send = async () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    try {
      await useStore.getState().redirect(agent as DeptId, trimmed);
      setNote('');
      setFeedback({ tone: 'ok', text: 'Note sent — the task re-dispatches with your note attached.' });
    } catch { setFeedback({ tone: 'err', text: 'Could not send the note. Check the notice above the town for details.' }); }
  };
  return <div className="hc-inspector-agent">
    <div className="hc-portrait-row">
      <span className="hc-portrait" style={{ backgroundColor: meta.color }}>{meta.initials}</span>
      <div>
        <h2 className="hc-agent-name">{meta.name}</h2>
        <p className="hc-agent-role">{meta.role} · {platform}</p>
      </div>
    </div>
    <dl className="hc-state-list">
      <div><dt>Status</dt><dd><span className="hc-task-status" data-tone={person.status === 'working' ? 'info' : person.status === 'idle' ? 'ok' : 'warn'}>{person.status}</span></dd></div>
      {task && <div><dt>Current task</dt><dd>{task.def.title}{taskStatus && <> · <span className="hc-task-status" data-tone={taskStatus.tone}>{taskStatus.icon} {taskStatus.word}</span></>}</dd></div>}
      <div><dt>{mode === 'replay' ? 'Recorded payroll' : 'Payroll'}</dt><dd>{person.credits.toFixed(2)} cr · ${person.usd.toFixed(2)}{meta.platform === 'creao' && person.usd > 0 ? ' est.' : ''}</dd></div>
    </dl>
    <h3 className="hc-section-title">Recent events</h3>
    {person.log.length
      ? <div className="hc-agent-log" role="log" aria-label={`Recent events for ${meta.name}`}>
        {[...person.log].reverse().map((entry) => <div className="hc-log-row" key={entry.seq}>
          <span>{formatClock(entry.t)}</span><span>{entry.text}</span>
        </div>)}
      </div>
      : <p className="hc-shelf-empty">No events for this agent yet.</p>}
    {artifacts.length > 0 && <>
      <h3 className="hc-section-title">Deliverables</h3>
      <div className="hc-inspector-artifacts">
        {artifacts.map((artifact) => <button className="hc-button hc-button--small" type="button" key={artifact.id} onClick={() => onOpenArtifact(artifact.id)}>
          {KIND_META[artifact.kind].icon} {artifact.title}
        </button>)}
      </div>
    </>}
    {isDept && <>
      <h3 className="hc-section-title">Redirect</h3>
      <p className="hc-inspector-hint">Send a note to steer this agent. A working task is redone with your note attached.</p>
      <div className="hc-redirect-row">
        <input className="hc-redirect-input" value={note} maxLength={200} disabled={!canRedirect} placeholder={canRedirect ? `Note for ${meta.name} (≤200 chars)…` : 'Redirect needs a live run that is working or paused.'} aria-label={`Redirect note for ${meta.name}`} onChange={(e) => { setNote(e.currentTarget.value); setFeedback(null); }} />
        <button className="hc-button" type="button" disabled={!canRedirect || !note.trim()} title={canRedirect ? undefined : 'Redirect needs a live run that is working or paused.'} onClick={() => void send()}>Send note</button>
      </div>
      {feedback && <p className="hc-modal-note" data-tone={feedback.tone === 'ok' ? 'ok' : 'err'} role="status">{feedback.text}</p>}
    </>}
  </div>;
}
