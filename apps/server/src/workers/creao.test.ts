// A-05/A-06 CREAO worker: realtime NDJSON parsing, single-run convergence, async fallback,
// app mode, typed failures, external abort. All integrations are mocked; no live CREAO calls.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mayor, Usage } from '../mayor';
import type { WorkerEvent, WorkerInput, WorkerResult } from './index';
import { createCreaoWorker, type CreaoWorkerOptions } from './creao-worker';

const VALID_RESEARCH = {
  competitors: [{ name: 'Boba Guys', url: 'https://bobaguys.com/boba', priceNote: '$6–8', notes: 'closes 22:00' }, { name: 'Mogi Boba', url: 'https://mogi.example.com/boba', priceNote: '$5', notes: 'Westwood only' }],
  audience: 'UCLA students in dorms',
  priceBand: '$5–8',
  gaps: ['nothing open after 22:00', 'no dorm delivery'],
  sources: ['https://bobaguys.com/boba', 'https://yelp.com/boba-la'],
};

const FENCED = `\`\`\`json\n${JSON.stringify(VALID_RESEARCH, null, 2)}\n\`\`\``;

vi.mock('../../../../integrations/index.mjs', () => ({
  creao: {
    createRealtimeRun: vi.fn(),
    createRun: vi.fn(),
    createAppRunWith: vi.fn(),
    getRun: vi.fn(),
    getAppRunWith: vi.fn(),
    waitForRun: vi.fn(),
  },
}));

import { creao } from '../../../../integrations/index.mjs';

const mocked = creao as unknown as {
  createRealtimeRun: ReturnType<typeof vi.fn>;
  createRun: ReturnType<typeof vi.fn>;
  createAppRunWith: ReturnType<typeof vi.fn>;
  getRun: ReturnType<typeof vi.fn>;
  getAppRunWith: ReturnType<typeof vi.fn>;
};

function scoutInput(deliverable: WorkerInput['task']['deliverable'] = 'research'): WorkerInput {
  return {
    runId: 'run_x',
    task: { id: 't1', owner: 'scout', title: 'Market research', instructions: 'Find competitors.', deliverable, dependsOn: [], enabled: true },
    idea: 'Late-night boba delivery for UCLA dorms',
    inputs: [],
    founderNotes: ['keep it under $20/month'],
    siteUrl: 'http://127.0.0.1:8788/run_x/',
  };
}

/** NDJSON response whose body closes after yielding all chunks (fragmentation possible). */
function ndjson(lines: string[], splitEvery = 64): { body: ReadableStream<Uint8Array> } {
  const text = lines.join('\n') + '\n';
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += splitEvery) chunks.push(bytes.slice(i, i + splitEvery));
  return {
    body: new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(ch);
        c.close();
      },
    }),
  };
}

/** A stream that never emits; like a real fetch, an abort rejects the pending read. */
function stalledStream(signal: AbortSignal): { body: ReadableStream<Uint8Array> } {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      signal.addEventListener('abort', () => c.error(new Error('The operation was aborted')), { once: true });
    },
    pull() {
      return new Promise<never>(() => {}); // never yields data
    },
  });
  return { body };
}

function fakeMayor(): { mayor: Mayor; repairCount: () => number } {
  let n = 0;
  const mayor = {
    plan: vi.fn(async () => { throw new Error('unused'); }),
    review: vi.fn(async () => { throw new Error('unused'); }),
    brief: vi.fn(async () => { throw new Error('unused'); }),
    say: vi.fn(async () => { throw new Error('unused'); }),
    cover: vi.fn(async () => { throw new Error('unused'); }),
    repairJson: vi.fn(async () => {
      n++;
      return { value: null, usage: { tokensIn: 0, tokensOut: 0 } as Usage };
    }),
  } as unknown as Mayor;
  return { mayor, repairCount: () => n };
}

const optsFor = (intervalMs = 40, noEventTimeoutMs = 250): CreaoWorkerOptions => ({ intervalMs, noEventTimeoutMs, progressIntervalMs: 100 });

