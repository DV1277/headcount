import { useEffect, useState } from 'react';
import type { Artifact, ArtifactMeta, BriefPayload, LaunchKitPayload, ResearchPayload, SitePayload } from '@hc/contracts';
import { useStore } from '../data/store';
import { Markdown } from './Markdown';
import { QrCode } from './QrCode';
import { CopyButton, DownloadButton, KIND_META, artifactFileName, formatClock, publicUrlKind, taskStatusMeta, viaLabel } from './lib';

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

function ReviewState({ meta, taskStatus }: { meta: ArtifactMeta & { review?: { verdict: 'accept' | 'revise'; note: string }; stale?: boolean }; taskStatus: string | null }) {
  if (meta.stale) return <span className="hc-task-status" data-tone="muted">— superseded</span>;
  if (meta.review) return <span className="hc-task-status" data-tone={meta.review.verdict === 'accept' ? 'ok' : 'warn'}>{meta.review.verdict === 'accept' ? '✓ accepted' : '↻ revision asked'}</span>;
  if (taskStatus === 'under_review' || taskStatus === 'submitted') return <span className="hc-task-status" data-tone="warn">⧗ in review</span>;
  if (taskStatus === 'failed') return <span className="hc-task-status" data-tone="err">✕ failed</span>;
  return <span className="hc-task-status" data-tone="info">⧗ fresh</span>;
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
          <td><a href={competitor.url} target="_blank" rel="noopener noreferrer nofollow">{competitor.name}</a></td>
          <td>{competitor.priceNote}</td>
          <td>{competitor.notes}</td>
        </tr>)}
      </tbody>
    </table>
    <h4 className="hc-viewer-heading">Gaps to exploit</h4>
    <ul className="hc-viewer-list">{payload.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
    <h4 className="hc-viewer-heading">Sources</h4>
    <ul className="hc-viewer-list hc-viewer-links">{payload.sources.map((source) => <li key={source}><a href={source} target="_blank" rel="noopener noreferrer nofollow">{source}</a></li>)}</ul>
  </>;
}

function SiteViewer({ artifact, payload }: { artifact: Artifact; payload: SitePayload }) {
  const url = artifact.url ?? null;
  const kind = publicUrlKind(url);
  const frameProps = url
    ? { src: url, srcDoc: undefined as string | undefined }
    : { src: undefined as string | undefined, srcDoc: payload.html };
  return <>
    <dl className="hc-viewer-facts">
      <div><dt>Headline</dt><dd>{payload.headline}</dd></div>
      <div><dt>Link</dt><dd className="hc-viewer-url">{url ? <code>{url}</code> : 'No published URL yet'}</dd></div>
    </dl>
    <iframe className="hc-site-frame" title={`Site preview: ${artifact.title}`} sandbox="" referrerPolicy="no-referrer" loading="lazy" {...frameProps} />
    <div className="hc-qr-block">
      {url && kind !== 'local' && kind !== 'none'
        ? <figure className="hc-qr-figure">
          <QrCode value={url} />
          <figcaption>{kind === 'public' ? 'Scan to open this site on your phone.' : 'Works on the venue Wi-Fi only — not on cellular.'}</figcaption>
        </figure>
        : <p className="hc-local-note" data-tone="muted">Local preview only — this link works on this machine until a public URL is configured. Scan-ready QR appears once the site is published to a public address.</p>}
      <div className="hc-viewer-actions">
        {url && <CopyButton text={url} label="Copy link" />}
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
  const status = task ? taskStatusMeta(task.status) : null;
  const viewed = load.kind === 'ok' ? load.artifact : null;
  return <section className="hc-modal hc-modal--wide">
    <header className="hc-modal-head">
      <div>
        <h2 className="hc-modal-title hc-modal-title--small" id="hc-modal-title"><span aria-hidden="true">{KIND_META[meta?.kind ?? 'research'].icon}</span> {meta?.title ?? 'Deliverable'}</h2>
        {meta && <p className="hc-modal-summary">
          {KIND_META[meta.kind].label} · {viaLabel(meta.via)}
          {status && <> · <span className="hc-task-status" data-tone={status.tone}>{status.icon} {status.word}</span></>}
        </p>}
      </div>
      <button className="hc-button hc-icon-button" type="button" aria-label="Close deliverable" onClick={onClose}>✕</button>
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
  const liveEditable = useStore((s) => s.mode === 'live' && !s.history);
  const status = useStore((s) => s.state.status);
  const canAnswer = liveEditable && status === 'awaiting_founder';
  const send = async (answer: string) => {
    try { await useStore.getState().answer(qid, answer); onClose(); }
    catch { onClose(); }
  };
  return <section className="hc-modal">
    <header className="hc-modal-head">
      <div><h2 className="hc-modal-title hc-modal-title--small" id="hc-modal-title">The Mayor has a question</h2></div>
      <button className="hc-button hc-icon-button" type="button" aria-label="Close question" onClick={onClose}>✕</button>
    </header>
    <div className="hc-modal-body">
      <blockquote className="hc-question">{text}</blockquote>
      {!canAnswer && <p className="hc-modal-note" data-tone="muted">Live controls are disabled while viewing a recording.</p>}
      <label className="hc-question-label" htmlFor="hc-question-input">Your answer</label>
      <input id="hc-question-input" className="hc-question-input" value={value} maxLength={1000} disabled={!canAnswer} placeholder="Answer the Mayor (optional)…" onChange={(e) => setValue(e.currentTarget.value)} />
    </div>
    <footer className="hc-modal-foot">
      <button className="hc-button" type="button" disabled={!canAnswer} title={canAnswer ? undefined : 'Live controls are disabled while viewing a recording.'} onClick={() => void send('')}>Skip</button>
      <button className="hc-button hc-button--primary" type="button" disabled={!canAnswer || !value.trim()} title={canAnswer ? undefined : 'Live controls are disabled while viewing a recording.'} onClick={() => void send(value.trim())}>Send answer</button>
    </footer>
  </section>;
}

