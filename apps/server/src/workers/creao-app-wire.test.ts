// App-trigger rungs on the wire (task card §18): real creao.mjs against a stubbed global fetch.
// Asserts POST body {inputs:...}, per-role capi_ keys, poll cadence and GET /{id} — no live calls.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('CREAO_APP_KEY', 'capi_default');
  vi.stubEnv('CREAO_APP_ID', 'app_default');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function realCreao(): Promise<typeof import('../../../../integrations/index.mjs')['creao']> {
  const mod = await vi.importActual<typeof import('../../../../integrations/index.mjs')>('../../../../integrations/index.mjs');
  return mod.creao;
}

describe('app trigger on the wire', () => {
  it('preserves Retry-After for a throttled poll', async () => {
    const creao = await realCreao();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"RATE_LIMITED"}', { status: 429, headers: { 'Retry-After': '12' } })));
    await expect(creao.getAppRunWith('app_scout', 'capi_test', 'existing')).rejects.toMatchObject({ status: 429, retryAfterMs: 12000 });
  });
  it('POSTs {inputs:...} to /api/v1/apps/{appId}/runs with the capi_ key and no other body keys', async () => {
    vi.stubEnv('CREAO_API_KEY', 'capi_test');
    const creao = await realCreao();
    const calls: { url: string; init: RequestInit; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init, body: JSON.parse(String(init.body ?? 'null')) as unknown });
      return new Response(JSON.stringify({ id: 'run_app_1', status: 'RUNNING', appId: 'app_1' }), { status: 200 });
    }));
    await (creao as unknown as { createAppRunWith: (a: string, k: string, i: unknown, o?: object) => Promise<unknown> }).createAppRunWith('app_scout', 'capi_test', { idea: 'x' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://agent.creao.ai/api/v1/apps/app_scout/runs');
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer capi_test');
    expect(calls[0].body).toEqual({ inputs: { idea: 'x' } });
  });

  it('status-polls GET /{id} with completed mapping via result.text (account-mode shape tolerated)', async () => {
    vi.stubEnv('CREAO_API_KEY', 'capi_test');
    const creao = await realCreao();
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      urls.push(url);
      if (urls.length === 1) return new Response(JSON.stringify({ id: 'run_app_2', status: 'RUNNING' }), { status: 200 });
      return new Response(JSON.stringify({ id: 'run_app_2', status: 'COMPLETED', result: { text: 'done' } }), { status: 200 });
    }));
    const run = await creao.waitForAppRunWith('app_scout', 'capi_test', 'run_app_2', { intervalMs: 20, timeoutMs: 3_000 });
    expect(urls[0]).toBe('https://agent.creao.ai/api/v1/apps/app_scout/runs/run_app_2');
    expect((run as { status: string }).status).toBe('COMPLETED');
    expect(urls.length).toBeGreaterThanOrEqual(2);
  });

  it('poll honors an external abort: rejects and stops the fetch loop', async () => {
    vi.stubEnv('CREAO_API_KEY', 'capi_test');
    const creao = await realCreao();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ id: 'run_app_3', status: 'RUNNING' }), { status: 200 });
    }));
    const c = new AbortController();
    setTimeout(() => c.abort(), 60);
    await expect(
      creao.waitForAppRunWith('app_scout', 'capi_test', 'run_app_3', { intervalMs: 20, timeoutMs: 10_000, signal: c.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    const seen = calls;
    await new Promise((r) => setTimeout(r, 150));
    expect(calls).toBe(seen); // no further polling after the abort
  });
});