beforeEach(() => {
  vi.stubEnv('CREAO_API_MODE', 'account');
  vi.stubEnv('CREAO_SCOUT_AGENT_ID', 'ag_scout');
  vi.stubEnv('CREAO_API_KEY', 'cr_sk_test');
  vi.stubEnv('HC_MAYOR', 'mock');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('CREAO worker / account realtime (rung A)', () => {
  it('maps the full NDJSON timeline to events across fragmented chunks and tolerates garbage lines', async () => {
    mocked.createRealtimeRun.mockResolvedValue(ndjson(
      [
        `{"type":"run.created","run_id":"r_1"}`,
        `{"type":"tool.started","tool":"browser","title":"Opening competitor pricing page"}`,
        `{"type":"search.started","query":"late night boba UCLA"}`,
        `not json at all`, // must be skipped, never crash the stream
        `{"type":"output_text.delta","delta":"found "}`,
        `{"type":"output_text.delta","delta":"3 gaps"}`,
        `{"type":"artifact.created","title":"sources.md"}`,
        `{"type":"run.completed","result":${JSON.stringify(FENCED)},"usage":{"credits":4}}`,
      ],
      17, // aggressive fragmentation: chunk borders fall inside JSON lines
    ));
    const events: WorkerEvent[] = [];
    const res = await createCreaoWorker('scout', optsFor()).run(scoutInput(), (e) => events.push(e), new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.via).toBe('creao-realtime');
      expect(res.credits).toBe(4);
      expect((res.payload as { competitors: unknown[] }).competitors).toHaveLength(2);
    } else throw new Error('expected ok');
    expect(events[0]).toEqual({ kind: 'started', externalRunId: 'r_1' });
    expect(events.filter((e) => e.kind === 'tool').some((e) => 'tool' in e && e.tool === 'search' && e.label.startsWith('Searching:'))).toBe(true);
    expect(events.filter((e) => e.kind === 'tool').some((e) => 'tool' in e && e.tool === 'browser' && e.label === 'Opening competitor pricing page')).toBe(true);
    expect(events.some((e) => e.kind === 'progress' && e.note.includes('Writing…'))).toBe(true);
    expect(events.some((e) => e.kind === 'progress' && e.note.includes('Artifact: sources.md'))).toBe(true);
  });

  it('returns run-failed with a retryable upstream error', async () => {
    mocked.createRealtimeRun.mockResolvedValue(ndjson([
      `{"type":"run.created","run_id":"r_f"}`,
      `{"type":"run.failed","error":"agent crashed"}`,
    ]));
    const res = await createCreaoWorker('scout', optsFor()).run(scoutInput(), () => {}, new AbortController().signal);
    expect(res).toMatchObject({ ok: false, error: { code: 'upstream' }, retryable: true });
    expect((res as { error: { message: string } }).error.message).toContain('agent crashed');
  });

  it('falls back to polling the SAME run when the stream ends mid-flight (no duplicate create)', async () => {
    mocked.createRealtimeRun.mockResolvedValue(ndjson([`{"type":"run.created","run_id":"r_9"}`]));
    mocked.getRun.mockResolvedValueOnce({ status: 'running' }).mockResolvedValueOnce({ status: 'completed', result: FENCED, usage: { credits: 2 } });
    const res = await createCreaoWorker('scout', optsFor()).run(scoutInput(), () => {}, new AbortController().signal);
    expect(res.ok).toBe(true);
    expect((res as { ok: true } & { via: string }).via).toBe('creao-async');
    expect((res as { credits: number }).credits).toBe(2);
    expect(mocked.createRun).not.toHaveBeenCalled(); // never duplicate a run that exists
    expect(mocked.getRun).toHaveBeenCalledWith('r_9');
  });

  it('repairs unparseable realtime output with exactly one Mayor call', async () => {
    mocked.createRealtimeRun.mockResolvedValue(ndjson([`{"type":"run.completed","result":"the agent wrote prose, no JSON"}`]));
    const { mayor } = fakeMayor();
    vi.mocked(mayor.repairJson).mockImplementation(async () => ({ value: VALID_RESEARCH, usage: { tokensIn: 5, tokensOut: 9 } as Usage }));
    const res = await createCreaoWorker('scout', { ...optsFor(), mayor }).run(scoutInput(), () => {}, new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.via).toBe('creao-realtime');
    expect(res.mayorUsage).toEqual({ tokensIn: 5, tokensOut: 9 });
    expect(vi.mocked(mayor.repairJson).mock.calls).toHaveLength(1);
    expect(vi.mocked(mayor.repairJson).mock.calls[0]?.[0]).toMatchObject({ schemaName: 'research' });
  });

  it('reports unparseable when the repair also fails (never fabricates)', async () => {
    mocked.createRealtimeRun.mockResolvedValue(ndjson([`{"type":"run.completed","result":"prose"}`]));
    const { mayor } = fakeMayor();
    vi.mocked(mayor.repairJson).mockResolvedValue({ value: null, usage: { tokensIn: 7, tokensOut: 3 } });
    const res = await createCreaoWorker('scout', { ...optsFor(), mayor }).run(scoutInput(), () => {}, new AbortController().signal);
    expect(res).toMatchObject({ ok: false, error: { code: 'unparseable' }, retryable: false });
    expect(res.mayorUsage).toEqual({ tokensIn: 7, tokensOut: 3 });
  });
});

describe('CREAO worker / rung B fallback', () => {
  it('creates one async run and polls by interval with a heartbeat, then completes', async () => {
    mocked.createRealtimeRun.mockRejectedValueOnce(new Error('no realtime support'));
    mocked.createRun.mockResolvedValue({ run_id: 'r_async' });
    mocked.getRun.mockResolvedValueOnce({ status: 'running' }).mockResolvedValueOnce({ status: 'running' }).mockResolvedValue({ status: 'completed', result: FENCED, usage: { credits: 7 } });
    const events: WorkerEvent[] = [];
    const res = await createCreaoWorker('scout', optsFor(40, 60)).run(scoutInput(), (e) => events.push(e), new AbortController().signal);
    expect(res).toMatchObject({ ok: true, via: 'creao-async', credits: 7 });
    expect(mocked.createRun).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.kind === 'progress' && e.note.includes('Running (async)…'))).toBe(true);
    expect(events.some((e) => e.kind === 'progress' && e.note.includes('Writing…'))).toBe(false); // no fake realtime text
  });

  it('switches rungs on the watchdog when the stream emits nothing for noEventTimeoutMs', async () => {
    mocked.createRealtimeRun.mockImplementation(async (_agentId: unknown, _envelope: unknown, o?: { signal?: AbortSignal }) =>
      stalledStream((o?.signal ?? new AbortController().signal) as AbortSignal));
    mocked.createRun.mockResolvedValue({ run_id: 'r_watchdog' });
    mocked.getRun.mockResolvedValue({ status: 'completed', result: FENCED, usage: { credits: 1 } });
    const res = await createCreaoWorker('scout', optsFor(40, 90)).run(scoutInput(), () => {}, new AbortController().signal);
    expect(res).toMatchObject({ ok: true, via: 'creao-async' });
    expect(mocked.createRun).toHaveBeenCalledTimes(1); // exactly one async run, no duplicates
  });

  it('propagates a failed async run as retryable upstream', async () => {
    vi.mocked(mocked.createRealtimeRun).mockRejectedValueOnce(new Error('no realtime support'));
    mocked.createRun.mockResolvedValue({ run_id: 'r_bad' });
    mocked.getRun.mockResolvedValueOnce({ status: 'failed', error: 'quota exhausted', usage: { credits: 2 } });
    const res = await createCreaoWorker('scout', optsFor()).run(scoutInput(), () => {}, new AbortController().signal);
    expect(res).toMatchObject({ ok: false, error: { code: 'upstream' }, retryable: true });
    expect((res as { error: { message: string } }).error.message).toContain('quota exhausted');
    expect(res.credits).toBe(2);
  });

  it('becomes cancelled and stops polling when the executor aborts', async () => {
    vi.mocked(mocked.createRealtimeRun).mockRejectedValueOnce(new Error('no realtime support'));
    mocked.createRun.mockResolvedValue({ run_id: 'r_slow' });
    mocked.getRun.mockImplementation(async () => new Promise((resolve) => setTimeout(() => resolve({ status: 'running' }), 30)));
    const controller = new AbortController();
    const p = createCreaoWorker('scout', optsFor(25, 100)).run(scoutInput(), () => {}, controller.signal);
    setTimeout(() => controller.abort(), 80);
    const res = await p;
    expect(res).toMatchObject({ ok: false, error: { code: 'cancelled' }, retryable: false });
    const calls = mocked.getRun.mock.calls.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(mocked.getRun.mock.calls.length).toBe(calls); // polling stopped for good
  });
});