export function FinalCard({ replaySrc, onClose }: { replaySrc: string; onClose(): void }) {
  const state = useStore((s) => s.state);
  const events = useStore((s) => s.events);
  const mode = useStore((s) => s.mode);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const completed = [...events].reverse().find((e) => e.type === 'run.completed' && e.seq <= state.lastSeq);
  const briefMeta = Object.values(state.artifacts).find((a) => a.kind === 'brief');
  const briefId = briefMeta?.id ?? null;
  useEffect(() => { if (briefId) return loadArtifact(briefId, setLoad); setLoad({ kind: 'error', message: 'no-brief' }); return undefined; }, [briefId]);
  const siteArtifact = Object.values(state.artifacts).find((a) => a.kind === 'site');
  const candidateUrl = completed && completed.type === 'run.completed' ? completed.data.siteUrl ?? siteArtifact?.url ?? null : siteArtifact?.url ?? null;
  const urlKind = publicUrlKind(candidateUrl);
  const deliverables = Object.values(state.artifacts).filter((a) => a.kind !== 'brief');
  const stats = completed && completed.type === 'run.completed' ? completed.data.stats : null;
  const watchAgain = () => { if (state.runId) useStore.getState().openReplay(mode === 'replay' ? replaySrc : state.runId, 1); };
  return <section className="hc-modal hc-modal--final">
    <header className="hc-modal-head">
      <div>
        <h2 className="hc-modal-title" id="hc-modal-title">{state.title || 'Run complete'}</h2>
        <p className="hc-modal-summary">The company finished its work. Here is what it produced{state.mode === 'mock' ? ' in mock mode' : ''}.</p>
      </div>
      <button className="hc-button hc-icon-button" type="button" aria-label="Close final card" onClick={onClose}>✕</button>
    </header>
    <div className="hc-modal-body">
      {stats && <dl className="hc-final-stats">
        <div><dt>Tasks accepted</dt><dd>{stats.tasks}</dd></div>
        <div><dt>Handoffs</dt><dd>{stats.handoffs}</dd></div>
        <div><dt>Revisions</dt><dd>{stats.revisions}</dd></div>
        <div><dt>Minutes</dt><dd>{stats.minutes}</dd></div>
        <div><dt>Credits</dt><dd>{stats.credits.toFixed(2)}</dd></div>
        <div><dt>Cost</dt><dd>${stats.usd.toFixed(2)}</dd></div>
      </dl>}
      {candidateUrl && urlKind !== 'local' && urlKind !== 'none'
        ? <figure className="hc-qr-figure hc-qr-figure--final">
          <QrCode value={candidateUrl} />
          <figcaption>{urlKind === 'public' ? `Scan to open ${candidateUrl}` : `On venue Wi-Fi: ${candidateUrl}`}</figcaption>
        </figure>
        : <p className="hc-local-note" data-tone="muted">{candidateUrl ? 'Site link is local-only for now — it works on this machine, and a public QR appears once a public URL is configured.' : 'No site URL was produced for this run.'}</p>}
      {load.kind === 'ok' && load.artifact.kind === 'brief' && <div className="hc-final-brief">
        <h3 className="hc-section-title">Founder brief</h3>
        <Markdown text={(load.artifact.payload as BriefPayload).markdown} />
        <ol className="hc-viewer-list">{(load.artifact.payload as BriefPayload).nextSteps.map((step) => <li key={step}>{step}</li>)}</ol>
      </div>}
      {(load.kind === 'loading' || load.kind === 'error' || (load.kind === 'ok' && load.artifact.kind !== 'brief')) && <div className="hc-final-brief">
        <h3 className="hc-section-title">{load.kind === 'loading' ? 'Founder brief is loading…' : 'Deliverables'}</h3>
        <ul className="hc-viewer-list">{deliverables.map((a) => <li key={a.id}>{KIND_META[a.kind].icon} {a.title}</li>)}</ul>
      </div>}
      {state.t > 0 && <p className="hc-final-elapsed">Recorded length {formatClock(state.t)}.</p>}
    </div>
    <footer className="hc-modal-foot">
      <button className="hc-button" type="button" onClick={onClose}>Close</button>
      <button className="hc-button hc-button--primary" type="button" disabled={!state.runId} onClick={watchAgain}>{mode === 'replay' ? 'Watch again' : 'Replay this run'}</button>
    </footer>
  </section>;
}
