import { useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/pixelify-sans/latin-500.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/pixelify-sans/latin-700.css';
import { ROSTER } from '@hc/contracts';
import { statusLine } from '@hc/engine';
import { useStore } from '../data/store';
import '../styles/hud.css';

const stateLabels: Record<string, string> = {
  drafting: 'Mayor is planning', awaiting_founder: 'Founder input needed',
  awaiting_approval: 'Plan ready for approval', running: 'Company is working',
  paused: 'Town paused', finishing: 'Preparing the founder brief',
  completed: 'Run complete', failed: 'Run needs attention',
};

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function Hud() {
  const { state, mode, speed, history, connection, events, duration, playing, reducedMotion, error, setSpeed, setPlaying, openReplay, scrubTo, backToLive } = useStore();
  const [showPlan, setShowPlan] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [fixtureName, setFixtureName] = useState('golden-boba');
  const planDialog = useRef<HTMLDialogElement>(null);
  const plan = state.plan;
  const hasPlan = Boolean(plan);
  const visibleEvents = useMemo(() => events.filter((event) => event.seq <= state.lastSeq), [events, state.lastSeq]);
  const eventCount = visibleEvents.length;
  const currentState = state.status;
  const hasRun = Boolean(state.runId);
  const label = mode === 'replay' ? `REPLAY ×${speed}` : !hasRun ? 'PREVIEW' : state.mode === 'mock' ? 'MOCK' : state.mode.toUpperCase();
  const maxTime = Math.max(duration, 1);
  const timelineEvents = useMemo(() => events.filter((event) => event.type !== 'agent.progress'), [events]);

  useEffect(() => {
    const dialog = planDialog.current;
    if (!showPlan || !hasPlan || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [showPlan, hasPlan]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showEvents && !showPlan) setShowEvents(false);
      if (showPlan || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))) return;
      if (mode !== 'replay') return;
      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying(!playing);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        scrubTo(Math.max(0, Math.min(duration, state.t + (event.key === 'ArrowRight' ? 5000 : -5000))));
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        scrubTo(0);
        setPlaying(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [duration, mode, playing, scrubTo, setPlaying, showEvents, showPlan, state.t]);

  return <div className="hc-hud" data-reduced={reducedMotion ? 'true' : 'false'}>
    <header className="hc-topbar">
      <h1 className="hc-brand"><span className="hc-brand-mark" aria-hidden="true">1</span>HEADCOUNT: 1</h1>
      <span className="hc-mode" data-mode={mode === 'replay' ? 'replay' : !hasRun ? 'preview' : state.mode === 'mock' ? 'mock' : 'live'} title={!hasRun ? 'Bundled fixture preview; no live calls are running.' : undefined}>{label}</span>
      <div className="hc-run-title">{state.title || 'A company of one, staffed by AI agents you can watch.'}</div>
      <span className="hc-clock">{formatClock(state.t)}</span>
      <div className="hc-top-actions">
        <button className="hc-button" type="button" onClick={() => setShowPlan((v) => !v)} disabled={!plan} aria-expanded={showPlan} aria-controls="hc-plan-dialog">{showPlan ? 'Hide plan' : 'Plan'}</button>
        <button className="hc-button" type="button" onClick={() => setShowEvents((v) => !v)} aria-expanded={showEvents} aria-controls="hc-event-log">{showEvents ? 'Hide log' : `Log · ${eventCount}`}</button>
        <span className="hc-connection" title={mode === 'replay' ? 'Playback uses a loaded recording.' : `Connection: ${connection}`}>{mode === 'replay' ? 'Recording loaded' : `● ${connection}`}</span>
      </div>
    </header>

    <div className={`hc-stage${showEvents ? ' hc-stage--log' : ''}`}>
      <aside className="hc-shelf" aria-label="Company and team">
        <h2 className="hc-region-heading">Company</h2>
        <div className="hc-state-summary">
          <strong>{hasRun ? stateLabels[currentState] ?? currentState : 'Ready for a recording'}</strong>
          <span>{state.runId ? state.runId : 'No run opened'}</span>
          {plan && <button className="hc-button hc-button--quiet" type="button" onClick={() => setShowPlan(true)}>View plan · {plan.tasks.length} tasks</button>}
        </div>
        <h3 className="hc-section-title">Team status</h3>
        {Object.entries(ROSTER).map(([id, agent]) => {
          const person = state.agents[id as keyof typeof state.agents];
          return <div className="hc-team-row" key={id} title={`${agent.name} · ${person.status}`} aria-label={`${agent.name}: ${person.status}`}>
            <span className="hc-owner-dot" style={{ backgroundColor: agent.color }} />
            <span className="hc-agent-initials" style={{ backgroundColor: agent.color }}>{agent.initials}</span>
            <span>{agent.name}</span><span className="hc-team-status">{person.status}</span>
          </div>;
        })}
        {showEvents && <section className="hc-event-log" id="hc-event-log" aria-label="Events reached so far">
          <h3 className="hc-section-title">Recent events</h3>
          {visibleEvents.slice(-12).reverse().map((event) => <div className="hc-event-row" key={event.seq}>
            <span>{formatClock(event.t)}</span><strong>{event.type}</strong>
          </div>)}
          {!visibleEvents.length && <p className="hc-shelf-empty">Events will appear here as the run advances.</p>}
        </section>}
      </aside>
      <section className="hc-workspace" aria-label="Town canvas">
        {history && <div className="hc-history-banner">Viewing recorded history <button className="hc-button" type="button" onClick={backToLive}>Back to live</button></div>}
        <div className="hc-statusbar" role="status">{plan ? statusLine(state) : hasRun ? stateLabels[currentState] ?? currentState : 'Ready for a recording. Choose a fixture to begin.'}</div>
      </section>
      <aside className="hc-inspector hc-inspector--foundation" aria-label="Run details">
        <h2 className="hc-region-heading">Run state</h2>
        <dl className="hc-state-list">
          <div><dt>Status</dt><dd>{currentState}</dd></div>
          <div><dt>Progress</dt><dd>{Math.round(state.progress * 100)}%</dd></div>
          <div><dt>Events</dt><dd>{eventCount} · seq {state.lastSeq}</dd></div>
          <div><dt>Elapsed</dt><dd>{formatClock(state.t)}</dd></div>
          <div><dt>{mode === 'replay' ? 'Recorded payroll' : 'Payroll'}</dt><dd>{!hasRun ? 'No run yet' : `${state.payroll.credits.toFixed(2)} cr · $${state.payroll.usd.toFixed(2)}`}</dd></div>
        </dl>
        {plan && <>
          <h3 className="hc-section-title">Plan · {state.planSource ?? 'pending'}</h3>
          <p className="hc-plan-summary">{plan.summary}</p>
          <button className="hc-button" type="button" onClick={() => setShowPlan((v) => !v)}>{showPlan ? 'Close plan' : 'Inspect plan'}</button>
        </>}
        {mode === 'replay' && <p className="hc-setup-note">Recorded usage does not incur live spend.</p>}
        {!hasRun && <p className="hc-setup-note">Fixture preview. No live calls are running. Live runs need configured StepFun and CREAO keys.</p>}
      </aside>
    </div>

    <footer className="hc-bottom">
      {mode === 'replay' ? <div className="hc-timeline">
        <div className="hc-timeline-status"><span className="hc-timeline-message">{statusLine(state)}</span><span className="hc-shortcut-hint">← / → ±5s · Space pause · R restart</span></div>
        <div className="hc-track" aria-label="Replay timeline">
          <div className="hc-track-line" />
          {timelineEvents.map((event) => <span key={event.seq} className="hc-tick" title={`${event.seq}: ${event.type}`} style={{ left: `${Math.min(99, event.t / maxTime * 100)}%`, backgroundColor: ROSTER[('agent' in event.data ? event.data.agent : 'mayor') as keyof typeof ROSTER]?.color ?? '#1D1A2B' }} />)}
          <span className="hc-playhead" aria-hidden="true" style={{ left: `${Math.min(100, state.t / maxTime * 100)}%` }} />
          <input className="hc-scrubber" aria-label="Scrub replay" aria-valuetext={`${formatClock(state.t)} of ${formatClock(duration)}`} type="range" min="0" max={maxTime} value={Math.min(state.t, maxTime)} onChange={(e) => scrubTo(Number(e.currentTarget.value))} />
        </div>
        <div className="hc-timeline-controls">
          <button className="hc-button hc-icon-button" type="button" aria-label={playing ? 'Pause replay' : 'Play replay'} onClick={() => setPlaying(!playing)}>{playing ? 'Ⅱ' : '▶'}</button>
          <select className="hc-speed" aria-label="Replay speed" value={speed} onChange={(e) => setSpeed(Number(e.currentTarget.value))}>{[1, 2, 4, 8, 20].map((n) => <option value={n} key={n}>×{n}</option>)}</select>
          {history && <button className="hc-button" type="button" onClick={backToLive}>Back to live</button>}
        </div>
      </div> : <div className="hc-command hc-empty-command">
        <div className="hc-empty-copy"><strong>See a company run.</strong><span>Replay a bundled fixture to explore plans, handoffs and state without API keys.</span></div>
        <div className="hc-fixture-actions">
          {[
            ['golden-boba', 'Golden run'],
            ['failure-retry', 'Failure & retry'],
            ['redirect', 'Founder redirect'],
          ].map(([fixture, title]) => <button className={fixture === 'golden-boba' ? 'hc-button hc-button--primary' : 'hc-button'} key={fixture} type="button" onClick={() => { setFixtureName(fixture); openReplay(`fixture:${fixture}`, 1); }}>{title}</button>)}
        </div>
      </div>}
    </footer>

    {error && <div className="hc-error-bar" role="alert"><strong>Could not load run.</strong><span>{error}</span><button className="hc-button" type="button" onClick={() => openReplay(`fixture:${fixtureName}`, 1)}>Try fixture instead</button></div>}

    {showPlan && plan && <dialog className="hc-scrim" ref={planDialog} id="hc-plan-dialog" aria-labelledby="hc-plan-title" onCancel={() => setShowPlan(false)} onClose={() => setShowPlan(false)} onMouseDown={(e) => { if (e.target === e.currentTarget) setShowPlan(false); }}>
      <section className="hc-modal">
        <header className="hc-modal-head"><div><h2 className="hc-modal-title" id="hc-plan-title">{plan.title}</h2><p className="hc-modal-summary">{plan.summary}</p></div><button className="hc-button hc-icon-button" type="button" aria-label="Close plan" onClick={() => setShowPlan(false)}>×</button></header>
        <div className="hc-modal-body">{plan.tasks.map((task) => <article className="hc-plan-row" key={task.id}>
          <div className="hc-plan-top"><span className="hc-owner-dot" style={{ backgroundColor: ROSTER[task.owner].color }} /><strong>{task.title}</strong><span className="hc-agent-badge">{ROSTER[task.owner].name}</span></div>
          <p>{task.instructions}</p>
          <small>{task.deliverable.replace('_', ' ')} · {task.dependsOn.length ? `after ${task.dependsOn.join(', ')}` : 'no dependencies'} · {task.enabled ? 'enabled' : 'skipped'}</small>
        </article>)}</div>
        <footer className="hc-modal-foot"><span className="hc-source" data-source={state.planSource ?? 'model'}>{state.planSource ?? 'model'} plan</span><button className="hc-button" type="button" onClick={() => setShowPlan(false)}>Close</button></footer>
      </section>
    </dialog>}
  </div>;
}
