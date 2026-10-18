import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { EventEnvelope, RunListItem } from '@hc/contracts';
import { initialState, type TownState } from '@hc/engine';
import { RunError, conflict, notFound } from '../runtime/errors';
import { SSE_HEARTBEAT_MS, parseCursor, streamEvents } from './sse';
import { apiRouter, createApiRouter } from './index';
import type { RunManager } from '../runtime/manager';

/* ---------- fixtures ---------- */

const envelope = (seq: number): EventEnvelope => ({
  v: 1, runId: 'run_sse', seq, t: seq * 10,
  at: new Date(1000 + seq * 10).toISOString(),
  type: 'run.paused', data: {},
});

const artifactFixture = {
  id: 'a_research', runId: 'run_sse', taskId: 't1', agent: 'scout', kind: 'research',
  title: 'Fixture research', createdAt: new Date(0).toISOString(), url: 'https://example.com/fixture',
  payload: {
    competitors: [{ name: 'Fixtea', url: 'https://example.com/fixtea', priceNote: '$5', notes: 'fixture competitor' }],
    audience: 'Students', priceBand: '$5-6', gaps: ['Late hours'], sources: ['https://example.com/one'],
  },
} as const;

const validPlan = {
  title: 'Boba plan', summary: 'Ship a boba company.',
  tasks: [
    { id: 't1', owner: 'scout', title: 'Research boba', instructions: 'find competitors', deliverable: 'research', dependsOn: [], enabled: true },
    { id: 't2', owner: 'maker', title: 'Build the site', instructions: 'ship the page', deliverable: 'site', dependsOn: ['t1'], enabled: true },
    { id: 't3', owner: 'herald', title: 'Launch kit', instructions: 'write the posts', deliverable: 'launch_kit', dependsOn: ['t1', 't2'], enabled: true },
  ],
  questions: [],
};

const IDEA = 'late-night boba delivery for UCLA dorms';

function fakeManager(overrides: Record<string, unknown> = {}): RunManager {
  const base = {
    create: vi.fn(async (idea: string) => `run_${idea.slice(0, 4)}`),
    list: vi.fn(async (): Promise<RunListItem[]> => [{ runId: 'run_x', title: 'Old run', status: 'completed', createdAt: new Date(0).toISOString() }]),
    get: vi.fn(async (): Promise<TownState> => initialState()),
    approve: vi.fn(async () => undefined),
    answer: vi.fn(async () => undefined),
    redirect: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    replan: vi.fn(async () => undefined),
    getArtifact: vi.fn(async () => artifactFixture),
    subscribe: vi.fn(async (_runId: string, _listener: (e: EventEnvelope) => void, _from = 0) => ({ history: [], close: () => undefined })),
    dispose: vi.fn(async () => undefined),
  };
  return { ...base, ...overrides } as unknown as RunManager;
}

/* ---------- SSE fake with subscribe-gate semantics ---------- */

class GatedSource {
  history: EventEnvelope[] = [];
  registered = 0;
  closes = 0;
  gate: Promise<void> | undefined;
  private openGate: (() => void) | undefined;
  private listeners = new Set<(e: EventEnvelope) => void>();

  constructor(seed: EventEnvelope[] = []) {
    this.history.push(...seed);
  }

  /** Manager contract: register listener + snapshot history atomically, then resolve. */
  async subscribe(runId: string, listener: (e: EventEnvelope) => void, from = 0): Promise<{ history: EventEnvelope[]; close: () => void }> {
    expect(runId).toBe('run_sse');
    this.registered += 1;
    this.listeners.add(listener);
    const slice = this.history.filter(item => item.seq > from);
    if (this.gate) await this.gate;
    return { history: slice, close: () => { this.closes += 1; this.listeners.delete(listener); } };
  }

  holdWithGate(): void {
    this.gate = new Promise<void>(resolve => {
      this.openGate = resolve;
    });
  }

  releaseGate(): void {
    this.openGate?.();
  }

  emit(item: EventEnvelope): void {
    this.history.push(item);
    for (const listener of [...this.listeners]) listener(item);
  }
}

/* ---------- harness ---------- */

