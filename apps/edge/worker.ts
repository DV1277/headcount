/**
 * Cloudflare Worker fronting the Vite static build via Workers Static Assets.
 *
 * Routing:
 * - `/` and `/demo` serve the Vite SPA (`/index.html` from ASSETS).
 * - `/sites/<runId>/` (and `/sites/<runId>/index.html`) serve the recorded
 *   generated site with a strict static-only CSP. Any other `/sites/...`
 *   shape 404s instead of falling through to the SPA.
 * - `/api/*` always 404s: there is no backend on this host.
 * - Everything else passes through to ASSETS; a missing asset 404s.
 */
const SITE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action mailto:; base-uri 'none'";

const RUN_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

export interface EdgeAssets {
  fetch: (request: Request) => Promise<Response>;
}

export interface EdgeEnv {
  ASSETS: EdgeAssets;
}

function jsonNotFound(message: string): Response {
  return Response.json({ error: { code: 'not_found', message } }, { status: 404 });
}

function siteHeaders(): Headers {
  const headers = new Headers();
  headers.set('Content-Type', 'text/html;charset=utf-8');
  headers.set('Content-Security-Policy', SITE_CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Cache-Control', 'no-store');
  return headers;
}

async function serveSite(request: Request, env: EdgeEnv, runId: string): Promise<Response> {
  if (!RUN_ID_RE.test(runId)) return jsonNotFound('No published site for this run.');
  const origin = new URL(request.url).origin;
  const asset = await env.ASSETS.fetch(new Request(new URL(`/sites/${runId}/index.html`, origin).toString()));
  if (!asset.ok) return jsonNotFound('No published site for this run.');
  return new Response(asset.body, { status: 200, headers: siteHeaders() });
}

const worker = {
  async fetch(request: Request, env: EdgeEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api' || path.startsWith('/api/')) {
      return jsonNotFound('No API is served from this demo host.');
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed.', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    if (path === '/sites' || path === '/sites/') {
      return jsonNotFound('Only published sites are served here.');
    }
    if (path.startsWith('/sites/')) {
      const rest = path.slice('/sites/'.length);
      if (rest.endsWith('/')) {
        const runId = rest.slice(0, -1);
        if (!runId || runId.includes('/')) return jsonNotFound('Only published sites are served here.');
        return serveSite(request, env, runId);
      }
      if (!rest.includes('/')) {
        if (!RUN_ID_RE.test(rest)) return jsonNotFound('Only published sites are served here.');
        return Response.redirect(`${url.origin}/sites/${rest}/${url.search}`, 302);
      }
      const parts = rest.split('/');
      if (parts.length === 2 && parts[0] && parts[1] === 'index.html') {
        return serveSite(request, env, parts[0]);
      }
      return jsonNotFound('Only published sites are served here.');
    }

    if (path === '/' || path === '/demo' || path === '/demo/') {
      const asset = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin)));
      if (!asset.ok) return new Response('Not found.', { status: 404 });
      return asset;
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404) return new Response('Not found.', { status: 404 });
    return asset;
  },
};

export default worker;