describe('CREAO worker / app mode (async-only, documented)', () => {
  it('keeps polling the same external run after 429 and 503, without creating a duplicate', async () => {
    vi.stubEnv('CREAO_API_MODE', 'app'); vi.stubEnv('CREAO_SCOUT_APP_ID', 'app_scout'); vi.stubEnv('CREAO_APP_KEY', 'capi_transient');
    mocked.createAppRunWith.mockResolvedValue({ id: 'r_existing' });
    mocked.getAppRunWith.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }))
      .mockResolvedValue({ status: 'completed', result: { chatText: FENCED } });
    const events: WorkerEvent[] = [];
    const result = await createCreaoWorker('scout', { intervalMs: 5, retryDelayMs: 5 }).run(scoutInput(), e => events.push(e), new AbortController().signal);
    expect(result).toMatchObject({ ok: true, via: 'creao-async' });
    expect(mocked.createAppRunWith).toHaveBeenCalledTimes(1);
    expect(mocked.getAppRunWith.mock.calls.every(call => call[2] === 'r_existing')).toBe(true);
    expect(events.some(e => e.kind === 'progress' && e.note.includes('rate limit'))).toBe(true);
  });
  it('never calls the realtime endpoint and polls via the app API with the given key', async () => {
    vi.stubEnv('CREAO_API_MODE', 'app');
    vi.stubEnv('CREAO_SCOUT_APP_ID', 'app_scout');
    vi.stubEnv('CREAO_APP_KEY', 'capi_shared');
    mocked.createAppRunWith.mockResolvedValue({ run_id: 'r_app' });
    mocked.getAppRunWith.mockResolvedValueOnce({ status: 'RUNNING' }).mockResolvedValue({ status: 'COMPLETED', result: { text: '{"competitorCount":3}', chatText: FENCED }, usage: { credits: 9 } });
    const res = await createCreaoWorker('scout', optsFor()).run(scoutInput(), () => {}, new AbortController().signal);
    expect(res).toMatchObject({ ok: true, via: 'creao-async', credits: 9 });
    expect(mocked.createRealtimeRun).not.toHaveBeenCalled();
    expect(mocked.createAppRunWith).toHaveBeenCalledWith('app_scout', 'capi_shared', expect.anything(), expect.objectContaining({ signal: expect.anything() }));
    expect(mocked.getAppRunWith).toHaveBeenCalledWith('app_scout', 'capi_shared', 'r_app', expect.anything());
  });

  it('fails typed and calls nothing when the app config is incomplete', async () => {
    vi.stubEnv('CREAO_API_MODE', 'app');
    vi.stubEnv('CREAO_SCOUT_APP_ID', '');
    vi.stubEnv('CREAO_APP_KEY', '');
    const res = await createCreaoWorker('scout', optsFor()).run(scoutInput(), () => {}, new AbortController().signal);
    expect(res).toMatchObject({ ok: false, error: { code: 'upstream' }, retryable: false });
    expect((res as { error: { message: string } }).error.message).toContain('CREAO_SCOUT_APP_ID');
    expect(mocked.createAppRunWith).not.toHaveBeenCalled();
    expect(mocked.createRealtimeRun).not.toHaveBeenCalled();
  });

  it('rejects non-role deliverables before any network call', async () => {
    const res = await createCreaoWorker('scout', optsFor()).run(scoutInput('brief'), () => {}, new AbortController().signal);
    expect(res).toMatchObject({ ok: false, error: { code: 'unknown' } });
    expect(mocked.createRealtimeRun).not.toHaveBeenCalled();
  });
});