async function withTimeout<T>(promise: Promise<T>, ms = 4000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('SSE read timed out.')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class FrameReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private buffer = '';

  constructor(response: globalThis.Response) {
    this.reader = response.body!.getReader();
  }

  async frames(count: number): Promise<string[]> {
    const collected: string[] = [];
    const take = (): void => {
      for (;;) {
        const end = this.buffer.indexOf('\n\n');
        if (end === -1) break;
        collected.push(this.buffer.slice(0, end + 2));
        this.buffer = this.buffer.slice(end + 2);
      }
    };
    take();
    while (collected.length < count) {
      const chunk = await withTimeout(this.reader.read());
      if (chunk.done) throw new Error(`SSE stream closed early (got ${collected.length}/${count}).`);
      this.buffer += new TextDecoder().decode(chunk.value, { stream: true });
      take();
    }
    return collected.slice(0, count);
  }
}

const parseFrame = (frame: string): { id: number; event: string; data: EventEnvelope } => {
  const lines = frame.split('\n');
  const id = lines.find(line => line.startsWith('id: '))?.slice(4) ?? '';
  const event = lines.find(line => line.startsWith('event: '))?.slice(7) ?? '';
  const data = lines.find(line => line.startsWith('data: '))?.slice(6) ?? '';
  return { id: Number(id), event, data: JSON.parse(data) as EventEnvelope };
};

let server: Server | undefined;

