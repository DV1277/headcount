import { useState } from 'react';
import { ROSTER, type Plan, type PlanTask } from '@hc/contracts';
import { useStore } from '../data/store';
import { IconAfter, IconCheck, IconClose, IconReplay } from './icons';
import { sourceLabel } from './lib';
import { OwnerChip } from './parts';

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
  const [focused, setFocused] = useState<string | null>(null);
  const liveEditable = useStore((s) => s.mode === 'live' && !s.history);
  const status = useStore((s) => s.state.status);
  const planSource = useStore((s) => s.state.planSource);
  const canEdit = editable && liveEditable && status === 'awaiting_approval';
  const canApprove = canEdit && busy === 'none' && !pending;
  const editTask = (id: string, field: 'title' | 'instructions', value: string) => {
    setDraft((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === id ? { ...item, [field]: value } : item) }));
  };
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
  const included = draft.tasks.filter((task) => task.enabled).length;

  return <section className="hc-modal hc-modal--plan hc-scroll-modal" aria-labelledby="hc-modal-title">
    <span className="hc-rod hc-rod--top" aria-hidden="true"><i /><i /></span>
    <span className="hc-rod hc-rod--bottom" aria-hidden="true"><i /><i /></span>
    <header className="hc-plan-head">
      <div className="hc-plan-head-main">
        <span className="hc-kicker">PLAN · DRAFTED BY MAYOR MABEL</span>
        <h2 className="hc-plan-title-text" id="hc-modal-title">{draft.title}</h2>
        <p className="hc-plan-summary">{draft.summary}</p>
      </div>
      <div className="hc-plan-meta">
        <strong>{draft.tasks.length} tasks · {included} included</strong>
        <span>reported usage appears in payroll</span>
      </div>
      <button className="hc-icon-btn hc-icon-btn--small hc-plan-close" type="button" aria-label="Close plan" onClick={onClose}><IconClose size={14} /></button>
    </header>
    <div className="hc-plan-body">
      {note && <p className="hc-modal-note" data-tone="muted">{note}</p>}
      <ul className="hc-plan-tasks">
        {draft.tasks.map((task) => {
          const pendingHere = pending?.affected.includes(task.id) ?? false;
          const deps = task.dependsOn;
          return <li className={`hc-plan-row${pendingHere ? ' hc-plan-row--pending' : ''}${task.enabled ? '' : ' hc-plan-row--off'}`} key={task.id}>
            <div className="hc-plan-top">
              <label className="hc-check" data-on={task.enabled}>
                <input type="checkbox" checked={task.enabled} disabled={!canApprove} aria-label={`${task.enabled ? 'Include' : 'Skip'} ${task.title}`} onChange={(e) => toggle(task, e.currentTarget.checked)} />
                <span aria-hidden="true">{task.enabled && <IconCheck size={14} />}</span>
              </label>
              <span className="hc-plan-id">{task.id}</span>
              <OwnerChip agent={task.owner} />
              {canEdit
                ? <input className="hc-plan-title" value={task.title} maxLength={60} aria-label={`Title for ${ROSTER[task.owner].name}'s task`} onFocus={() => setFocused(task.id)} onBlur={() => setFocused(null)} onChange={(e) => editTask(task.id, 'title', e.currentTarget.value)} />
                : <strong className="hc-plan-title hc-plan-title--static">{task.title}</strong>}
              <span className="hc-plan-after">{deps.length ? <><IconAfter size={14} />after {deps.join(', ')}</> : 'starts first'}</span>
            </div>
            {canEdit
              ? <textarea className={`hc-plan-instructions${focused === task.id ? ' is-focused' : ''}`} value={task.instructions} maxLength={600} rows={2} aria-label={`Instructions for ${ROSTER[task.owner].name}'s task`} onFocus={() => setFocused(task.id)} onBlur={() => setFocused(null)} onChange={(e) => editTask(task.id, 'instructions', e.currentTarget.value)} />
              : <p className="hc-plan-instructions-text">{task.instructions}</p>}
          </li>;
        })}
      </ul>
      {pending && pendingTask && <div className="hc-cascade-confirm" role="alert">
        <p>Skipping “{pendingTask.title}” also skips {pending.affected.length === 1 ? '1 dependent task' : `${pending.affected.length} dependent tasks`}: {pending.affected.map((id) => draft.tasks.find((task) => task.id === id)?.title ?? id).join(' · ')}.</p>
        <div className="hc-cascade-actions">
          <button className="hc-btn hc-btn--sm" type="button" onClick={() => setPending(null)}>Cancel</button>
          <button className="hc-btn hc-btn--sm" type="button" onClick={() => applySkip([pending.taskId, ...pending.affected])}>Confirm skip</button>
        </div>
      </div>}
      {error && <p className="hc-modal-note" data-tone="err" role="alert">{error}</p>}
    </div>
    <footer className="hc-plan-foot">
      <div className="hc-source" data-source={planSource ?? 'model'}>
        <strong>{sourceLabel(planSource)}{planSource === 'model' || !planSource ? ' · Step 5 Preview' : ''}</strong>
        <span>{canEdit ? 'Edit any title or instruction before you approve.' : 'Read-only view of this plan.'}</span>
      </div>
      <div className="hc-modal-foot-actions">
        {canEdit && <button className="hc-btn hc-btn--lg" type="button" disabled={busy !== 'none' || Boolean(pending)} onClick={() => void replan()}><IconReplay size={14} />{busy === 'replan' ? 'Re-planning…' : 'Re-plan'}</button>}
        <button className="hc-btn hc-btn--primary hc-btn--lg" type="button" disabled={!canApprove} title={canApprove ? undefined : 'Approval needs a live run waiting for approval.'} onClick={() => void submit()}><IconCheck size={14} />{busy === 'approve' ? 'Approving…' : 'Approve plan'}</button>
      </div>
    </footer>
  </section>;
}
