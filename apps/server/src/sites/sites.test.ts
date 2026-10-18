import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Server } from 'express';
import { publishSite, siteUrlFor, createSitesRouter, SITE_CSP } from './index';
import { sanitizeSiteHtml } from './sanitize';
import { runsRoot, siteFilePath } from './paths';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

vi.stubEnv('HC_SITES_PORT', '8798');

let server: Server | undefined;

async function listen(app: express.Express): Promise<number> {
  return await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server?.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

afterEach(async () => {
  await new Promise<void>((resolve) => server ? server.close(() => resolve()) : resolve());
  server = undefined;
});

afterAll(async () => {
  await rm(join(runsRoot(), 'sites-test'), { recursive: true, force: true });
});

/* AC-07.2 / HC-N-021 sanitizer contract. */
describe('sanitizeSiteHtml', () => {
  const assertClean = (out: string): void => {
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toMatch(/<object/i);
    expect(out).not.toMatch(/<embed/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/\son[a-z]+\s*=/i);
    expect(out).not.toMatch(/<\s*(?:script|iframe|object|embed)\b/i);
  };

  it('removes script tags with content and event handler attributes', () => {
    const out = sanitizeSiteHtml('<p>safe</p><script>alert(1)</script><img src="https://ok.example/a.png" onerror="alert(1)">');
    expect(out).toBe('<p>safe</p><img src="https://ok.example/a.png" />');
    assertClean(out);
  });

  it('removes frames and objects and neutralizes javascript: URLs (entity and attribute forms)', () => {
    for (const payload of [
      '<iframe src="//evil.example">fallback</iframe><p>x</p>',
      '<object data="e.swf">o</object>',
      '<a href="javascript:alert(1)">x</a>',
      '<a href="javascript&colon;alert(1)">x</a>',
      '<a href="jav&#x0A;ascript:alert(1)">x</a>',
      '<a href="&#106;avascript:alert(1)">x</a>',
      '<form action="JavaScript&#58;void(0)" method="post"><input type="email" name="email"></form>',
    ]) {
      const out = sanitizeSiteHtml(payload);
      assertClean(out);
    }
    expect(sanitizeSiteHtml('<iframe src="//evil.example">fallback</iframe><p>x</p>')).toBe('<p>x</p>');
    expect(sanitizeSiteHtml('<object data="e.swf">o</object>')).toBe('');
    expect(sanitizeSiteHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
  });

  it('preserves inline style, style tags, Google Fonts links and document structure', () => {
    const input =
      "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>" +
      "<title>Night Pearl</title><link href='https://fonts.googleapis.com/css2?family=Fraunces:wght@600&display=swap' rel='stylesheet'>" +
      "<style>body{margin:0;font-family:Fraunces,serif;background:#14110f}</style></head>" +
      "<body><header style='text-align:center'><h1>Boba after midnight.</h1><p>Hello <strong>world</strong></p></header>" +
      "<form id='signup' action='mailto:hello@example.com' method='post'><input type='email' name='email' placeholder='you@example.com'>" +
      "<button>Notify me</button></form><footer><small>Built by Headcount: 1</small></footer></body></html>";
    const out = sanitizeSiteHtml(input);
    assertClean(out);
    expect(out).toContain('<style>body{margin:0;font-family:Fraunces,serif;background:#14110f}</style>');
    expect(out).toContain('https://fonts.googleapis.com/css2?family=Fraunces:wght@600&amp;display=swap');
    expect(out).toContain('action="mailto:hello@example.com"');
    expect(out).toContain('<title>Night Pearl</title>');
    expect(out).toContain('style="text-align:center"');
    expect(out).toContain('charset="utf-8"');
    expect(out).toContain('<h1>Boba after midnight.</h1>');
  });

  it('keeps data: images but applies per-tag scheme rules', () => {
    const out = sanitizeSiteHtml('<img src="data:image/png;base64,AAAA"><a href="http://x.example/">a</a><link href="http://fonts.googleapis.com/x" rel="stylesheet">');
    expect(out).toContain('src="data:image/png;base64,AAAA"');
    expect(out).not.toContain('"data:'); // data: never for links or forms
    expect(out).not.toContain('http://fonts.googleapis.com'); // stylesheet links are https only
  });

  it('leaves only allowlisted tags and attributes behind', () => {
    const out = sanitizeSiteHtml('<select><option value="1">a</option></select><div onmouseover="hi()" data-test="v" class="c">keep</div>');
    expect(out).not.toContain('<select');
    expect(out).not.toContain('value=');
    expect(out).toBe('<div class="c">keep</div>');
  });
});

const RUN_PREFIX = 'sites-test-';

describe('publishSite', () => {
  const runId = `${RUN_PREFIX}pub-${Date.now()}`;

  afterEach(async () => {
    await rm(join(runsRoot(), runId), { recursive: true, force: true });
  });

  it('writes an atomically sanitized index.html and returns the derived URL', async () => {
    const url = await publishSite(runId, { headline: 'Atomic test', html: '<html><body><h1>Atomic test</h1><script>bad()</script></body></html>' });
    expect(url).toBe('http://localhost:8798/sites/' + runId + '/');
    expect(await readFile(siteFilePath(runId), 'utf8')).toBe('<html><body><h1>Atomic test</h1></body></html>');
    expect(await readdir(join(runsRoot(), runId, 'site'))).toEqual(['index.html']);
  });

  it('derives the URL from PUBLIC_BASE_URL when configured, ignoring junk values', async () => {
    vi.stubEnv('PUBLIC_BASE_URL', 'https://tunnel.example/nested/');
    try {
      expect(siteUrlFor(runId)).toBe('https://tunnel.example/nested/sites/' + runId + '/');
    } finally {
      vi.unstubAllEnvs();
      vi.stubEnv('HC_SITES_PORT', '8798');
    }
    expect(siteUrlFor(runId)).toBe('http://localhost:8798/sites/' + runId + '/');
  });

  it('rejects unsafe run ids', async () => {
    await expect(publishSite('..%2Fevil', { headline: 'x', html: '<p>x</p>' })).rejects.toThrow();
    await expect(publishSite('sub/dir', { headline: 'x', html: '<p>x</p>' })).rejects.toThrow();
  });

  it('validates the payload and enforces the 120 KB byte budget', async () => {
    await expect(publishSite(runId, { headline: '', html: '<p>x</p>' })).rejects.toThrow();
    await expect(publishSite(runId, { headline: 'x', html: 'x'.repeat(120 * 1024 + 100) })).rejects.toThrow();
  });
});

describe('createSitesRouter', () => {
  let runId: string;
  let port: number;

  beforeEach(async () => {
    runId = `${RUN_PREFIX}router-${Date.now()}`;
    await publishSite(runId, {
      headline: 'Router',
      html: '<html><body><h1>Router</h1><a href="https://ok.example/">safe</a></body></html>',
    });
  });

  afterEach(async () => {
    await rm(join(runsRoot(), runId), { recursive: true, force: true });
  });

  it('serves the published site with the exact CSP and hardening headers', async () => {
    port = await listen(express().use('/sites', createSitesRouter()));
    const response = await fetch(`http://127.0.0.1:${port}/sites/${runId}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toBe(SITE_CSP);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await response.text()).toContain('<h1>Router</h1>');
    expect((await fetch(`http://127.0.0.1:${port}/sites/${runId}/`, { method: 'HEAD' })).status).toBe(200);
  });

  it('redirects the bare runId to the trailing-slash URL and serves the index.html alias', async () => {
    port = await listen(express().use('/sites', createSitesRouter()));
    const redirect = await fetch(`http://127.0.0.1:${port}/sites/${runId}`, { redirect: 'manual' });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe(`/sites/${runId}/`);
    const alias = await fetch(`http://127.0.0.1:${port}/sites/${runId}/index.html`);
    expect(alias.status).toBe(200);
    expect(await alias.text()).toContain('<h1>Router</h1>');
  });

  it('never exposes unpublished runs, traversal ids, sibling paths or write methods', async () => {
    port = await listen(express().use('/sites', createSitesRouter()));
    for (const [path, status] of [
      ['/sites/never-published-run/', 404],
      ['/sites/..%2Fprivate%2Fsecret/', 404],
      ['/sites/%2e%2e%2f%2e%2e%2fenv/', 404],
      ['/sites/published-x./', 404],
      [`/sites/${runId}`, 302],
      [`/sites/${runId}/index.html/extra`, 404],
    ] as [string, number][]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' });
      expect(response.status, path).toBe(status);
      if (status === 404) {
        expect((await response.json() as { error?: { code?: string } }).error?.code, path).toBeDefined();
      }
    }
    expect((await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' })).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/api/runs`, { redirect: 'manual' })).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/sites/${runId}/`, { method: 'POST' })).status).toBe(404);
  });
});
