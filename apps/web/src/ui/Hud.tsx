import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-700.css';
import '@fontsource/pixelify-sans/latin-500.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/pixelify-sans/latin-700.css';
import { ROSTER, type AgentId } from '@hc/contracts';
import { statusLine } from '@hc/engine';
import { connectRun, useStore } from '../data/store';
import { bridge } from '../bridge';
import { CommandBar, Timeline, type Recording } from './BottomBar';
import { IconBang, IconCheck, IconCoin, IconInfo, IconMute, IconOrg, IconPause, IconPlay, IconSound, IconWarn } from './icons';
import { InspectorAgent } from './Inspector';
import { ILLUSTRATIVE_RECORDINGS, clamp, describeEvent, eventTone, formatClock, isIllustrativeRecording, simClock } from './lib';
import { OrgChart } from './OrgChart';
import { PlanModal } from './PlanModal';
import { Shelf } from './Shelf';
import { ArtifactViewer, FinalCard, QuestionModal } from './Viewers';
import { chime, setSoundEnabled, soundEnabled } from './sound';
import '../styles/hud.css';
import type { DemoChapter } from '../demo/chapters';
import { DEMO_RECORDING } from '../data/siteUrl';

const stateLabels: Record<string, string> = {
  drafting: 'Mayor is planning', awaiting_founder: 'Founder input needed',
  awaiting_approval: 'Plan ready for approval', running: 'Company is working',
  paused: 'Town paused', finishing: 'Preparing the founder brief',
  completed: 'Run complete', failed: 'Run needs attention',
};

const AGENT_KEYS: AgentId[] = ['mayor', 'scout', 'maker', 'herald', 'founder'];
const RECORDINGS: Recording[] = [
  { value: 'fixture:live-boba-g2', label: 'Real CREAO boba run' },
  { value: 'fixture:golden-boba', label: 'Golden boba fixture' },
  { value: 'fixture:failure-retry', label: 'Failure and retry fixture' },
  { value: 'fixture:redirect', label: 'Redirect fixture' },
];

type Toast = {
  id: number; tone: 'err' | 'warn' | 'info' | 'ok'; title: string; body?: string; meta?: string; sticky?: boolean;
  action?: { label: string; run(): void };
};

type ModalState =
  | { kind: 'question'; qid: string; text: string }
  | { kind: 'plan' }
  | { kind: 'viewer'; artifactId: string }
  | { kind: 'final' }
  | null;

const ROLE: Record<string, string> = { scout: 'Scout', maker: 'Maker', herald: 'Herald', mayor: 'The Mayor', founder: 'You' };

function ToastRow({ toast, onClose }: { toast: Toast; onClose(): void }) {
  useEffect(() => {
    if (toast.sticky) return undefined;
    const timer = setTimeout(onClose, 7000);
    return () => clearTimeout(timer);
  }, []);
  const icon = toast.tone === 'err' ? <IconBang size={12} /> : toast.tone === 'warn' ? <IconWarn size={18} /> : toast.tone === 'ok' ? <IconCheck size={14} /> : <IconInfo size={18} />;
  return <div className={`hc-toast hc-toast--${toast.tone}`} role="status">
    <span className={`hc-toast-icon hc-toast-icon--${toast.tone}`} aria-hidden="true">{icon}</span>
    <span className="hc-toast-text"><strong>{toast.title}</strong>{toast.body && <span>{toast.body}</span>}</span>
    {toast.meta && <span className="hc-toast-meta">{toast.meta}</span>}
    {toast.action && <button className="hc-btn hc-btn--primary hc-btn--sm" type="button" onClick={toast.action.run}>{toast.action.label}</button>}
    {!toast.sticky && <button className="hc-toast-close" type="button" aria-label="Dismiss notification" onClick={onClose}>×</button>}
  </div>;
}

