/**
 * O3 S-05 site publishing (HC-F-121): sanitize, write `runs/<id>/site/index.html`
 * atomically, and serve GET /sites/:runId/ behind the exact HC-N-021 CSP from a
 * sites-only router that HEAD mounts on the dedicated HC_SITES_PORT listener.
 * The router never exposes control APIs or arbitrary files.
 */
import express, { Router, type RequestHandler } from 'express';
import {join} from 'node:path';
import { SitePayloadSchema, type SitePayload } from '@hc/contracts';
import { env } from '../env';
import { sanitizeSiteHtml } from './sanitize';
import { isSafeRunId, runsRoot, siteFilePath, writeFileAtomic, readTextIfExists } from './paths';

export { sanitizeSiteHtml } from './sanitize';
export { siteFilePath, isSafeRunId } from './paths';

/** Exact CSP from HC-N-021. Served on every site response. */
export const SITE_CSP =
  "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src https: data:; form-action mailto:; base-uri 'none'";

const SITE_HEADERS: Record<string, string> = {
  'Content-Security-Policy': SITE_CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

/**
 * Deterministic public URL for a run's site (ADR-008): available before Maker finishes.
 * PUBLIC_BASE_URL (the cloudflared quick tunnel) wins when set; otherwise localhost
 * on the sites port (live value; falls back to the boot-parsed environment).
 */
export function siteUrlFor(runId: string): string {
  if (!isSafeRunId(runId)) throw new Error(`Unsafe run id: ${JSON.stringify(runId)}.`);
  const configured = (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const livePort = Number.parseInt(process.env.HC_SITES_PORT ?? '', 10);
  if(configured) {
    let parsed:URL;
    try{parsed=new URL(configured);}catch{throw new Error('PUBLIC_BASE_URL must be an HTTP or HTTPS URL.');}
    if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('PUBLIC_BASE_URL must be an HTTP or HTTPS base URL without credentials, query or fragment.');
  }
  const base = configured || `http://localhost:${livePort >= 1 && livePort <= 65535 ? livePort : env.HC_SITES_PORT}`;
  return `${base}/sites/${runId}/`;
}

/** Sanitize, write to disk atomically, and resolve to the published URL. */
export async function publishSite(runId: string, site: SitePayload): Promise<string> {
  return publishSiteInRoot(runId,site,runsRoot());
}

/** Storage injection for the executor's isolated root; same public URL and policy. */
export async function publishSiteInRoot(runId:string,site:SitePayload,storageRoot:string):Promise<string> {
  if (!isSafeRunId(runId)) throw new Error(`Unsafe run id: ${JSON.stringify(runId)}.`);
  const payload = SitePayloadSchema.parse(site);
  const url=siteUrlFor(runId);
  const html = sanitizeSiteHtml(payload.html);
  await writeFileAtomic(join(storageRoot,runId,'site','index.html'), html);
  return url;
}

function notFound(res: express.Response, message = 'No published site for this run.'): void {
  res.status(404).json({ error: { code: 'not_found', message } });
}

/** Mount with `app.use('/sites', createSitesRouter())` on the sites-only listener. */
export function createSitesRouter(): Router {
  const router = Router();
  const serve: RequestHandler = async (req, res) => {
    const runId = req.params.runId ?? '';
    if (!isSafeRunId(runId)) { notFound(res); return; }
    try {
      const html = await readTextIfExists(siteFilePath(runId));
      if (html === null) { notFound(res); return; }
      res.status(200).set(SITE_HEADERS).type('html').send(html);
    } catch {
      res.status(500).json({ error: { code: 'internal', message: 'Could not read the published site.' } });
    }
  };
  const entry: RequestHandler = (req, res, next) => {
    const runId = req.params.runId ?? '';
    if (!isSafeRunId(runId)) { notFound(res); return; }
    // Express is non-strict by default: /sites/<id> and /sites/<id>/ both hit this handler.
    if (req.path.endsWith('/') || req.path.endsWith('/index.html')) { void serve(req, res, next); return; }
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(302, `${req.baseUrl}${req.path}/${query}`);
  };
  router.get('/:runId', entry);
  router.get('/:runId/index.html', (req, res, next) => { void serve(req, res, next); });
  router.use((_req, res) => notFound(res, 'Only published sites are served here.'));
  return router;
}
