import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { DEMO_RECORDING } from '../data/siteUrl';
import { buildDemoChapters } from './chapters';
import { Portrait } from '../ui/parts';
import { IconPause, IconPlay, IconReplay } from '../ui/icons';
import '../styles/demo.css';

/** The director only presents captured events. It never invokes the agent APIs. */
export function useDemoTour(enabled: boolean) {
  const events = useStore(s => s.events);
  const t = useStore(s => s.state.t);
  const error = useStore(s => s.error);
  const chapters = useMemo(() => buildDemoChapters(events), [events]);
  const [phase, setPhase] = useState<'intro' | 'prompt' | 'running'>('intro');
  const [index, setIndex] = useState(0);
  const [guided, setGuided] = useState(true);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [typed, setTyped] = useState(0);
  const idea = events[0]?.type === 'run.created' ? events[0].data.idea : 'Late-night boba delivery for UCLA dorms';
  const chapter = chapters[index] ?? null;
  const complete = chapter?.view === 'final';

  useEffect(() => {
    if (!enabled) return;
    setPhase('intro'); setIndex(0); setGuided(true); setPaused(false); setHolding(false); setTyped(0);
    useStore.getState().openReplay(DEMO_RECORDING, 8, false);
    return () => useStore.getState().setPlaying(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || phase !== 'prompt') return;
    if (typed < idea.length) {
      const timer = setTimeout(() => setTyped(n => n + 1), 32);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => { setPhase('running'); useStore.getState().setPlaying(true); }, 1100);
    return () => clearTimeout(timer);
  }, [enabled, phase, typed, idea]);

  useEffect(() => {
    if (!enabled || phase !== 'running' || !guided || paused || holding) return;
    const next = chapters[index + 1];
    if (!next || t < next.t) return;
    // Pause at the observed event, leaving the simulation's cue animations intact.
    useStore.getState().setPlaying(false);
    setIndex(index + 1);
    if (next.holdMs > 0) setHolding(true);
    else if (next.view !== 'final') useStore.getState().setPlaying(true);
  }, [enabled, phase, guided, paused, holding, chapters, index, t]);

  useEffect(() => {
    if (!holding || paused || !guided || phase !== 'running') return;
    const timer = setTimeout(() => {
      setHolding(false);
      if (chapter?.view !== 'final') useStore.getState().setPlaying(true);
    }, chapter?.holdMs ?? 0);
    return () => clearTimeout(timer);
  }, [holding, paused, guided, phase, chapter]);

  const restart = () => {
    useStore.getState().setPlaying(false);
    useStore.getState().scrubTo(0);
    useStore.getState().setSpeed(8);
    setIndex(0); setGuided(true); setPaused(false); setHolding(false); setTyped(0); setPhase('prompt');
  };
  const jump = (next: number) => {
    const target = chapters[next]; if (!target) return;
    useStore.getState().scrubTo(target.t);
    setIndex(next); setGuided(true); setPhase('running'); setPaused(false);
    setHolding(target.holdMs > 0);
    if (!target.holdMs && target.view !== 'final') useStore.getState().setPlaying(true);
  };
  const togglePause = () => {
    setPaused(value => !value);
    if (!paused) useStore.getState().setPlaying(false);
    else if (!holding && !complete) useStore.getState().setPlaying(true);
  };
  const explore = () => {
    useStore.getState().setPlaying(false); setGuided(false); setHolding(false); setPaused(true);
  };
  const resume = () => {
    const current = chapters.reduce((last,c,i)=>c.t<=useStore.getState().state.t?i:last,0);
    jump(current);
  };
  const intro = enabled && phase !== 'running' ? <div className="hc-demo-intro">
    <section className="hc-demo-invitation" aria-labelledby="demo-title">
      <span className="hc-kicker">HEADCOUNT: 1 · A REAL RUN, REPLAYED</span>
      <h2 id="demo-title">One idea.<br />A company gets to work.</h2>
      <p>You give the direction. Mabel plans, Rio researches, Juno builds, and Pip prepares the launch.</p>
      <div className="hc-demo-team" aria-label="The company">
        {(['mayor', 'scout', 'maker', 'herald'] as const).map(agent => <Portrait key={agent} agent={agent} size={44} round />)}
      </div>
      <div className="hc-demo-prompt">
        <span className="hc-kicker">THE FOUNDER’S STARTING PROMPT</span>
        <p>{phase === 'prompt' ? idea.slice(0, typed) : idea}<span className="hc-demo-caret" aria-hidden="true">▍</span></p>
      </div>
      {phase === 'intro' ? <button className="hc-btn hc-btn--primary hc-btn--lg" type="button" disabled={!events.length || !!error} onClick={restart}><IconPlay size={16} />Watch the end-to-end demo</button>
        : <p className="hc-demo-sending" role="status">{typed < idea.length ? 'Replaying the founder’s prompt…' : 'Sending the idea to Mayor Mabel…'}</p>}
      <p className="hc-demo-fine">Town and HUD designed in <a href="https://app.paper.design/file/01M579A4RA58NP21Q5HRB94MVA/p-2-0" target="_blank" rel="noopener noreferrer">Paper</a>.</p>
      <p className="hc-demo-fine">About 3 minutes · automatic HUD tour · real StepFun + CREAO outputs</p>
      <p className="hc-demo-fine">A replay of a completed real run, with its generated site hosted here.</p>
      {error && <p role="alert">{error}</p>}
    </section>
  </div> : null;
  const controls = !enabled || phase !== 'running' ? null : !guided ? <div className="hc-demo-resume">
    <button className="hc-btn hc-btn--primary" type="button" onClick={resume}>Resume guided tour</button>
    <button className="hc-btn" type="button" onClick={restart} aria-label="Restart demo"><IconReplay size={16} /></button>
  </div> : <section className="hc-demo-controls" aria-label="Guided demo controls">
    <div className="hc-demo-chapter"><span className="hc-kicker">RECORDED REAL RUN · {index + 1} / {chapters.length}</span>
      <strong>{chapter?.title ?? 'The company is working'}</strong>
      <p>{chapter?.detail}</p>
    </div>
    <div className="hc-demo-actions">
      {!complete && <button className="hc-btn hc-btn--primary" type="button" onClick={togglePause} aria-label={paused ? 'Resume guided demo' : 'Pause guided demo'}>{paused ? <IconPlay size={14} /> : <IconPause size={14} />}{paused ? 'Resume' : 'Pause'}</button>}
      {!complete && <button className="hc-btn" type="button" onClick={() => jump(index + 1)}>Next chapter →</button>}
      <button className="hc-btn" type="button" onClick={complete ? restart : explore}>{complete ? 'Watch again' : 'Explore freely'}</button>
      {complete && <button className="hc-btn" type="button" onClick={explore}>Explore outputs</button>}
    </div>
  </section>;
  return { intro, controls, chapter: enabled && phase === 'running' && guided ? chapter : null, guided: enabled && guided, restart };
}