export default function Hud({publicDemo=false,guided=false,demoCue=null,demoControls,onDemoRestart}: {publicDemo?:boolean;guided?:boolean;demoCue?:DemoChapter|null;demoControls?:ReactNode;onDemoRestart?:()=>void}) {
  const { state, mode, speed, selected, history, connection, events, duration, playing, playbackRevision, reducedMotion, error, orgChart, select, setSpeed, setPlaying, openReplay, scrubTo, backToLive, pause, resume, setOrgChart } = useStore();
  const hudOnly = useMemo(() => new URLSearchParams(location.search).get('hud-only') === '1', []);
  // ?preview=question opens the founder-question modal read-only during a replay (design review aid).
  const previewQuestion = useMemo(() => new URLSearchParams(location.search).get('preview') === 'question', []);
  const [replaySrc, setReplaySrc] = useState(() => new URLSearchParams(location.search).get('replay') ?? (publicDemo?DEMO_RECORDING:'fixture:golden-boba'));
  const [showEvents, setShowEvents] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [planAuto, setPlanAuto] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [dismissedQuestions, setDismissedQuestions] = useState<string[]>([]);
  const [finalOpen, setFinalOpen] = useState(false);
  const [finalDismissed, setFinalDismissed] = useState<number | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [idea, setIdea] = useState('');
  const [ideaError, setIdeaError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sound, setSound] = useState(soundEnabled);
  useEffect(() => bridge.on('openArtifact', ({ artifactId }) => { if (useStore.getState().state.artifacts[artifactId]) setViewerId(artifactId); }), []);

  const plan = state.plan;
  const hasRun = Boolean(state.runId);
  const liveEditable = !publicDemo && mode === 'live' && !history;
  const runFinished = state.status === 'completed' || state.status === 'failed';
  const runActive = hasRun && !runFinished;
  const canApprovePlan = liveEditable && state.status === 'awaiting_approval';

  const reachedEvents = useMemo(() => events.filter((event) => event.seq <= state.lastSeq), [events, state.lastSeq]);
  const planSeq = useMemo(() => {
    for (let i = reachedEvents.length - 1; i >= 0; i--) if (reachedEvents[i].type === 'plan.proposed') return reachedEvents[i].seq;
    return 0;
  }, [reachedEvents]);
  const approved = useMemo(() => reachedEvents.some((event) => event.type === 'plan.approved'), [reachedEvents]);
  const completion = useMemo(() => {
    for (let i = reachedEvents.length - 1; i >= 0; i--) if (reachedEvents[i].type === 'run.completed') return reachedEvents[i];
    return null;
  }, [reachedEvents]);
  const unanswered = state.questions.find((q) => !q.answered && !dismissedQuestions.includes(q.qid)) ?? null;
  const waitingOnFounder = state.questions.some((q) => !q.answered);
  const narration = useMemo(
    () => reachedEvents.map((event) => ({ event, text: describeEvent(event, state) })).filter((row) => row.text !== null).slice(-30),
    [reachedEvents, state],
  );
  const narrationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = narrationRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [narration.length]);

  const planAutoRef = useRef(0);
  const toastSeqRef = useRef(0);
  const liveRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== 'live' || !state.runId) return;
    liveRunRef.current = state.runId;
    const params = new URLSearchParams(location.search);
    if (params.get('run') === state.runId && !params.has('replay')) return;
    params.delete('replay'); params.delete('speed');
    params.set('run', state.runId);
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [mode, state.runId]);

  useEffect(() => {
    setPlanOpen(false); setPlanAuto(false); setQuestionOpen(false); setDismissedQuestions([]);
    setViewerId(null); setFinalOpen(false); setFinalDismissed(null); setToasts([]);
    planAutoRef.current = 0; toastSeqRef.current = state.lastSeq;
  }, [mode, state.runId]);
  useEffect(() => { toastSeqRef.current = state.lastSeq; setToasts([]); }, [playbackRevision]);
  useEffect(() => {
    if (mode === 'live' && !history && state.status === 'awaiting_approval' && planSeq && planAutoRef.current !== planSeq) {
      planAutoRef.current = planSeq;
      setPlanOpen(true);
      setPlanAuto(true);
    }
  }, [mode, history, state.status, planSeq]);
  useEffect(() => {
    if (planAuto && state.status !== 'awaiting_approval') { setPlanOpen(false); setPlanAuto(false); }
  }, [planAuto, state.status]);

  useEffect(() => {
    if (((mode === 'live' && !history) || previewQuestion) && state.status === 'awaiting_founder' && unanswered) setQuestionOpen(true);
  }, [mode, history, state.status, unanswered, previewQuestion]);
  useEffect(() => {
    if (questionOpen && !unanswered) setQuestionOpen(false);
  }, [questionOpen, unanswered]);

  useEffect(() => {
    if (state.status === 'completed' && completion && finalDismissed !== completion.seq) setFinalOpen(true);
    if (finalOpen && state.status !== 'completed') setFinalOpen(false);
  }, [state.status, completion, finalDismissed, finalOpen]);

  useEffect(() => {
    const upto = state.lastSeq;
    if (upto < toastSeqRef.current) { toastSeqRef.current = upto; setToasts([]); return; }
    const fresh = reachedEvents.filter((event) => event.seq > toastSeqRef.current && event.seq <= upto);
    if (!fresh.length) return;
    toastSeqRef.current = upto;
    const built: Toast[] = [];
    for (const event of fresh) {
      const title = (taskId: string) => state.tasks[taskId]?.def.title ?? taskId;
      if (event.type === 'founder.question') {
        built.push({
          id: event.seq, tone: 'warn', title: 'Founder needed', body: event.data.text.length > 90 ? `${event.data.text.slice(0, 87)}…` : event.data.text, sticky: true,
          action: liveEditable ? { label: 'Answer', run: () => { setDismissedQuestions((list) => list.filter((id) => id !== event.data.qid)); setQuestionOpen(true); } } : undefined,
        });
      } else if (event.type === 'task.failed') {
        const owner = state.tasks[event.data.taskId]?.def.owner ?? 'mayor';
        const role = ROLE[owner];
        const attempt = state.tasks[event.data.taskId]?.attempt ?? 1;
        if (event.data.willRetry) {
          built.push({ id: event.seq, tone: 'err', title: `${role} failed (${event.data.error.code}). Retrying once.`, body: 'If the retry fails, the Mayor covers it.', meta: `attempt ${Math.min(attempt + 1, 2)} of 2` });
        } else if (event.data.next === 'mayor-cover') {
          built.push({ id: event.seq, tone: 'err', title: `${role} failed (${event.data.error.code}).`, body: `The Mayor covers “${title(event.data.taskId)}” from the standard plan.` });
        } else {
          built.push({ id: event.seq, tone: 'err', title: `${role} could not finish “${title(event.data.taskId)}”.`, body: 'Task skipped.' });
        }
      } else if (event.type === 'task.dispatched' && event.data.via === 'mayor-cover') {
        built.push({ id: event.seq, tone: 'info', title: "Covered by Mayor: CREAO didn't respond.", body: `Standard-plan work used for “${title(event.data.taskId)}”.`, meta: 'fallback' });
      } else if (event.type === 'task.skipped') {
        built.push({ id: event.seq, tone: 'warn', title: `Skipped “${title(event.data.taskId)}”`, body: event.data.reason });
      } else if (event.type === 'run.failed') {
        built.push({ id: event.seq, tone: 'err', title: 'Run failed', body: event.data.error.message });
      } else if (event.type === 'review.verdict' && event.data.verdict === 'accept') {
        if (mode === 'live') chime('stamp');
      } else if (event.type === 'run.completed') {
        if (mode === 'live') chime('done');
      }
    }
    if (built.length) setToasts((previous) => {
      const next = [...previous, ...built];
      while (next.length > 3) {
        const drop = next.findIndex((toast) => !toast.sticky);
        if (drop === -1) break;
        next.splice(drop, 1);
      }
      return next;
    });
  }, [state.lastSeq, state.tasks, reachedEvents]);

  useEffect(() => {
    setToasts((previous) => previous.filter((toast) => {
      if (!toast.sticky) return true;
      const event = reachedEvents.find((item) => item.seq === toast.id);
      return event?.type === 'founder.question' && !state.questions.find((q) => q.qid === event.data.qid)?.answered;
    }));
  }, [state.questions, reachedEvents]);

  useEffect(() => {
    if (mode === 'replay') {
      setPlanOpen(false); setPlanAuto(false); setFinalOpen(false); setViewerId(null); setQuestionOpen(false); setToasts([]);
    }
  }, [mode]);

  useEffect(() => {
    if (!demoCue) {
      if(publicDemo){setPlanOpen(false);setViewerId(null);setFinalOpen(false);setQuestionOpen(false);setOrgChart(false);select(null);}
      return;
    }
    setPlanAuto(false); setQuestionOpen(false);
    setPlanOpen(demoCue.view==='plan');
    setViewerId(['research','site','launch'].includes(demoCue.view)?demoCue.artifactId??null:null);
    setFinalOpen(demoCue.view==='final');
    setShowEvents(demoCue.view==='logs');
    select(demoCue.view==='agent'?demoCue.agent??null:null);
    setOrgChart(demoCue.view==='org');
  }, [demoCue?.id]);

  const active: ModalState =
    questionOpen && unanswered ? { kind: 'question', qid: unanswered.qid, text: unanswered.text }
      : planOpen && plan ? { kind: 'plan' }
        : viewerId ? { kind: 'viewer', artifactId: viewerId }
          : finalOpen && state.status === 'completed' ? { kind: 'final' }
            : null;
  const activeSignature = active
    ? active.kind === 'question' ? `q:${active.qid}` : active.kind === 'viewer' ? `a:${active.artifactId}` : active.kind
    : '';
  const modalRef = useRef<HTMLDialogElement>(null);
  const activeRef = useRef<ModalState>(null);
  activeRef.current = active;
  const showEventsRef = useRef(showEvents);
  showEventsRef.current = showEvents;
  const orgRef = useRef(orgChart);
  orgRef.current = orgChart;
  useEffect(() => {
    const dialog = modalRef.current;
    if (!dialog) return;
    if (active && !dialog.open) dialog.showModal();
    else if (!active && dialog.open) dialog.close();
  }, [activeSignature]);
  const dismissModal = () => {
    const current = activeRef.current;
    if (!current) return;
    if (current.kind === 'question') setDismissedQuestions((list) => list.includes(current.qid) ? list : [...list, current.qid]);
    if (current.kind === 'plan') { setPlanOpen(false); setPlanAuto(false); planAutoRef.current = planSeq; }
    if (current.kind === 'viewer') setViewerId(null);
    if (current.kind === 'final') { setFinalOpen(false); setFinalDismissed(completion?.seq ?? null); }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (activeRef.current || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const store = useStore.getState();
      if (event.key === 'Escape') {
        if (orgRef.current) { event.preventDefault(); store.setOrgChart(false); }
        else if (store.selected) { event.preventDefault(); store.select(null); }
        else if (showEventsRef.current) setShowEvents(false);
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))) return;
      if (event.key.toLowerCase() === 'o') { event.preventDefault(); store.setOrgChart(!orgRef.current); return; }
      const agentIndex = ['1', '2', '3', '4', '5'].indexOf(event.key);
      if (agentIndex >= 0) {
        event.preventDefault();
        const agent = AGENT_KEYS[agentIndex];
        store.select(store.selected === agent ? null : agent);
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        if (mode === 'replay') setPlaying(!playing);
        else if (store.state.status === 'running') void pause().catch(() => {});
        else if (store.state.status === 'paused') void resume().catch(() => {});
        return;
      }
      if (mode !== 'replay') return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        scrubTo(clamp(state.t + (event.key === 'ArrowRight' ? 5000 : -5000), 0, duration));
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        scrubTo(0);
        setPlaying(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [duration, mode, playing, pause, resume, scrubTo, setPlaying, state.t]);

  const startBusiness = () => {
    const trimmed = idea.trim();
    if (trimmed.length < 8 || trimmed.length > 280) {
      setIdeaError('Describe your business in 8–280 characters — a few more words helps the Mayor plan.');
      return;
    }
    setIdeaError(null);
    setStarting(true);
    useStore.getState().startRun(trimmed).catch(() => {}).finally(() => setStarting(false));
  };
  const beginReplay = (src: string) => {
    if (mode === 'live' && state.runId) liveRunRef.current = state.runId;
    setReplaySrc(src);
    const params = new URLSearchParams(location.search); params.delete('run'); params.set('replay', src); window.history.replaceState(null, '', `?${params}`);
    openReplay(src, speed);
  };
  const toggleSound = () => { const next = !sound; setSound(next); setSoundEnabled(next); if (next) chime('stamp'); };

  const badge = mode === 'replay' ? { text: `REPLAY ×${speed}`, tone: 'replay' }
    : !hasRun ? { text: 'READY', tone: 'preview' }
      : state.status === 'completed' ? { text: 'DONE', tone: 'ok' }
        : state.status === 'failed' ? { text: 'FAILED', tone: 'err' }
          : state.mode === 'mock' ? { text: 'MOCK', tone: 'mock' } : { text: state.mode === 'demo' ? 'DEMO' : 'LIVE', tone: 'live' };
  const maxTime = Math.max(duration, state.t, 1);
  const message = plan ? statusLine(state) : hasRun ? stateLabels[state.status] ?? state.status : 'Describe a business idea, or open a recording.';
  const runTitle = !hasRun
    ? 'Town idle · ready for an idea'
    : `${state.title || 'New company'} · ${state.status === 'awaiting_approval' ? 'Plan ready' : `Day 1 · ${simClock(state.t)}`}`;
  const showShelf = hasRun && approved;
  const showInspector = Boolean(selected);
  const illustrative = mode === 'replay' && isIllustrativeRecording(replaySrc);
  const canPause = mode === 'live' && !history && (state.status === 'running' || state.status === 'paused');
  const showCommand = !publicDemo && mode === 'live' && !hasRun;
  const recordings = publicDemo ? [RECORDINGS[0]] : !RECORDINGS.some(item=>item.value===replaySrc) && mode === 'replay' ? [...RECORDINGS, { value: replaySrc, label: 'Recorded run' }] : RECORDINGS;
  const returnToRun = () => { if(publicDemo){onDemoRestart?.();return;} if (liveRunRef.current) void connectRun(liveRunRef.current).catch(() => {}); else window.location.assign('/'); };

  return <div className="hc-hud" data-guided={guided} data-replay={mode === 'replay'} data-reduced={reducedMotion ? 'true' : 'false'} data-shelf={showShelf} data-inspector={showInspector} data-org={orgChart}>
    {!active && demoControls}
    <header className="hc-topbar">
      <h1 className="hc-brand"><span className="hc-brand-mark" aria-hidden="true"><i /></span>HEADCOUNT: 1</h1>
      <span className="hc-mode" data-mode={badge.tone} title={!hasRun ? 'No run has started.' : connection === 'open' ? undefined : `Connection: ${connection}`}>
        <span className="hc-mode-dot" />{badge.text}
      </span>
      <div className="hc-run-title">{runTitle}{connection !== 'open' && mode === 'live' && hasRun && !runFinished ? ` · ${connection}` : ''}</div>
      <div className="hc-top-actions">
        {mode === 'replay' && <button className="hc-btn" type="button" aria-label={publicDemo?'Restart demo':liveRunRef.current ? 'Return to run' : 'New company'} onClick={returnToRun}>
          <span className="hc-return-long">{publicDemo?'Restart demo':liveRunRef.current ? 'Return to run' : 'New company'}</span><span className="hc-return-short" aria-hidden="true">{publicDemo?'Restart':liveRunRef.current ? 'Return' : 'New'}</span>
        </button>}
        <details className="hc-payroll">
          <summary className="hc-btn hc-payroll-pill" title={`Payroll ${mode === 'replay' ? '(recorded)' : 'this run'} — per-agent breakdown`}>
            <IconCoin size={14} /><span>{state.payroll.credits.toFixed(0)} cr · ${state.payroll.usd.toFixed(2)}</span>
          </summary>
          <div className="hc-payroll-pop">
            <h3 className="hc-section-title">Reported payroll {mode === 'replay' ? '(recorded)' : 'this run'}</h3>
            {(Object.keys(ROSTER) as AgentId[]).map((agent) => {
              const byAgent = state.payroll.byAgent[agent];
              return <div className="hc-payroll-row" key={agent}>
                <span className="hc-agent-dot" style={{ background: ROSTER[agent].color }} />
                <span>{ROSTER[agent].name}</span>
                <span className="hc-payroll-figures">{byAgent.credits.toFixed(0)} cr · ${byAgent.usd.toFixed(2)}{ROSTER[agent].platform === 'creao' && byAgent.usd > 0 ? ' est.' : ''}</span>
              </div>;
            })}
          </div>
        </details>
        <button className="hc-icon-btn hc-run-pause" type="button" aria-label={state.status === 'paused' ? 'Resume run' : 'Pause run'} disabled={!canPause} title={canPause ? undefined : history ? 'Live controls are disabled while viewing history.' : 'Pause is available while a live run is working.'}
          onClick={() => { void (state.status === 'running' ? pause() : resume()).catch(() => {}); }}>{state.status === 'paused' ? <IconPlay size={16} /> : <IconPause size={16} />}</button>
        <button className="hc-btn hc-org-toggle" type="button" aria-label="Org" aria-pressed={orgChart} onClick={() => setOrgChart(!orgChart)} title="Org chart (O)"><IconOrg size={16} /><span>Org</span></button>
        <button className="hc-icon-btn" type="button" aria-pressed={sound} aria-label={sound ? 'Mute sound effects' : 'Turn on sound effects'} title={sound ? 'Sound effects on' : 'Sound effects off'} onClick={toggleSound}>{sound ? <IconSound size={16} /> : <IconMute size={16} />}</button>
      </div>
    </header>

    <div className="hc-stage">
      {showShelf && <Shelf state={state} events={events} selected={selected} waitingOnFounder={waitingOnFounder} hasPlan={Boolean(plan)} showLog={showEvents} logEvents={reachedEvents}
        canShowFinal={state.status === 'completed'} planOpen={planOpen} onSelect={select} onOpenArtifact={setViewerId} onTogglePlan={() => setPlanOpen((v) => !v)}
        onToggleLog={() => setShowEvents((v) => !v)} onFinal={() => setFinalOpen(true)} />}
      <section className="hc-workspace" aria-label="Town canvas">
        {history && <div className="hc-history-banner">Viewing recorded history <button className="hc-btn hc-btn--sm" type="button" onClick={backToLive}>Back to live</button></div>}
        {hudOnly && <div className="hc-narration" role="log" aria-label="Run narration" ref={narrationRef}>
          {narration.map(({ event, text }) => <div className="hc-narration-row" key={event.seq} data-tone={eventTone(event)}>
            <span>{formatClock(event.t)}</span><span>{text}</span>
          </div>)}
          {!narration.length && <p className="hc-shelf-empty">The run's story will appear here as events arrive.</p>}
        </div>}
      </section>
      {showInspector && selected && <aside className="hc-inspector" aria-label={`${ROSTER[selected].name} inspector`}>
        <InspectorAgent key={selected} agent={selected} onOpenArtifact={setViewerId} onClose={() => select(null)} />
      </aside>}
    </div>

    {orgChart && <OrgChart state={state} events={events} reduced={reducedMotion} onClose={() => setOrgChart(false)} />}

    <footer className="hc-bottom">
      {showCommand
        ? <CommandBar idea={idea} error={ideaError} starting={starting} editable={liveEditable} runActive={runActive}
          onIdea={(value) => { setIdea(value); setIdeaError(null); }} onSubmit={startBusiness} />
        : <Timeline message={mode === 'replay' ? `Replaying run · ${formatClock(state.t)} of ${formatClock(maxTime)} · live actions are off` : message}
          hint={mode === 'replay' ? '← / → ±5s · Space pause · R restart' : history ? 'Viewing history' : '← / → ±5s · Space pause'}
          note={illustrative ? 'Illustrative fixture · sample outputs and payroll' : null}
          replay={mode === 'replay'} speed={speed} playing={playing} maxTime={maxTime} history={history} liveLabel={state.status === 'completed' ? 'DONE' : 'LIVE'}
          replaySrc={replaySrc} recordings={recordings} canWatchRun={Boolean(state.runId)}
          onTogglePlay={() => setPlaying(!playing)} onSpeed={setSpeed} onRecording={beginReplay} onWatchRun={() => { if (state.runId) beginReplay(mode === 'replay' ? replaySrc : state.runId); }} onBackToLive={backToLive} />}
    </footer>

    <div className="hc-toasts" aria-label="Notifications">
      {toasts.map((toast) => <ToastRow key={toast.id} toast={toast} onClose={() => setToasts((previous) => previous.filter((item) => item.id !== toast.id))} />)}
    </div>

    {error && <div className="hc-error-bar" role="alert"><strong>Could not load run.</strong><span>{error}</span><button className="hc-btn hc-btn--sm" type="button" onClick={() => beginReplay(replaySrc.startsWith('fixture:') ? replaySrc : 'fixture:golden-boba')}>Try fixture instead</button></div>}

    <dialog className="hc-scrim" ref={modalRef} id="hc-plan-dialog" aria-labelledby="hc-modal-title" onCancel={(event) => { event.preventDefault(); dismissModal(); }} onClose={dismissModal} onMouseDown={(e) => { if (e.target === e.currentTarget) dismissModal(); }}>
      {active && demoControls}
      {active?.kind === 'plan' && plan && <PlanModal key={`${state.runId}:${planSeq}`} plan={plan} editable={canApprovePlan} onApproved={() => { setPlanOpen(false); setPlanAuto(false); planAutoRef.current = planSeq; }} onClose={dismissModal} />}
      {active?.kind === 'question' && <QuestionModal key={active.qid} qid={active.qid} text={active.text} onClose={dismissModal} />}
      {active?.kind === 'viewer' && <ArtifactViewer key={`${state.runId}:${active.artifactId}`} artifactId={active.artifactId} onClose={dismissModal} />}
      {active?.kind === 'final' && <FinalCard key={state.runId} replaySrc={replaySrc} onReplay={publicDemo?()=>onDemoRestart?.():beginReplay} onOpenArtifact={setViewerId} onClose={dismissModal} />}
    </dialog>
  </div>;
}
