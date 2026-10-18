import { useEffect, useState } from 'react';
import { ROSTER, type Artifact, type BriefPayload, type LaunchKitPayload, type ResearchPayload, type SitePayload } from '@hc/contracts';
import { useStore } from '../data/store';
import { Markdown } from './Markdown';
import { QrCode } from './QrCode';
import { ARTIFACT_ICON, IconClose, IconExternal, IconReplay, IconWarn } from './icons';
import { CopyButton, DownloadButton, DELIVERABLE_LABEL, artifactFileName, formatClock, isIllustrativeRecording, parseChoices, pillFor, publicUrlKind, safeWebHref, swatchFor, viaLabel } from './lib';
import { Portrait, StatusPill } from './parts';

type Load =
  | { kind: 'loading' }
  | { kind: 'ok'; artifact: Artifact }
  | { kind: 'error'; message: string };

function loadArtifact(artifactId: string, onDone: (load: Load) => void): () => void {
  let alive = true;
  onDone({ kind: 'loading' });
  useStore.getState().getArtifact(artifactId).then(
    (artifact) => { if (alive) onDone({ kind: 'ok', artifact }); },
    (error: unknown) => { if (alive) onDone({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load this deliverable.' }); },
  );
  return () => { alive = false; };
}

function researchText(payload: ResearchPayload): string {
  const lines = [
    '## Competitors',
    ...payload.competitors.map((c) => `- ${c.name} — ${c.url} (${c.priceNote}) · ${c.notes}`),
    '', `Audience: ${payload.audience}`, `Price band: ${payload.priceBand}`, '',
    '## Gaps', ...payload.gaps.map((g) => `- ${g}`), '',
    '## Sources', ...payload.sources.map((s) => `- ${s}`),
  ];
  return lines.join('\n');
}

function launchKitText(payload: LaunchKitPayload): string {
  const lines = [
    '## X post', payload.posts.x, '',
    '## LinkedIn post', payload.posts.linkedin, '',
    '## Instagram caption', payload.posts.instagram, '',
    '## Emails', ...payload.emails.map((email) => `- To ${email.persona}: “${email.subject}”\n\n${email.body}`),
  ];
  return lines.join('\n');
}

function ResearchViewer({ payload }: { payload: ResearchPayload }) {
  return <>
    <dl className="hc-viewer-facts">
      <div><dt>Audience</dt><dd>{payload.audience}</dd></div>
      <div><dt>Price band</dt><dd>{payload.priceBand}</dd></div>
    </dl>
    <table className="hc-comp-table">
      <thead><tr><th scope="col">Competitor</th><th scope="col">Price note</th><th scope="col">Notes</th></tr></thead>
      <tbody>
        {payload.competitors.map((competitor) => <tr key={competitor.url}>
          <td><a href={safeWebHref(competitor.url)} target="_blank" rel="noopener noreferrer nofollow">{competitor.name}</a></td>
          <td>{competitor.priceNote}</td>
          <td>{competitor.notes}</td>
        </tr>)}
      </tbody>
    </table>
    <h4 className="hc-viewer-heading">Gaps to exploit</h4>
    <ul className="hc-viewer-list">{payload.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
    <h4 className="hc-viewer-heading">Sources</h4>
    <ul className="hc-viewer-list hc-viewer-links">{payload.sources.map((source) => <li key={source}><a href={safeWebHref(source)} target="_blank" rel="noopener noreferrer nofollow">{source}</a></li>)}</ul>
  </>;
}

function SiteViewer({ artifact, payload }: { artifact: Artifact; payload: SitePayload }) {
  const rawUrl=artifact.url;
  const bundledPreview=Boolean(rawUrl?.startsWith('/')&&!rawUrl.startsWith('//'));
  const url = rawUrl ? (rawUrl.startsWith('/')&&!rawUrl.startsWith('//')?rawUrl:safeWebHref(rawUrl))??null : null;
  const kind = publicUrlKind(url);
  const frameProps = url
    ? { src: url, srcDoc: undefined as string | undefined }
    : { src: undefined as string | undefined, srcDoc: payload.html };
  return <>
    <dl className="hc-viewer-facts">
      <div><dt>Headline</dt><dd>{payload.headline}</dd></div>
      <div><dt>Link</dt><dd className="hc-viewer-url">{bundledPreview?'Bundled offline preview':url ? <code>{url}</code> : 'No published URL yet'}</dd></div>
    </dl>
    <iframe className="hc-site-frame" title={`Site preview: ${artifact.title}`} sandbox="" referrerPolicy="no-referrer" loading="lazy" {...frameProps} />
    <div className="hc-qr-block">
      {url && kind !== 'local' && kind !== 'none'
        ? <figure className="hc-qr-figure">
          <QrCode value={url} />
          <figcaption>{kind === 'public' ? 'Scan to open this site on your phone.' : 'Works on the venue Wi-Fi only — not on cellular.'}</figcaption>
        </figure>
        : <p className="hc-local-note" data-tone="muted">{bundledPreview?'This saved preview works offline. The final card keeps the original public link and QR.':'Local preview only — this link works on this machine until a public URL is configured. Scan-ready QR appears once the site is published to a public address.'}</p>}
      <div className="hc-viewer-actions">
        {url && !bundledPreview && <CopyButton text={url} label="Copy link" />}
        <DownloadButton name={artifactFileName(artifact.id, 'site')} text={payload.html} mime="text/html" />
      </div>
    </div>
  </>;
}

function LaunchKitViewer({ payload }: { payload: LaunchKitPayload }) {
  const [tab, setTab] = useState<'x' | 'linkedin' | 'instagram' | 'emails'>('x');
  const tabLabel: Record<typeof tab, string> = { x: 'X post', linkedin: 'LinkedIn', instagram: 'Instagram', emails: 'Emails' };
  return <>
    <div className="hc-tabs" role="tablist" aria-label="Launch kit channels">
      {(Object.keys(tabLabel) as (typeof tab)[]).map((key) => <button key={key} role="tab" aria-selected={tab === key} className={`hc-tab${tab === key ? ' hc-tab--active' : ''}`} type="button" onClick={() => setTab(key)}>{tabLabel[key]}</button>)}
    </div>
    {tab === 'emails'
      ? <ul className="hc-email-list">{payload.emails.map((email, index) => <li key={index} className="hc-email">
        <div className="hc-email-head"><strong>{email.persona}</strong><span>{email.subject}</span><CopyButton text={`Subject: ${email.subject}\n\n${email.body}`} label="Copy email" /></div>
        <p className="hc-email-body">{email.body}</p>
      </li>)}</ul>
      : <div className="hc-post-block">
        <p className="hc-post-text">{tab === 'x' ? payload.posts.x : tab === 'linkedin' ? payload.posts.linkedin : payload.posts.instagram}</p>
        <div className="hc-viewer-actions"><CopyButton text={tab === 'x' ? payload.posts.x : tab === 'linkedin' ? payload.posts.linkedin : payload.posts.instagram} /></div>
      </div>}
    <div className="hc-viewer-actions">
      <CopyButton text={launchKitText(payload)} label="Copy all" />
      <DownloadButton name={artifactFileName('launch-kit', 'launch_kit')} text={launchKitText(payload)} mime="text/markdown" />
    </div>
  </>;
}

function BriefViewer({ payload }: { payload: BriefPayload }) {
  return <>
    <Markdown text={payload.markdown} />
    <h4 className="hc-viewer-heading">Next steps</h4>
    <ol className="hc-viewer-list">{payload.nextSteps.map((step) => <li key={step}>{step}</li>)}</ol>
    <div className="hc-viewer-actions">
      <CopyButton text={payload.markdown} />
      <DownloadButton name={artifactFileName('founder-brief', 'brief')} text={payload.markdown} mime="text/markdown" />
    </div>
  </>;
}

export function ArtifactViewer({ artifactId, onClose }: { artifactId: string; onClose(): void }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const state = useStore((s) => s.state);
  useEffect(() => loadArtifact(artifactId, setLoad), [artifactId]);
  const meta = state.artifacts[artifactId];
  const task = meta?.taskId ? state.tasks[meta.taskId] : null;
  const viewed = load.kind === 'ok' ? load.artifact : null;
  const Icon = ARTIFACT_ICON[meta?.kind ?? 'research'];
  const owner = meta ? ROSTER[meta.agent] : null;
  return <section className="hc-modal hc-modal--wide" aria-labelledby="hc-modal-title">
    <header className="hc-modal-head">
      <span className="hc-deliv-icon hc-deliv-icon--lg" style={{ borderColor: owner?.color }}><Icon size={18} /></span>
      <div className="hc-modal-head-main">
        <h2 className="hc-modal-title hc-modal-title--small" id="hc-modal-title">{meta?.title ?? 'Deliverable'}</h2>
        {meta && <p className="hc-modal-summary">
          {DELIVERABLE_LABEL[meta.kind]} · {owner?.name} · {viaLabel(meta.via)}
          {task && <> <StatusPill meta={pillFor(meta.stale ? 'skipped' : task.status)} /></>}
        </p>}
      </div>
      <button className="hc-icon-btn hc-icon-btn--small" type="button" aria-label="Close deliverable" onClick={onClose}><IconClose size={14} /></button>
    </header>
    <div className="hc-modal-body">
      {load.kind === 'loading' && <p className="hc-viewer-loading">Loading this deliverable…</p>}
      {load.kind === 'error' && <p className="hc-modal-note" data-tone="err" role="alert">{load.message}</p>}
      {viewed && viewed.kind === 'research' && <ResearchViewer payload={viewed.payload as ResearchPayload} />}
      {viewed && viewed.kind === 'site' && <SiteViewer artifact={viewed} payload={viewed.payload as SitePayload} />}
      {viewed && viewed.kind === 'launch_kit' && <LaunchKitViewer payload={viewed.payload as LaunchKitPayload} />}
      {viewed && viewed.kind === 'brief' && <BriefViewer payload={viewed.payload as BriefPayload} />}
    </div>
  </section>;
}

export function QuestionModal({ qid, text, onClose }: { qid: string; text: string; onClose(): void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const liveEditable = useStore((s) => s.mode === 'live' && !s.history);
  const status = useStore((s) => s.state.status);
  const canAnswer = liveEditable && status === 'awaiting_founder';
  const choices = parseChoices(text);
  const send = async (answer: string) => {
    try { await useStore.getState().answer(qid, answer); onClose(); }
    catch { setError('Sending failed. See the notice above the town for details.'); }
  };
  const lead = text.trim().split(/(?<=[.!?])\s+/).filter((part) => !part.endsWith('?')).join(' ');
  return <section className="hc-modal hc-modal--question" aria-labelledby="hc-modal-title">
    <header className="hc-question-head">
      <div className="hc-question-who">
        <Portrait agent="mayor" round size={48} />
        <div>
          <h2 className="hc-modal-title" id="hc-modal-title">Mabel needs you</h2>
          <span className="hc-needs"><IconWarn size={14} />FOUNDER NEEDED</span>
        </div>
        <button className="hc-icon-btn hc-icon-btn--small hc-question-close" type="button" aria-label="Close question" onClick={onClose}><IconClose size={14} /></button>
      </div>
      <blockquote className="hc-question">{choices.length && lead ? text.trim().split(/(?<=[.!?])\s+/).filter((part) => part.endsWith('?')).pop() : text}</blockquote>
      <p className="hc-question-sub">{choices.length && lead ? lead : 'The Mayor waits on your answer. Everyone else keeps working.'}</p>
    </header>
    <div className="hc-question-body">
      {!canAnswer && <p className="hc-modal-note" data-tone="muted">Live controls are disabled while viewing a recording.</p>}
      {choices.length > 0 && <div className="hc-choices">
        {choices.map((option) => {
          const swatch = swatchFor(option);
          return <button key={option} type="button" className="hc-choice" disabled={!canAnswer} onClick={() => void send(option)}>
            {swatch && <span className="hc-swatch" style={{ background: swatch }} />}
            <span>{option}</span>
          </button>;
        })}
      </div>}
      {choices.length > 0 && <div className="hc-or"><span>OR IN YOUR OWN WORDS</span></div>}
      <div className="hc-answer-row">
        <input id="hc-question-input" className="hc-input hc-input--lg" value={value} maxLength={1000} disabled={!canAnswer} placeholder="Tell the Mayor what you have in mind…" aria-label="Your answer"
          onChange={(e) => { setValue(e.currentTarget.value); setError(null); }} onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) void send(value.trim()); }} />
        <button className="hc-btn hc-btn--primary hc-btn--lg" type="button" disabled={!canAnswer || !value.trim()} onClick={() => void send(value.trim())}>Send</button>
      </div>
      {error && <p className="hc-modal-note" data-tone="err" role="alert">{error}</p>}
      <p className="hc-question-hint"><span>Esc to answer later. The toast stays until you do.</span>
        <button className="hc-ghost" type="button" disabled={!canAnswer} onClick={() => void send('')}>Skip this question</button></p>
    </div>
  </section>;
}

const LONG_LABEL = { research: 'Research brief', site: 'Landing site', launch_kit: 'Launch kit', brief: 'Founder brief' } as const;
const CONFETTI: readonly (readonly [string, number, number, number, number])[] = [
  ['mayor', 520, 18, -20, 6], ['scout', 560, 40, 3, 8], ['maker', 600, 14, 26, 6], ['herald', 640, 34, -11, 8], ['mayor', 672, 22, 12, 6],
  ['maker', 486, 38, 35, 8], ['scout', 448, 14, -2, 6], ['herald', 410, 32, 21, 8], ['mayor', 360, 16, -16, 6],
];

function firstParagraph(markdown: string): string {
  const para = markdown.split(/\n{2,}/).map((part) => part.trim()).find((part) => part && !/^(#|[-*>\d])/.test(part));
  const plain = (para ?? '').replace(/[*_`#>]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
  return plain.length > 340 ? `${plain.slice(0, 337)}…` : plain;
}

export function FinalCard({ replaySrc, onReplay, onOpenArtifact, onClose }: { replaySrc: string; onReplay(src: string): void; onOpenArtifact(artifactId: string): void; onClose(): void }) {
  const state = useStore((s) => s.state);
  const events = useStore((s) => s.events);
  const mode = useStore((s) => s.mode);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const completed = [...events].reverse().find((e) => e.type === 'run.completed' && e.seq <= state.lastSeq);
  const briefMeta = Object.values(state.artifacts).find((a) => a.kind === 'brief');
  const briefId = briefMeta?.id ?? null;
  useEffect(() => { if (briefId) return loadArtifact(briefId, setLoad); setLoad({ kind: 'error', message: 'no-brief' }); return undefined; }, [briefId]);
  const siteArtifact = Object.values(state.artifacts).find((a) => a.kind === 'site');
  const illustrative = mode === 'replay' && isIllustrativeRecording(replaySrc);
  const candidateUrl = illustrative ? null : completed && completed.type === 'run.completed' ? completed.data.siteUrl ?? siteArtifact?.url ?? null : siteArtifact?.url ?? null;
  const urlKind = publicUrlKind(candidateUrl);
  const deliverables = Object.values(state.tasks).filter((task) => task.def.enabled && task.status !== 'skipped');
  const stats = completed && completed.type === 'run.completed' ? completed.data.stats : null;
  const accepted = deliverables.filter((task) => task.status === 'accepted').length;
  const unreportedCredits = state.mode === 'live' && ['scout', 'maker', 'herald'].some((agent) =>
    events.some((e) => e.type === 'task.started' && e.data.agent === agent) &&
    !events.some((e) => e.type === 'payroll.tick' && e.data.agent === agent && e.data.credits != null));
  const watchAgain = () => { if (state.runId) onReplay(mode === 'replay' ? replaySrc : state.runId); };
  const brief = load.kind === 'ok' && load.artifact.kind === 'brief' ? (load.artifact.payload as BriefPayload) : null;
  const summary = brief ? firstParagraph(brief.markdown) : '';
  const seconds = Math.max(0, Math.round((stats ? stats.minutes * 60 : state.t / 1000)));
  const runTime = stats && stats.minutes && state.t === 0 ? `${stats.minutes} min` : `${Math.floor(state.t / 60000)}m ${String(Math.floor(state.t / 1000) % 60).padStart(2, '0')}s`;
  const host = candidateUrl ? candidateUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : null;
  return <section className="hc-modal hc-modal--final" aria-labelledby="hc-modal-title">
    {CONFETTI.map(([who, left, top, rot, size], index) => <span key={index} className="hc-confetti" aria-hidden="true"
      style={{ left, top, width: size, height: size, rotate: `${rot}deg`, background: `var(--${who})` }} />)}
    <header className="hc-final-head">
      <span className="hc-kicker">FOUNDER BRIEF · {state.runId ?? 'RUN'}</span>
      <h2 className="hc-final-title" id="hc-modal-title">{state.title ? `${state.title} is open.` : 'Run complete.'}</h2>
      <p className="hc-final-summary">{summary || (illustrative ? 'Illustrative fixture: sample deliverables and payroll.' : `The company finished its work${state.mode === 'mock' ? ' in mock mode' : ''}.`)}</p>
      <button className="hc-icon-btn hc-icon-btn--small hc-final-close" type="button" aria-label="Close final card" onClick={onClose}><IconClose size={14} /></button>
    </header>
    <div className="hc-final-mid">
      <div className="hc-final-list">
        <span className="hc-kicker">DELIVERABLES · {accepted} OF {deliverables.length}</span>
        {deliverables.map((task) => {
          const artifact = task.artifactId ? state.artifacts[task.artifactId] : undefined;
          const Icon = ARTIFACT_ICON[task.def.deliverable];
          const owner = ROSTER[task.def.owner];
          return <button key={task.def.id} type="button" className="hc-final-item" disabled={!artifact} onClick={() => artifact && onOpenArtifact(artifact.id)}>
            <span className="hc-deliv-icon hc-deliv-icon--lg" style={{ borderColor: owner.color }}><Icon size={18} /></span>
            <span className="hc-final-item-main"><strong>{LONG_LABEL[task.def.deliverable]}</strong><small>{owner.name} · {artifact?.title ?? task.def.title}</small></span>
            <span className="hc-final-stamp"><StatusPill meta={pillFor(task.status)} stamp /></span>
          </button>;
        })}
      </div>
      <div className="hc-final-qr">
        {candidateUrl && urlKind !== 'local' && urlKind !== 'none'
          ? <>
            <div className="hc-qr-card"><QrCode value={candidateUrl} size={168} /></div>
            <a className="hc-final-host" href={candidateUrl} target="_blank" rel="noopener noreferrer">{host}</a>
            <span className="hc-final-qr-note">{urlKind === 'public' ? 'Scan to open on your phone.' : 'Venue Wi-Fi only — not on cellular.'}</span>
          </>
          : <p className="hc-local-note" data-tone="muted">{illustrative ? 'This fixture has a local site preview. Sample addresses are not published sites.' : candidateUrl ? 'Site link is local-only for now — a public QR appears once a public URL is configured.' : 'No site URL was produced for this run.'}</p>}
      </div>
    </div>
    <dl className="hc-final-stats">
      <div><dt>PAYROLL</dt><dd>{stats ? `${stats.credits.toFixed(0)} cr · $${stats.usd.toFixed(2)}` : `${state.payroll.credits.toFixed(0)} cr · $${state.payroll.usd.toFixed(2)}`}</dd></div>
      <div><dt>RUN TIME</dt><dd>{state.t > 0 ? runTime : `${seconds}s`}</dd></div>
      <div><dt>TASKS</dt><dd>{accepted} of {deliverables.length} accepted</dd></div>
    </dl>
    {unreportedCredits && <p className="hc-local-note hc-final-note">CREAO has not reported all credit usage. Cost totals include reported usage only.</p>}
    {brief && <details className="hc-final-brief">
      <summary>Read the full founder brief</summary>
      <Markdown text={brief.markdown} />
      <ol className="hc-viewer-list">{brief.nextSteps.map((step) => <li key={step}>{step}</li>)}</ol>
    </details>}
    {load.kind === 'error' && briefId && <p className="hc-modal-note hc-final-note" data-tone="err" role="alert">{load.message}</p>}
    <footer className="hc-final-foot">
      <span>{illustrative ? 'Illustrative fixture. ' : ''}Run saved. Replay it any time from the timeline.{state.t > 0 ? ` Length ${formatClock(state.t)}.` : ''}</span>
      <div className="hc-modal-foot-actions">
        <button className="hc-btn hc-btn--lg" type="button" disabled={!state.runId} onClick={watchAgain}><IconReplay size={14} />{mode === 'replay' ? 'Watch again' : 'Replay run'}</button>
        {candidateUrl && urlKind !== 'none' && <a className="hc-btn hc-btn--primary hc-btn--lg" href={candidateUrl} target="_blank" rel="noopener noreferrer">Open site<IconExternal size={14} /></a>}
      </div>
    </footer>
  </section>;
}
