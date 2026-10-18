// Tiny synthesized cues for the top-bar sound toggle (PRD E12). No audio files, off until the founder opts in.
const KEY = 'hc-sound';
let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
}
export function setSoundEnabled(on: boolean): void {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage can be blocked; the toggle still works for this session */ }
  enabled = on;
}
let enabled = soundEnabled();

function tone(freq: number, start: number, length: number, gain = 0.05): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0, ctx.currentTime + start);
  amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + length);
  osc.connect(amp).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + length + 0.02);
}

/** `stamp`: one short thunk-and-blip for an accepted deliverable. `done`: the run-complete arpeggio. */
export function chime(kind: 'stamp' | 'done'): void {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (kind === 'stamp') { tone(196, 0, 0.09, 0.07); tone(392, 0.07, 0.12); }
    else [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.2));
  } catch { /* audio is a nicety; never break the HUD over it */ }
}
