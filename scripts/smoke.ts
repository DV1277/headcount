/**
 * O3 S-08 end-to-end mock smoke (PRD §16.3): boots the server with
 * HC_MAYOR=mock HC_WORKERS=mock HC_MOCK_SPEED=10 (nothing else), drives one full run
 * over the frozen §8.7 HTTP contracts — create, no dispatch before approval, approve,
 * SSE to run.completed inside 30 s, artifacts, published site, engine invariants —
 * and exits non-zero with explicit reasons. It spawns an isolated child on free ports,
 * tears everything down in `finally`, never reads `.env` and never makes a paid call.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  ArtifactSchema, EventEnvelopeSchema, type Artifact, type EventEnvelope,
} from '@hc/contracts';
import { checkInvariants, initialState, reduce, type TownState } from '@hc/engine';
import { SITE_CSP, siteUrlFor } from '../apps/server/src/sites';

const CTRL_PORT = await claimFreePort();
let SITES_PORT = await claimFreePort();
while(SITES_PORT===CTRL_PORT)SITES_PORT=await claimFreePort();
const RUNS_DIR=await mkdtemp(join(tmpdir(),'headcount-smoke-'));
// URL-derivation parity: the child derives site URLs from this port, so the smoke
// process must apply the same base when it asserts run.completed.siteUrl.
process.env.HC_SITES_PORT = String(SITES_PORT);
process.env.HC_RUNS_DIR=RUNS_DIR;
delete process.env.PUBLIC_BASE_URL;
const BASE = `http://127.0.0.1:${CTRL_PORT}`;
const IDEA = 'a vintage boba cart that serves project-documentation-flavored tea to micro-companies by subscription';
const PRE_APPROVAL_BUDGET_MS = 20_000;
const POST_APPROVAL_BUDGET_MS = 30_000;
const CHILD_LOG_TAIL = 40;

let passed = 0;
const failures: string[] = [];
const childLog: string[] = [];
let child: ChildProcess | undefined;
let collector: Collector | undefined;
let shuttingDown = false;

function fail(message: string): void {
  failures.push(message);
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}
function pass(message: string): void {
  passed += 1;
  console.log(`✓ ${message}`);
}

async function claimFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

function withDeadline<T>(promise: Promise<T>, budgetMs: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not arrive within ${budgetMs} ms.`)), budgetMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* ── contract-faithful HTTP helper ───────────────────────────── */

type FetchResult = { status: number; body: unknown };

