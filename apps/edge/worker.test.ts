import { describe, expect, it } from 'vitest';
import worker, { type EdgeEnv } from './worker';

const RUN_ID = 'run_4hN7Q1M-b-';
const SITE_HTML =
  '<html><head><style>.x{color:red}</style></head><body><a href="mailto:hello@example.com">mail</a></body></html>';
const SPA_HTML = '<!doctype html><html><body><div id="root"></div></body></html>';

function makeEnv(files: Record<string, string>): EdgeEnv {
  return {
    ASSETS: {
      async fetch(input: Request): Promise<Response> {
        const path = new URL(input.url).pathname;
        const body = files[path];
        if (body === undefined) return new Response('Not found.', { status: 404 });
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'text/html;charset=utf-8' },
        });
      },
    },
  };
}

function request(path: string): Request {
  return new Request(`https://demo.test${path}`);
}

function siteEnv(): EdgeEnv {
  return makeEnv({ [`/sites/${RUN_ID}/index.html`]: SITE_HTML, '/index.html': SPA_HTML });
}

describe('recorded site', () => {
  it('serves the published site with the strict static CSP', async () => {
    const response = await worker.fetch(request(`/sites/${RUN_ID}/`), siteEnv());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).toContain('form-action mailto:');
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toMatch(/script/i);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe(SITE_HTML);
  });

  it('serves the index.html alias', async () => {
    const response = await worker.fetch(request(`/sites/${RUN_ID}/index.html`), siteEnv());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(SITE_HTML);
  });

  it('redirects the bare run id to the trailing-slash URL', async () => {
    const response = await worker.fetch(request(`/sites/${RUN_ID}`), siteEnv());
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`https://demo.test/sites/${RUN_ID}/`);
  });

  it('missing sites 404 instead of serving the SPA', async () => {
    const env = makeEnv({ '/index.html': SPA_HTML });
    const response = await worker.fetch(request('/sites/never-published-run/'), env);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(SPA_HTML);
  });

  it('rejects unsafe run ids and sibling paths', async () => {
    const env = siteEnv();
    for (const path of [
      '/sites/..%2Fevil/',
      `/sites/${RUN_ID}/index.html/extra`,
      `/sites/${RUN_ID}/other`,
      '/sites/',
      '/sites',
    ]) {
      const response = await worker.fetch(request(path), env);
      expect(response.status, path).toBe(404);
    }
  });
});

describe('API blocking', () => {
  it('does not accept mutations on the public demo or generated site', async () => {
    for(const path of ['/demo',`/sites/${RUN_ID}/`]) {
      const response=await worker.fetch(new Request(`https://demo.test${path}`,{method:'POST',body:'test'}),siteEnv());
      expect(response.status).toBe(405);
    }
  });
  it('returns 404 for every /api path', async () => {
    const env = siteEnv();
    for (const path of ['/api', '/api/', '/api/runs', '/api/sites/x']) {
      const response = await worker.fetch(request(path), env);
      expect(response.status, path).toBe(404);
    }
  });
});

describe('SPA routes', () => {
  it('serves the Vite app at / and /demo', async () => {
    const env = siteEnv();
    for (const path of ['/', '/demo', '/demo/']) {
      const response = await worker.fetch(request(path), env);
      expect(response.status, path).toBe(200);
      expect(await response.text(), path).toBe(SPA_HTML);
    }
  });
});

describe('missing assets', () => {
  it('returns 404 for unknown asset paths', async () => {
    const env = siteEnv();
    const response = await worker.fetch(request('/assets/missing-abc123.js'), env);
    expect(response.status).toBe(404);
  });
});
