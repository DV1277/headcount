import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ROSTER } from '@hc/contracts';
import { useStore } from '../data/store';
import { IconChevron, IconPause, IconPlay, IconReplay } from './icons';
import { clamp, eventAgent, formatClock } from './lib';

export const IDEA_CHIPS = [
  'Late-night boba delivery for UCLA dorms',
  'AI study-buddy for CS 31',
  'Vintage camera rental in Santa Monica',
];

type CommandProps = {
  idea: string; error: string | null; starting: boolean; editable: boolean; runActive: boolean;
  onIdea(value: string): void; onSubmit(): void;
};

/** Before a run: the only input on screen (PRD §10.8). Chips fill the field; Enter sends the idea to the Mayor. */
export function CommandBar({ idea, error, starting, editable, runActive, onIdea, onSubmit }: CommandProps) {
  const disabled = starting || !editable;
  const submit = (event: FormEvent) => { event.preventDefault(); if (!starting) onSubmit(); };
  return <form className="hc-command" onSubmit={submit}>
    <div className="hc-command-col">
      <div className="hc-command-row">
        <input className="hc-command-input" autoFocus value={idea} maxLength={280} placeholder="What are we building today?" aria-label="Business idea" disabled={disabled}
          onChange={(e) => onIdea(e.currentTarget.value)} />
        <button className="hc-btn hc-btn--primary hc-btn--lg" type="submit" disabled={disabled || runActive}
          title={runActive ? 'One run at a time — this town is already working.' : undefined}>{starting ? 'Opening…' : 'Open for business'}</button>
      </div>
      <div className="hc-chip-row" aria-label="Example ideas">
        {IDEA_CHIPS.map((chip) => <button type="button" key={chip} className="hc-chip" disabled={disabled} title="Use this example idea" onClick={() => onIdea(chip)}>{chip}</button>)}
      </div>
      {runActive && <p className="hc-idea-note" data-tone="muted">One run at a time — this town is already working.</p>}
      {error && <p className="hc-idea-note" data-tone="err" role="alert">{error}</p>}
    </div>
  </form>;
}

function TimelineTrack({ maxTime, live }: { maxTime: number; live: boolean }) {
  const events = useStore((s) => s.events);
  const t = useStore((s) => s.state.t);
  const scrubTo = useStore((s) => s.scrubTo);
  const ticks = useMemo(() => events.filter((event) => event.type !== 'agent.progress'), [events]);
  const pct = clamp(t / maxTime * 100, 0, 100);
  return <div className="hc-track" aria-label={live ? 'Run timeline' : 'Replay timeline'}>
    <div className="hc-track-line" />
    <div className="hc-track-fill" style={{ width: `${pct}%` }} />
    {ticks.map((event) => <span key={event.seq} className="hc-tick" title={`${formatClock(event.t)} · ${event.type}`}
      style={{ left: `${clamp(event.t / maxTime * 100, 0, 99)}%`, backgroundColor: ROSTER[eventAgent(event)].color }} />)}
    <span className="hc-playhead" aria-hidden="true" style={{ left: `${pct}%` }} />
    <input className="hc-scrubber" aria-label={live ? 'Scrub run history' : 'Scrub replay'} aria-valuetext={`${formatClock(t)} of ${formatClock(maxTime)}`} type="range" min="0" max={maxTime} value={clamp(t, 0, maxTime)}
      onChange={(e) => scrubTo(Number(e.currentTarget.value))}
      onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); scrubTo(clamp(t + (event.key === 'ArrowRight' ? 5000 : -5000), 0, maxTime)); } }} />
  </div>;
}

export type Recording = { value: string; label: string };

function ReplayMenu({ speed, replaying, canWatchRun, recordings, current, onSpeed, onRecording, onWatchRun }: {
  speed: number; replaying: boolean; canWatchRun: boolean; recordings: Recording[]; current: string;
  onSpeed(speed: number): void; onRecording(value: string): void; onWatchRun(): void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  return <div className="hc-menu" ref={ref}>
    <button type="button" className="hc-btn hc-btn--chip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
      <IconReplay size={14} /><span className="hc-mono">replay ×{speed}</span><IconChevron size={14} />
    </button>
    {open && <div className="hc-menu-pop" role="menu">
      <h4 className="hc-menu-title">Speed</h4>
      <div className="hc-menu-speeds">{[1, 2, 4, 8, 20].map((n) => <button key={n} type="button" role="menuitemradio" aria-checked={speed === n} className="hc-speed-opt" onClick={() => onSpeed(n)}>×{n}</button>)}</div>
      {canWatchRun && <button type="button" role="menuitem" className="hc-menu-item" onClick={() => { setOpen(false); onWatchRun(); }}>{replaying ? 'Restart this run' : 'Replay this run'}</button>}
      <h4 className="hc-menu-title">Recordings</h4>
      {recordings.map((item) => <button key={item.value} type="button" role="menuitemradio" aria-checked={replaying && current === item.value} className="hc-menu-item" onClick={() => { setOpen(false); onRecording(item.value); }}>{item.label}</button>)}
    </div>}
  </div>;
}

type TimelineProps = {
  message: string; hint: string; replay: boolean; speed: number; playing: boolean; maxTime: number; history: boolean;
  liveLabel: string; replaySrc: string; recordings: Recording[]; canWatchRun: boolean; note: string | null;
  onTogglePlay(): void; onSpeed(speed: number): void; onRecording(value: string): void; onWatchRun(): void; onBackToLive(): void;
};

export function Timeline(p: TimelineProps) {
  const t = useStore((s) => s.state.t);
  return <div className="hc-timeline">
    <div className="hc-timeline-status">
      <div className="hc-timeline-msg">
        {p.replay ? <span className="hc-badge hc-badge--dark">REPLAY ×{p.speed}</span> : <span className="hc-badge"><span className="hc-live-dot" />{p.liveLabel}</span>}
        <span className="hc-timeline-message">{p.message}</span>
      </div>
      <span className="hc-shortcut-hint">{p.note ?? p.hint}</span>
    </div>
    <div className="hc-timeline-row">
      {p.replay && <button className="hc-icon-btn hc-icon-btn--small" type="button" aria-label={p.playing ? 'Pause replay' : 'Play replay'} onClick={p.onTogglePlay}>{p.playing ? <IconPause size={14} /> : <IconPlay size={14} />}</button>}
      <span className="hc-time">{formatClock(t)}</span>
      <TimelineTrack maxTime={p.maxTime} live={!p.replay} />
      {p.history && <button className="hc-btn hc-btn--sm" type="button" onClick={p.onBackToLive}>Back to live</button>}
      <ReplayMenu speed={p.speed} replaying={p.replay} canWatchRun={p.canWatchRun} recordings={p.recordings} current={p.replaySrc}
        onSpeed={p.onSpeed} onRecording={p.onRecording} onWatchRun={p.onWatchRun} />
    </div>
  </div>;
}