async function call(method: string, path: string, input?: unknown, external?: string): Promise<FetchResult> {
  try {
    const response = await fetch(`${external ?? BASE}${path}`, {
      method,
      ...(input === undefined ? {} : {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
      signal: AbortSignal.timeout(4_000),
    });
    const body = response.status === 204 ? null : ((await response.json().catch(() => null)) as unknown);
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: error instanceof Error ? error.message : String(error) };
  }
}

/* ── SSE collector with reconnect drills ─────────────────────── */

class Collector {
  events: EventEnvelope[] = [];
  protocolIssues:string[]=[];
  lastSeq = 0;
  segmentDrops = 0;
  runId: string | null = null;
  private onPlan: (() => void) | undefined;
  private onQuestion: ((qid: string) => void) | undefined;
  private onTerminal: ((envelope: EventEnvelope) => void) | undefined;
  private onEveryPreApproval: ((envelope: EventEnvelope) => void) | undefined;
  private approvalPosted = false;
  private stopped = false;
  private segmentAbort: AbortController | undefined;

  noteApprovalPosted(): void { this.approvalPosted = true; }
  watchPlan(f: () => void): void { this.onPlan = f; }
  watchQuestion(f: (qid: string) => void): void { this.onQuestion = f; }
  watchTerminal(f: (envelope: EventEnvelope) => void): void { this.onTerminal = f; }
  watchEveryPreApproval(f: (envelope: EventEnvelope) => void): void { this.onEveryPreApproval = f; }

  /** Simulate a mid-run connection drop so the next segment proves resume semantics (AC-10.2). */
  dropSegmentOnce(): void {
    this.segmentAbort?.abort();
  }

  stop(): void {
    this.stopped = true;
    this.segmentAbort?.abort();
  }

  connect(runId: string): void { this.runId = runId; }

  async run(): Promise<void> {
    for (;;) {
      if (this.stopped || !this.runId) return;
      let aborted = false;
      const controller = new AbortController();
      this.segmentAbort = controller;
      controller.signal.addEventListener('abort', () => { aborted = true; }, { once: true });
      try {
        const headerResume=this.segmentDrops>=2;
        const response = await fetch(`${BASE}/api/runs/${this.runId}/events${headerResume?'':`?from=${this.lastSeq}`}`, {
          signal: controller.signal,
          headers: { accept: 'text/event-stream', 'cache-control': 'no-cache',...(headerResume?{'Last-Event-ID':String(this.lastSeq)}:{}) },
        });
        if (!response.ok || !response.body) throw new Error(`SSE status ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const flush = (block: string): void => {
          const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
          if (!data) return; // heartbeat comments carry no data line
          const envelope = EventEnvelopeSchema.parse(JSON.parse(data)); // contract drift fails explicitly
          if(envelope.runId!==this.runId)this.protocolIssues.push('SSE delivered a different run.');
          if (envelope.seq <= this.lastSeq) {this.protocolIssues.push(`SSE resume redelivered seq ${envelope.seq} after ${this.lastSeq}.`);return;}
          this.events.push(envelope);
          this.lastSeq = envelope.seq;
          if (envelope.type === 'plan.proposed') this.onPlan?.();
          if (envelope.type === 'founder.question') this.onQuestion?.(envelope.data.qid);
          if (!this.approvalPosted) this.onEveryPreApproval?.(envelope);
          if (envelope.type === 'run.completed' || envelope.type === 'run.failed') {
            const finish = this.onTerminal;
            setImmediate(() => { this.stop(); finish?.(envelope); });
          }
        };
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
          let boundary = buffer.indexOf('\n\n');
          while (boundary !== -1) {
            flush(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf('\n\n');
          }
        }
        flush(buffer);
      } catch (error) {
        if (this.stopped) return;
        if (!aborted) console.error(`· SSE segment ended (${error instanceof Error ? error.message : String(error)}); resuming from seq ${this.lastSeq}`);
        this.segmentDrops += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
}

/* ── boot helper ─────────────────────────────────────────────── */

function spawnControlServer(): void {
  child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: process.env.HOME ?? '/tmp',
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      HC_PORT: String(CTRL_PORT),
      HC_SITES_PORT: String(SITES_PORT),
      HC_MAYOR: 'mock',
      HC_WORKERS: 'mock',
      HC_MOCK_SPEED: '10',
      HC_RUNS_DIR:RUNS_DIR,
    },
  });
  for (const stream of ['stdout', 'stderr'] as const) {
    child[stream]?.setEncoding('utf8');
    child[stream]?.on('data', (text: string) => {
      childLog.push(...text.split('\n'));
      while (childLog.length > CHILD_LOG_TAIL) childLog.shift();
    });
  }
  child.on('exit', (code) => {
    if (!shuttingDown) fail(`Control server exited before the smoke finished (code ${code ?? 'signal'}).`);
  });
}

async function waitHealthy(): Promise<void> {
  const deadline = Date.now() + 15_000;
  let lastBody: unknown;
  while (Date.now() < deadline) {
    const result = await call('GET', '/api/health');
    const body = result.body as { ok?: boolean; mode?: string; stepfun?: string; creao?: string } | null | undefined;
    if (result.status === 200 && body) {
      lastBody = body;
      if (body.ok === true && body.mode === 'mock' && body.stepfun === 'mock' && body.creao === 'mock') {
        pass('/api/health reports a healthy mocked runtime.');
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`/api/health never reported a healthy mock runtime. Last body: ${JSON.stringify(lastBody)}\nChild log:\n${childLog.join('\n')}`);
}

async function ensureSitesListener(): Promise<void> {
  const probe = await call('GET', '/sites/__smoke__', undefined, `http://127.0.0.1:${SITES_PORT}`);
  if(probe.status!==404)throw new Error(`Child must serve a separate sites listener; got ${probe.status}.`);
  const apiProbe=await call('GET','/api/health',undefined,`http://127.0.0.1:${SITES_PORT}`);
  if(apiProbe.status!==404)throw new Error('Sites listener exposed the control API.');
  pass('the child serves a separate sites-only listener.');
}

/* ── phases ──────────────────────────────────────────────────── */

async function createRun(): Promise<string> {
  const list = await call('GET', '/api/runs');
  if (!Array.isArray(list.body)) {
    throw new Error(`The runtime API is not landed yet (preflight GET /api/runs -> ${list.status}: ${JSON.stringify(list.body)}). Smoke stays off until S-01–S-04 ship.`);
  }
  pass('preflight GET /api/runs returns a list.');
  const create = await call('POST', '/api/runs', { idea: IDEA });
  const runId = (create.body as { runId?: string } | null)?.runId;
  if (create.status !== 201 || typeof runId !== 'string' || !runId) {
    throw new Error(`POST /api/runs expected 201 { runId }, got ${create.status}: ${JSON.stringify(create.body)}`);
  }
  pass(`POST /api/runs created run ${runId}.`);
  return runId;
}

const PRE_APPROVAL_FORBIDDEN = new Set(['task.dispatched', 'task.started', 'handoff', 'agent.tool', 'run.finishing']);

async function approveAfterPlan(collector: Collector, runId: string): Promise<EventEnvelope> {
  const answersSent = new Set<string>();
  const observeQuestion = (qid: string): void => {
    if (answersSent.has(qid)) return;
    answersSent.add(qid);
    void (async () => {
      const answer = await call('POST', `/api/runs/${runId}/answer`, { qid, text: 'Yes — proceed with the recommended plan.' });
      if (answer.status !== 204) fail(`POST /answer for ${qid} returned ${answer.status}: ${JSON.stringify(answer.body)}`);
      else pass(`answered founder question ${qid}.`);
    })();
  };

  const planProposed = new Promise<EventEnvelope>((resolve, reject) => {
    collector.watchEveryPreApproval((envelope) => {
      if (!PRE_APPROVAL_FORBIDDEN.has(envelope.type)) return;
      collector.stop(); // halts further SSE reading; the rejection surfaces in main
      reject(new Error(`VIOLATION: ${envelope.type} appeared at seq ${envelope.seq} before plan approval (no dispatch before approval).`));
    });
    collector.watchQuestion(observeQuestion);
    collector.watchTerminal((envelope) => {
      if (envelope.type === 'run.failed') reject(new Error(`Run failed before approval: ${JSON.stringify(envelope.data)}`));
    });
    collector.watchPlan(() => {
      const proposed = [...collector.events].reverse().find((event) => event.type === 'plan.proposed');
      if (proposed) resolve(proposed);
    });
  });
  return await withDeadline(planProposed, PRE_APPROVAL_BUDGET_MS, 'plan.proposed');
}

/* ── main sequence ───────────────────────────────────────────── */

async function main(): Promise<void> {
  spawnControlServer();
  await waitHealthy();
  await ensureSitesListener();

  const startedAt=Date.now();
  const runId = await createRun();
  const watcher = new Collector();
  collector = watcher;
  watcher.connect(runId);
  void watcher.run();

  const proposed = await approveAfterPlan(watcher, runId);
  if (watcher.events.some((event) => PRE_APPROVAL_FORBIDDEN.has(event.type))) {
    throw new Error('A dispatch-like event appeared before approval (defensive recheck failed).');
  }
  const plan = (proposed.data as { plan?: unknown }).plan;
  pass('plan.proposed arrived and every pre-approval event stayed within the plan phase.');
  if (!plan) throw new Error('plan.proposed carried no plan payload.');

  const terminalPromise=new Promise<EventEnvelope>(resolve=>watcher.watchTerminal(resolve));
  watcher.noteApprovalPosted();
  const approval = await call('POST', `/api/runs/${runId}/approve`, { plan });
  if (approval.status !== 204) {
    throw new Error(`POST /approve expected 204, got ${approval.status}: ${JSON.stringify(approval.body)}`);
  }
  pass('plan approved (204).');

  // Reconnect drill: a deliberate drop right after approval proves resume semantics.
  setTimeout(() => watcher.dropSegmentOnce(), 250);
  setTimeout(() => watcher.dropSegmentOnce(), 1250);

  const terminal = await withDeadline(terminalPromise, Math.max(1,POST_APPROVAL_BUDGET_MS-(Date.now()-startedAt)), 'run.completed');
  if (terminal.type === 'run.failed') throw new Error(`Run failed instead of completing: ${JSON.stringify(terminal.data)}`);
  pass(`run.completed reached while reading SSE; segment drops exercised: ${watcher.segmentDrops}.`);

  /* Engine invariants over the collected stream (PRD §16.2). */
  const seqs = watcher.events.map((event) => event.seq);
  if (!seqs.length || !seqs.every((seq, index) => seq === index + 1)) {
    throw new Error(`Collected sequences are not gapless starting at 1: ${JSON.stringify(seqs.slice(0, 6))}…`);
  }
  const issues = checkInvariants(watcher.events);
  if(watcher.protocolIssues.length)throw new Error(watcher.protocolIssues.join('; '));
  if (issues.length) throw new Error(`Engine invariants report: ${issues.join('; ')}`);
  const final = watcher.events.reduce(reduce, initialState());
  if (final.status !== 'completed') throw new Error(`Reduced final status is ${final.status}, not completed.`);
  if(final.payroll.credits!==0||final.payroll.usd!==0)throw new Error('Mock providers must not report synthetic real spend.');
  pass(`engine invariants pass over ${watcher.events.length} collected events; reduced status completed.`);
  for(const task of Object.values(final.tasks).filter(task=>task.def.enabled)){
    if(watcher.events.filter(event=>event.type==='review.verdict'&&event.data.taskId===task.def.id).length!==1)throw new Error(`Mock task ${task.def.id} must receive one Mayor review.`);
  }
  pass('Every enabled department task received one Mayor review.');
  const maker=Object.values(final.tasks).find(task=>task.def.owner==='maker'&&task.def.enabled);
  const herald=Object.values(final.tasks).find(task=>task.def.owner==='herald'&&task.def.enabled);
  const dispatched=(taskId:string)=>watcher.events.find(event=>event.type==='task.dispatched'&&event.data.taskId===taskId);
  const completed=(taskId:string)=>watcher.events.find(event=>event.type==='task.completed'&&event.data.taskId===taskId);
  if(!maker||!herald)throw new Error('Mock plan must enable Maker and Herald.');
  const md=dispatched(maker.def.id),hd=dispatched(herald.def.id),mc=completed(maker.def.id),hc=completed(herald.def.id);
  if(!md||!hd||!mc||!hc||md.seq>=hc.seq||hd.seq>=mc.seq)throw new Error('Maker and Herald did not dispatch in parallel.');
  pass('Maker and Herald overlap after Scout, proving parallel DAG dispatch.');

  /* Server-side reduction check. */
  const stateResponse = await call('GET', `/api/runs/${runId}`);
  const serverState = (stateResponse.body as { state?: TownState } | null)?.state;
  if (stateResponse.status !== 200 || !serverState) {
    throw new Error(`GET /api/runs/${runId} failed with ${stateResponse.status}: ${JSON.stringify(stateResponse.body)}`);
  }
  if (serverState.status !== 'completed') throw new Error(`Server state is ${serverState.status}, not completed.`);
  pass('GET /api/runs/:id reflects a completed run on the server side.');

  /* Artifacts through the frozen contract. */
  const artifactIds = Object.keys(serverState.artifacts ?? {}).slice(0, 6);
  if (!artifactIds.length) throw new Error('No artifacts were produced for a completed run.');
  let siteArtifact: Artifact | undefined;
  for (const artifactId of artifactIds) {
    const artifact = await call('GET', `/api/runs/${runId}/artifacts/${artifactId}`);
    if (artifact.status !== 200) {
      throw new Error(`GET artifact ${artifactId} -> ${artifact.status}: ${JSON.stringify(artifact.body)}`);
    }
    const parsed = ArtifactSchema.parse(artifact.body as unknown);
    if (parsed.id !== artifactId || parsed.runId !== runId) throw new Error(`Artifact ${artifactId} came back with mismatched identity.`);
    if (parsed.kind === 'site') siteArtifact = parsed;
  }
  pass(`fetched ${artifactIds.length} artifacts through the contract endpoint; schema-validated.`);

  /* Published site (HC-F-121) — the proof behind the QR. */
  if (!siteArtifact) throw new Error('No site artifact was produced for a completed mock run.');
  const siteUrl = (terminal.data as { siteUrl?: string | null }).siteUrl;
  if (typeof siteUrl !== 'string' || !siteUrl) throw new Error('run.completed.siteUrl is null although a site artifact exists.');
  const expectedUrl = siteUrlFor(runId);
  if (siteUrl !== expectedUrl) throw new Error(`run.completed.siteUrl ${siteUrl} does not match the deterministic derivation ${expectedUrl}.`);
  const siteResponse = await fetch(siteUrl, { signal: AbortSignal.timeout(4_000) });
  if (siteResponse.status !== 200) throw new Error(`Published site ${siteUrl} responded ${siteResponse.status}.`);
  if (!(siteResponse.headers.get('content-type') ?? '').includes('text/html')) {
    throw new Error(`Published site content-type is ${siteResponse.headers.get('content-type')}; expected text/html.`);
  }
  if (siteResponse.headers.get('content-security-policy') !== SITE_CSP) {
    throw new Error(`Published site CSP is ${JSON.stringify(siteResponse.headers.get('content-security-policy'))}; expected the exact HC-N-021 CSP.`);
  }
  const html = await siteResponse.text();
  const headline = String((siteArtifact.payload as { headline?: unknown }).headline ?? '');
  if (!headline || !html.includes(headline)) throw new Error('Published page does not contain the maker headline.');
  pass(`published site served at ${siteUrl} with the exact HC-N-021 CSP and the headline intact.`);

  /* List-endpoint sweep. */
  const list = await call('GET', '/api/runs');
  const entries = list.body as { runId?: string; status?: string }[];
  if (!Array.isArray(entries) || !entries.some((item) => item.runId === runId && item.status === 'completed')) {
    throw new Error(`GET /api/runs does not list ${runId} as completed: ${JSON.stringify(list.body)}`);
  }
  pass('GET /api/runs lists the completed run.');
}

/* ── orchestration ───────────────────────────────────────────── */

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  shuttingDown = true;
  try { collector?.stop(); } catch { /* already stopped */ }
  if (child?.pid) {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
  const killTimer = setInterval(() => {
    if (child?.exitCode === null) {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }
  }, 2_000);
  const deadline = Date.now() + 2_100;
  while (Date.now() < deadline && child && child.exitCode === null) await new Promise((resolve) => setTimeout(resolve, 50));
  clearInterval(killTimer);
  await rm(RUNS_DIR,{recursive:true,force:true});
  if (failures.length) {
    console.error(`\nSmoke FAILED with ${failures.length} explicit failure(s) after ${passed} passed step(s).`);
  } else {
    console.log(`\nSmoke PASSED: ${passed} steps · isolated child :${CTRL_PORT} · sites :${SITES_PORT}.`);
  }
}
