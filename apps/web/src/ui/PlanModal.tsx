import { useState } from 'react';
import { ROSTER, type Plan, type PlanTask } from '@hc/contracts';
import { useStore } from '../data/store';
import { sourceLabel } from './lib';

type Props = { plan: Plan; editable: boolean; onClose(): void; onApproved(): void };

function dependentsOf(plan: Plan, taskId: string): string[] {
  const byDependency = new Map<string, string[]>();
  for (const task of plan.tasks) for (const dependency of task.dependsOn) {
    const list = byDependency.get(dependency) ?? [];
    list.push(task.id);
    byDependency.set(dependency, list);
  }
  const out: string[] = [];
  const queue = [taskId];
  while (queue.length) {
    for (const child of byDependency.get(queue.pop() ?? '') ?? []) {
      if (child !== taskId && !out.includes(child)) { out.push(child); queue.push(child); }
    }
  }
  return out;
}

export function PlanModal({ plan, editable, onClose, onApproved }: Props) {
  const [draft, setDraft] = useState<Plan>(() => structuredClone(plan));
  const [pending, setPending] = useState<{ taskId: string; affected: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'none' | 'approve' | 'replan'>('none');
  const liveEditable = useStore((s) => s.mode === 'live' && !s.history);
  const status = useStore((s) => s.state.status);
  const planSource = useStore((s) => s.state.planSource);
  const canApprove = editable && liveEditable && status === 'awaiting_approval' && busy === 'none' && !pending;
  const note = !liveEditable
    ? 'Live controls are disabled while viewing a recording.'
    : status === 'awaiting_approval' ? null : 'The run has moved past approval; this plan is for reference.';

  const toggle = (task: PlanTask, next: boolean) => {
    if (!canApprove) return;
    if (next) {
      setDraft((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, enabled: true } : item) }));
      return;
    }
    const affected = dependentsOf(draft, task.id).filter((id) => draft.tasks.find((item) => item.id === id)?.enabled);
    if (affected.length) setPending({ taskId: task.id, affected });
    else applySkip([task.id]);
  };
  const applySkip = (ids: string[]) => {
    setPending(null);
    setDraft((current) => ({ ...current, tasks: current.tasks.map((item) => ids.includes(item.id) ? { ...item, enabled: false } : item) }));
  };
  const submit = async () => {
    const invalid = draft.tasks.filter((task) => task.enabled && (!task.title.trim() || !task.instructions.trim()));
    if (invalid.length) { setError('Every enabled task needs a title and instructions.'); return; }
    setBusy('approve');
    setError(null);
    try {
      await useStore.getState().approve(structuredClone(draft));
      onApproved();
    } catch { setError('The server rejected this plan. See the notice above the town for details.'); }
    finally { setBusy('none'); }
  };
  const replan = async () => {
    setBusy('replan');
    setError(null);
    try { await useStore.getState().replan(); }
    catch { setError('Re-planning failed. See the notice above the town for details.'); }
    finally { setBusy('none'); }
  };
  const pendingTask = pending ? draft.tasks.find((task) => task.id === pending.taskId) : null;

  return <section className="hc-modal hc-modal--plan">
    <header className="hc-modal-head">
      <div>
        <h2 className="hc-modal-title" id="hc-modal-title">{draft.title}</h2>
        <p className="hc-modal-summary">{draft.summary}</p>
      </div>
      <button className="hc-button hc-icon-button" type="button" aria-label="Close plan" onClick={onClose}>✕</button>
    </header>
    <div className="hc-modal-body">
      {note && <p className="hc-modal-note" data-tone="muted">{note}</p>}
      <ul className="hc-plan-tasks">
        {draft.tasks.map((task) => {
          const record = draft.tasks.find((item) => item.id === task.id);
          const pendingHere = pending?.affected.includes(task.id) ?? false;
          return <li className={`hc-plan-row${pendingHere ? ' hc-plan-row--pending' : ''}`} key={task.id}>
            <div className="hc-plan-top">
              <input type="checkbox" className="hc-task-check" checked={record?.enabled ?? task.enabled} disabled={!canApprove} aria-label={`${task.enabled ? 'Include' : 'Skip'} ${task.title}`} onChange={(e) => toggle(task, e.currentTarget.checked)} />
              <span className="hc-owner-dot" style={{ backgroundColor: ROSTER[task.owner].color }} />
              {canApprove
                ? <input className="hc-plan-title" value={task.title} maxLength={60} aria-label={`Title for ${ROSTER[task.owner].name}'s task`} onChange={(e) => setDraft((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, title: e.currentTarget.value } : item) }))} />
                : <strong>{task.title}</strong>}
              <span className="hc-agent-badge">{ROSTER[task.owner].name}</span>
            </div>
            {canApprove
              ? <textarea className="hc-plan-instructions" value={task.instructions} maxLength={600} rows={2} aria-label={`Instructions for ${ROSTER[task.owner].name}'s task`} onChange={(e) => setDraft((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, instructions: e.currentTarget.value } : item) }))} />
              : <p className="hc-plan-instructions-text">{task.instructions}</p>}
            <small>{task.deliverable.replace('_', ' ')} · {task.dependsOn.length ? `after ${task.dependsOn.map((id) => draft.tasks.find((item) => item.id === id)?.title ?? id).join(' · ')}` : 'no dependencies'} · {task.enabled ? 'included' : 'skipped'}</small>
          </li>;
        })}
      </ul>
      {pending && pendingTask && <div className="hc-cascade-confirm" role="alert">
        <p>Skipping “{pendingTask.title}” also skips {pending.affected.length === 1 ? '1 dependent task' : `${pending.affected.length} dependent tasks`}: {pending.affected.map((id) => draft.tasks.find((task) => task.id === id)?.title ?? id).join(' · ')}.</p>
        <div className="hc-cascade-actions">
          <button className="hc-button" type="button" onClick={() => setPending(null)}>Cancel</button>
          <button className="hc-button" type="button" onClick={() => applySkip([pending.taskId, ...pending.affected])}>Confirm skip</button>
        </div>
      </div>}
      {error && <p className="hc-modal-note" data-tone="err" role="alert">{error}</p>}
    </div>
    <footer className="hc-modal-foot">
      <span className="hc-source" data-source={planSource ?? 'model'}>{sourceLabel(planSource)}</span>
      <div className="hc-modal-foot-actions">
        {canApprove && <button className="hc-button" type="button" disabled={busy !== 'none'} onClick={() => void replan()}>{busy === 'replan' ? 'Re-planning…' : 'Re-plan'}</button>}
        <button className="hc-button hc-button--primary" type="button" disabled={!canApprove} title={canApprove ? undefined : 'Approval needs a live run waiting for approval.'} onClick={() => void submit()}>{busy === 'approve' ? 'Approving…' : 'Approve plan'}</button>
      </div>
    </footer>
  </section>;
}
