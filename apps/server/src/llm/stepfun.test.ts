// A-02 regression tests: chatRaw typed wrapper + integrations/stepfun.mjs behavior.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.stubEnv('STEPFUN_API_KEY', 'test-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const okBody = (content: string = '{"ok":true}') =>
  `{"choices":[{"message":{"role":"assistant","content":${JSON.stringify(content)}}}],"usage":{"prompt_tokens":11,"completion_tokens":7}}`;

function postCapture(): { calls: { url: string; init: RequestInit }[]; respond: (status: number, body: string) => void } {
  const calls: { url: string; init: RequestInit }[] = [];
  const respond = (status: number, body: string) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return new Response(body, { status, headers: { 'content-type': 'application/json' } });
    }));
  };
  return { calls, respond };
}

describe('llm/stepfun chatRaw', () => {
  it('returns message + usage and keeps timeout/signal out of the request body', async () => {
    const { chatRaw, PLAN_TIMEOUT_MS } = await import('./stepfun');
    const { calls, respond } = postCapture();
    respond(200, okBody());
    const abort = new AbortController();
    const res = await chatRaw([{ role: 'user', content: 'hi' }], { json: true, timeoutMs: 5_000, signal: abort.signal, maxTokens: 50 });
    expect(res.message).toEqual({ role: 'assistant', content: '{"ok":true}' });
    expect(res.usage).toEqual({ tokensIn: 11, tokensOut: 7 });
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
    const wire = JSON.stringify(body);
    expect(wire).not.toContain('timeoutMs');
    expect(wire).not.toContain('"signal"');
    expect(body.max_tokens).toBe(50); // camelCase opts map to snake_case on the wire
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(PLAN_TIMEOUT_MS).toBe(60_000);
  });

  it('meshes json_schema once and falls back to json_object on a 4xx rejection', async () => {
    const { chatRaw } = await import('./stepfun');
    const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push({ url, init, body });
      const fmt = body.response_format as { type?: string } | undefined;
      if (fmt?.type === 'json_schema') return new Response('{"error":"unsupported response_format json_schema"}', { status: 400 });
      return new Response(okBody('{"value":1}'), { status: 200 });
    }));
    const res = await chatRaw([{ role: 'user', content: 'x' }], { json: { name: 'plan', schema: { type: 'object' } } });
    expect(res.message.content).toBe('{"value":1}');
    expect(calls).toHaveLength(2);
    expect(calls[0].body.response_format).toHaveProperty('type', 'json_schema');
    expect(calls[1].body.response_format).toEqual({ type: 'json_object' });
  });

  it('retrokes on 429 twice with backoff', async () => {
    vi.useFakeTimers();
    const { chatRaw } = await import('./stepfun');
    const statuses: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => {
      statuses.push(statuses.length < 2 ? 429 : 200);
      return new Response(statuses.length <= 2 ? 'rate limited' : okBody(), { status: statuses[statuses.length - 1] });
    }));
    const p = chatRaw([{ role: 'user', content: 'x' }], { retries: 2 });
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(1600);
    const res = await p;
    expect(res.message.content).toBe('{"ok":true}');
    expect(statuses).toEqual([429, 429, 200]);
    vi.useRealTimers();
  });

  it('rejects a hard 4xx (non-format) without retrying', async () => {
    const { chatRaw } = await import('./stepfun');
    const fetch = vi.fn(async () => new Response('bad request body', { status: 400 }));
    vi.stubGlobal('fetch', fetch);
    await expect(chatRaw([{ role: 'user', content: 'x' }], { json: true })).rejects.toThrow(/400/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rethrows the original AbortError when the external signal aborts before the call', async () => {
    const { chatRaw } = await import('./stepfun');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const c = new AbortController();
    c.abort();
    await expect(chatRaw([{ role: 'user', content: 'x' }], { signal: c.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws a clear error when STEPFUN_API_KEY is absent', async () => {
    vi.stubEnv('STEPFUN_API_KEY', '');
    const { chatRaw } = await import('./stepfun');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(chatRaw([{ role: 'user', content: 'x' }])).rejects.toThrow(/Missing env: STEPFUN_API_KEY/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('integrations/stepfun chatRaw (mjs)', () => {
  it('normalizes usage and never puts timeoutMs into the upstream JSON', async () => {
    const { stepfun } = (await import('../../../../integrations/index.mjs')) as unknown as {
      stepfun: { chatRaw: (m: unknown, o: unknown) => Promise<{ usage: { tokensIn: number; tokensOut: number; cachedIn?: number } }> };
    };
    const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return new Response(`{"choices":[{"message":{"role":"assistant","content":"ok"}}],"usage":{"prompt_tokens":100,"completion_tokens":20,"cached_tokens":40}}`, { status: 200 });
    }));
    const res = await stepfun.chatRaw([{ role: 'user', content: 'x' }], { timeoutMs: 999, reasoningEffort: 'low' });
    expect(res.usage).toEqual({ tokensIn: 100, tokensOut: 20, cachedIn: 40 });
    const wire = JSON.stringify(calls[0].body);
    expect(wire).not.toContain('timeoutMs');
    expect(calls[0].body.reasoning_effort).toBe('low');
  });
});