async function listen(app: express.Express): Promise<string> {
  return await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server?.address();
      resolve(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`);
    });
  });
}

function appFor(manager: RunManager): express.Express {
  const app = express();
  // No app-level JSON parser: the router's own guard parses (and maps) bodies
  // so malformed JSON surfaces as a JSON 400 even when mounted standalone.
  app.use('/api', createApiRouter(manager));
  return app;
}

afterEach(async () => {
  await new Promise<void>(resolve => {
    if (!server) { resolve(); return; }
    server.close(() => resolve());
    server.closeAllConnections(); // SSE streams hold sockets open
  });
  server = undefined;
});

/* Health probes must never run for real in this suite, and the lazy singleton
   must never touch the live server's runs directory. */
const ENV_KEYS = ['STEPFUN_API_KEY', 'STEPFUN_BASE_URL', 'CREAO_API_KEY', 'CREAO_APP_KEY', 'CREAO_BASE_URL', 'PUBLIC_BASE_URL',
  'CREAO_SCOUT_APP_ID', 'CREAO_SCOUT_APP_KEY', 'CREAO_MAKER_APP_ID', 'CREAO_MAKER_APP_KEY', 'CREAO_HERALD_APP_ID', 'CREAO_HERALD_APP_KEY',
  'HC_MAYOR', 'HC_WORKERS', 'HC_MODE'];
const savedEnv: Record<string, string | undefined> = {};
const singletonRoot = join(process.cwd(), 'runs', 'api-singleton-test');

beforeAll(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.HC_RUNS_DIR = singletonRoot;
});

afterAll(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  delete process.env.HC_RUNS_DIR;
  await rm(singletonRoot, { recursive: true, force: true });
});

/* ---------- REST §8.7 ---------- */

describe('createApiRouter · REST (§8.7)', () => {
  it('creates runs: 201 + runId, manager receives the trimmed idea', async () => {
    const manager = fakeManager();
    const base = await listen(appFor(manager));
    const response = await fetch(`${base}/api/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idea: `  ${IDEA}  ` }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ runId: 'run_late' });
    expect(manager.create).toHaveBeenCalledWith(IDEA);
  });

  it('rejects malformed ideas with 422 before touching the manager', async () => {
    const manager = fakeManager();
    const base = await listen(appFor(manager));
    for (const body of [{ idea: 'short' }, { idea: 'x'.repeat(281) }, { idea: 42 }, {}]) {
      const response = await fetch(`${base}/api/runs`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      expect(response.status, JSON.stringify(body).slice(0, 40)).toBe(422);
      const payload = await response.json() as { error: { code: string } };
      expect(payload.error.code).toBe('invalid_idea');
    }
    expect(manager.create).not.toHaveBeenCalled();
  });

  it('maps run_active conflicts to 409 with the active runId (HC-F-004)', async () => {
    const manager = fakeManager({ create: async () => { throw conflict('run_active', 'One run is already active.', 'run_live_1'); } });
    const base = await listen(appFor(manager));
    const response = await fetch(`${base}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idea: IDEA }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: 'run_active', message: 'One run is already active.', runId: 'run_live_1' } });
  });

  it('sanitizes unexpected failures (no stack traces or secrets leak)', async () => {
    const manager = fakeManager({ create: async () => { throw new Error('LEAKED_SECRET_ENV_VALUE'); } });
    const base = await listen(appFor(manager));
    const response = await fetch(`${base}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idea: IDEA }) });
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain('LEAKED');
    expect(JSON.parse(text)).toEqual({ error: { code: 'internal', message: 'The server could not complete this request.' } });
  });

  it('returns invalid JSON bodies as 400 without leaking the parse error', async () => {
    const base = await listen(appFor(fakeManager()));
    const response = await fetch(`${base}/api/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"idea":',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'invalid_json', message: 'Request body must be valid JSON.' } });
  });

  it('lists runs and serves run snapshots in the §8.7 shape', async () => {
    const get = vi.fn(async (): Promise<TownState> => initialState());
    const manager = fakeManager({ get });
    const base = await listen(appFor(manager));
    const listed = await fetch(`${base}/api/runs`);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual([{ runId: 'run_x', title: 'Old run', status: 'completed', createdAt: new Date(0).toISOString() }]);
    const snapshot = await fetch(`${base}/api/runs/run_x`);
    expect(snapshot.status).toBe(200);
    expect(await snapshot.json()).toEqual({ state: initialState() });
    get.mockRejectedValueOnce(new RunError(404, 'not_found', 'Unknown run.'));
    const missing = await fetch(`${base}/api/runs/run_nope`);
    expect(missing.status).toBe(404);
    expect((await missing.json() as { error: { code: string } }).error.code).toBe('not_found');
  });

  it('approves valid plans with 204 and rejects invalid ones with 422', async () => {
    const manager = fakeManager();
    const base = await listen(appFor(manager));
    const approval = await fetch(`${base}/api/runs/run_x/approve`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: validPlan }),
    });
    expect(approval.status).toBe(204);
    expect(manager.approve).toHaveBeenCalledWith('run_x', validPlan);
    for (const plan of [null, { tasks: [] }]) {
      const rejected = await fetch(`${base}/api/runs/run_x/approve`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan }),
      });
      expect(rejected.status).toBe(422);
      expect((await rejected.json() as { error: { code: string } }).error.code).toBe('invalid_plan');
    }
    expect(manager.approve).toHaveBeenCalledTimes(1);
  });

  it('answers founder questions: 204 or 422', async () => {
    const manager = fakeManager();
    const base = await listen(appFor(manager));
    const ok = await fetch(`${base}/api/runs/run_x/answer`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ qid: 'q1', text: 'Pickup between classes.' }),
    });
    expect(ok.status).toBe(204);
    expect(manager.answer).toHaveBeenCalledWith('run_x', 'q1', 'Pickup between classes.');
    const skipped = await fetch(`${base}/api/runs/run_x/answer`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ qid: 'q1', text: '' }),
    });
    expect(skipped.status).toBe(204);
    expect(manager.answer).toHaveBeenCalledWith('run_x', 'q1', '');
    const bad = await fetch(`${base}/api/runs/run_x/answer`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ qid: 'q1' }),
    });
    expect(bad.status).toBe(422);
    expect((await bad.json() as { error: { code: string } }).error.code).toBe('invalid_answer');
  });

  it('redirects departments: 204 / 422 / manager 409 passthrough', async () => {
    const redirect = vi.fn(async (_runId: string, _agent: string, note: string) => {
      if (note === 'conflict') throw new RunError(409, 'run_paused', 'Redirect needs a running or paused run.');
    });
    const manager = fakeManager({ redirect });
    const base = await listen(appFor(manager));
    const ok = await fetch(`${base}/api/runs/run_x/redirect`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: 'maker', note: 'make it pink' }),
    });
    expect(ok.status).toBe(204);
    expect(redirect).toHaveBeenCalledWith('run_x', 'maker', 'make it pink');
    const badAgent = await fetch(`${base}/api/runs/run_x/redirect`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: 'mayor', note: 'no' }),
    });
    expect(badAgent.status).toBe(422);
    expect((await badAgent.json() as { error: { code: string } }).error.code).toBe('invalid_redirect');
    const blocked = await fetch(`${base}/api/runs/run_x/redirect`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: 'maker', note: 'conflict' }),
    });
    expect(blocked.status).toBe(409);
    expect((await blocked.json() as { error: { code: string } }).error.code).toBe('run_paused');
  });

  it('routes pause, resume and replan to the manager with 204', async () => {
    const manager = fakeManager();
    const base = await listen(appFor(manager));
    for (const action of ['pause', 'resume', 'replan'] as const) {
      const response = await fetch(`${base}/api/runs/run_x/${action}`, { method: 'POST' });
      expect(response.status, action).toBe(204);
      expect(manager[action], action).toHaveBeenCalledWith('run_x');
    }
  });

  it('serves artifacts and rejects unsafe path ids with 400', async () => {
    const manager = fakeManager();
    const base = await listen(appFor(manager));
    const ok = await fetch(`${base}/api/runs/run_x/artifacts/a_research`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(artifactFixture);
    expect(manager.getArtifact).toHaveBeenCalledWith('run_x', 'a_research');
    for (const path of ['/api/runs/run_x/artifacts/%2e%2e%2fsecret', '/api/runs/..%2Fsecret/artifacts/a_research', '/api/runs/run%20x/artifacts/a_research']) {
      const blocked = await fetch(`${base}${path}`);
      expect(blocked.status, path).toBe(400);
      expect((await blocked.json() as { error: { code: string } }).error.code, path).toMatch(/^bad_(run|artifact)_id$/);
    }
    expect(manager.getArtifact).toHaveBeenCalledTimes(1);
  });

  it('returns 404 JSON for unknown routes and methods', async () => {
    const base = await listen(appFor(fakeManager()));
    for (const [path, init] of [['/api/zzz', {}], ['/api/runs', { method: 'DELETE' }]] as [string, RequestInit][]) {
      const response = await fetch(`${base}${path}`, init as RequestInit);
      expect(response.status, path).toBe(404);
      expect((await response.json() as { error: { code: string } }).error.code).toBe('not_found');
    }
  });

  it('exposes §8.7 health without paid probes when keys are absent', async () => {
    const base = await listen(appFor(fakeManager()));
    const response = await fetch(`${base}/api/health`);
    expect(response.status).toBe(200);
    const health = await response.json() as { ok: boolean; mode: string; stepfun: string; creao: string; missing: string[] };
    expect(health.ok).toBe(false);
    expect(health.mode).toBe('live');
    expect(health.stepfun).toBe('down');
    expect(health.creao).toBe('down');
    expect(health.missing).toContain('STEPFUN_API_KEY');
  });
});

/* ---------- SSE ---------- */

describe('GET /api/runs/:runId/events (SSE)', () => {
  it('writes history first, then buffered live events, in order and exactly once', async () => {
    const source = new GatedSource([envelope(1), envelope(2), envelope(3)]);
    const manager = fakeManager({ subscribe: source.subscribe.bind(source) });
    source.holdWithGate();
    const abort = new AbortController();
    const base = await listen(appFor(manager));
    const responsePromise = fetch(`${base}/api/runs/run_sse/events`, { signal: abort.signal });
    await vi.waitFor(() => expect(source.registered).toBe(1));
    source.emit(envelope(4)); // arrives during the subscribe await: buffered
    source.releaseGate();
    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-store');
    const reader = new FrameReader(response);
    const frames = [...await reader.frames(3), ...await reader.frames(1)];
    expect(frames.map(frame => parseFrame(frame).id)).toEqual([1, 2, 3, 4]);
    expect(frames.map(frame => parseFrame(frame).event)).toEqual(['town', 'town', 'town', 'town']);
    expect(frames[3]).toBe(`id: 4\nevent: town\ndata: ${JSON.stringify(envelope(4))}\n\n`);
    expect(parseFrame(frames[3]).data).toEqual(envelope(4));
    abort.abort();
    await vi.waitFor(() => expect(source.closes).toBe(1));
  });

  it('respects ?from= and the Last-Event-ID header (header wins on conflict)', async () => {
    const source = new GatedSource(Array.from({ length: 5 }, (_, i) => envelope(i + 1)));
    const manager = fakeManager({ subscribe: source.subscribe.bind(source) });
    const base = await listen(appFor(manager));

    const fromParam = await fetch(`${base}/api/runs/run_sse/events?from=2`);
    expect((await new FrameReader(fromParam).frames(3)).map(frame => parseFrame(frame).id)).toEqual([3, 4, 5]);

    const reconnect = await fetch(`${base}/api/runs/run_sse/events`, { headers: { 'Last-Event-ID': '3' } });
    expect((await new FrameReader(reconnect).frames(2)).map(frame => parseFrame(frame).id)).toEqual([4, 5]);

    source.emit(envelope(6));
    const precedence = await fetch(`${base}/api/runs/run_sse/events?from=4`, { headers: { 'Last-Event-ID': '1' } });
    expect((await new FrameReader(precedence).frames(5)).map(frame => parseFrame(frame).id)).toEqual([2, 3, 4, 5, 6]);
  });

  it('rejects invalid cursors with 400 before any stream starts', async () => {
    const source = new GatedSource([envelope(1)]);
    const manager = fakeManager({ subscribe: source.subscribe.bind(source) });
    const base = await listen(appFor(manager));
    for (const [url, headers] of [
      [`${base}/api/runs/run_sse/events?from=-1`, undefined],
      [`${base}/api/runs/run_sse/events?from=x`, undefined],
      [`${base}/api/runs/run_sse/events?from=999999999999999999999999`, undefined],
      [`${base}/api/runs/run_sse/events`, { 'Last-Event-ID': 'abc' }],
      [`${base}/api/runs/run_sse/events`, { 'Last-Event-ID': '1.5' }],
    ] as [string, Record<string, string> | undefined][]) {
      const response = await fetch(url, { headers });
      expect(response.status, url).toBe(400);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect((await response.json() as { error: { code: string } }).error.code).toBe('bad_cursor');
    }
    expect(source.registered).toBe(0);
  });

  it('answers an unknown run with a JSON 404, never an SSE stream', async () => {
    const manager = fakeManager({ subscribe: async () => { throw notFound('run_not_found', 'Unknown run.'); } });
    const base = await listen(appFor(manager));
    const response = await fetch(`${base}/api/runs/run_sse/events`);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect((await response.json() as { error: { code: string } }).error.code).toBe('run_not_found');
  });

  it('survives a disconnect during the subscribe await (no leak, no send)', async () => {
    const source = new GatedSource([envelope(1)]);
    const manager = fakeManager({ subscribe: source.subscribe.bind(source) });
    source.holdWithGate();
    const abort = new AbortController();
    const base = await listen(appFor(manager));
    const responsePromise = fetch(`${base}/api/runs/run_sse/events`, { signal: abort.signal });
    await vi.waitFor(() => expect(source.registered).toBe(1));
    abort.abort();
    source.releaseGate();
    await expect(responsePromise).rejects.toThrow();
    await vi.waitFor(() => expect(source.closes).toBe(1));
  });

  it('unsubscribes and clears the heartbeat when the client disconnects mid-stream', async () => {
    const source = new GatedSource([envelope(1), envelope(2)]);
    const manager = fakeManager({ subscribe: source.subscribe.bind(source) });
    const abort = new AbortController();
    const base = await listen(appFor(manager));
    const response = await fetch(`${base}/api/runs/run_sse/events`, { signal: abort.signal });
    expect((await new FrameReader(response).frames(1)).map(frame => parseFrame(frame).id)).toEqual([1]);
    abort.abort();
    await vi.waitFor(() => expect(source.closes).toBe(1));
    expect(() => source.emit(envelope(3))).not.toThrow();
  });
});

describe('heartbeat framing', () => {
  it('defaults to a 15 s heartbeat and streams comment heartbeats', async () => {
    expect(SSE_HEARTBEAT_MS).toBe(15_000);
    const source = new GatedSource([envelope(1)]);
    const manager = fakeManager({ subscribe: source.subscribe.bind(source) });
    const app = express();
    app.get('/api/runs/:runId/events', (req, res, next) => {
      void streamEvents(req, res, manager, req.params.runId, 20).catch(next);
    });
    app.use(((error: unknown, _req: unknown, res: express.Response, _next: unknown) => {
      const status = error instanceof RunError ? error.status : 500;
      res.status(status).json({ error: { code: 'error', message: 'error' } });
    }) as express.ErrorRequestHandler);
    const base = await listen(app);
    const response = await fetch(`${base}/api/runs/run_sse/events`);
    const frames = await new FrameReader(response).frames(2);
    expect(parseFrame(frames[0])).toMatchObject({ id: 1, event: 'town' });
    expect(frames[1]).toMatch(/^: hb \d+\n\n$/);
  });
});

describe('parseCursor', () => {
  it('accepts only nonnegative integers; empty means absent', () => {
    expect(parseCursor(undefined)).toBeUndefined();
    expect(parseCursor('')).toBeUndefined();
    expect(parseCursor('0')).toBe(0);
    expect(parseCursor('42')).toBe(42);
    expect(parseCursor(['7'])).toBe(7);
    expect(parseCursor('-1')).toBeNull();
    expect(parseCursor('1.5')).toBeNull();
    expect(parseCursor('abc')).toBeNull();
    expect(parseCursor('999999999999999999999999')).toBeNull();
  });
});

/* ---------- lazy singleton (HEAD wiring) ---------- */

describe('apiRouter lazy singleton', () => {
  it('constructs the runtime on first request without upstream calls', async () => {
    const app = express();
    app.use(express.json({ limit: '256kb' }));
    app.use('/api', apiRouter);
    const base = await listen(app);
    // list() is read-only; HC_RUNS_DIR points the singleton at an empty scratch root.
    const response = await fetch(`${base}/api/runs`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
