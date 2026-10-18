/**
 * O3 — HTTP control API (PRD §8.7, HC-F-001..003, HC-F-180).
 *
 * `createApiRouter(manager)` builds the routes against an injected RunManager
 * (tests inject fakes; no paid calls). `apiRouter` is a lazy singleton: it
 * imports and constructs the real RunManager only when the first request
 * arrives, so importing the server never starts upstream calls.
 *
 * Conventions:
 * - All JSON. Errors are `{ error: { code, message, runId? } }`.
 * - `RunError` maps 1:1 to the §8.7 statuses (400/404/409/422); anything else
 *   is a sanitized 500 — no stack traces, no secrets reach the client.
 * - Path ids are validated as safe segments before they reach the manager.
 */
import express, { Router, type ErrorRequestHandler, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { PlanSchema, type DeptId } from '@hc/contracts';
import { RunError, badRequest, invalidBody } from '../runtime/errors';
import { isSafeRunId } from '../runtime/fs';
import type { RunManager } from '../runtime/manager';
import { readHealth } from '../health';
import { streamEvents } from './sse';

const DEPT_IDS = new Set(['scout', 'maker', 'herald']);

type BodyRules = Record<string, { min: number; max: number; trim?: boolean }>;
type BodyCheck =
  | { ok: true; values: Record<string, string> }
  | { ok: false; detail: string };

/** Plain-string field validation; lengths are checked post-trim. */
function doValidateBody(body: unknown, rules: BodyRules): BodyCheck {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, detail: 'A JSON object body is required.' };
  }
  const values: Record<string, string> = {};
  const issues: string[] = [];
  for (const [key, rule] of Object.entries(rules)) {
    const raw = (body as Record<string, unknown>)[key];
    if (typeof raw !== 'string') { issues.push(`${key} must be a string.`); continue; }
    const value = rule.trim ? raw.trim() : raw;
    if (value.length < rule.min || value.length > rule.max) {
      issues.push(`${key} must be ${rule.min}-${rule.max} characters.`);
      continue;
    }
    values[key] = value;
  }
  return issues.length ? { ok: false, detail: issues.join(' ') } : { ok: true, values };
}

/** RunError carries the §8.7 status; all other failures stay sanitized. */
function toHttpError(error: unknown): { status: number; code: string; message: string; runId?: string } {
  if (error instanceof RunError) {
    return { status: error.status, code: error.code, message: error.message, runId: error.detail };
  }
  if (typeof error === 'object' && error !== null && (error as { type?: string }).type === 'entity.too.large') {
    return { status: 413, code: 'body_too_large', message: 'Request body exceeds 256 KB.' };
  }
  if (error instanceof SyntaxError) {
    return { status: 400, code: 'invalid_json', message: 'Request body must be valid JSON.' };
  }
  return { status: 500, code: 'internal', message: 'The server could not complete this request.' };
}

const respondError = (res: Response, error: unknown): void => {
  if (res.headersSent) { res.end(); return; }
  const mapped = toHttpError(error);
  res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message, ...(mapped.runId ? { runId: mapped.runId } : {}) } });
};

const wrap = (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void handler(req, res).catch(next);
  };

function requireParam(params: Request['params'], key: 'runId' | 'aid'): string {
  const value = params[key] ?? '';
  if (!isSafeRunId(value)) {
    throw badRequest(key === 'aid' ? 'bad_artifact_id' : 'bad_run_id', `The ${key === 'aid' ? 'artifact' : 'run'} id is not a safe path segment.`);
  }
  return value;
}

const issueDetail = (error: { issues: { path: (string | number)[]; message: string }[] }): string =>
  error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');

/** Builds the §8.7 routes against a RunManager instance. */
export function createApiRouter(manager: RunManager): Router {
  const router = Router();
  const jsonParser = express.json({ limit: '256kb' });
  // Parse once: HEAD's control app may have already parsed req.body.
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.body !== undefined) { next(); return; }
    jsonParser(req, res, next);
  });

  router.get('/health', wrap(async (_req, res) => {
    res.json(await readHealth());
  }));

  router.post('/runs', wrap(async (req, res) => {
    const check = doValidateBody(req.body, { idea: { min: 8, max: 280, trim: true } });
    if (!check.ok) throw invalidBody('invalid_idea', 'An idea of 8-280 characters is required.', check.detail);
    const runId = await manager.create(check.values.idea);
    res.status(201).json({ runId });
  }));

  router.get('/runs', wrap(async (_req, res) => {
    res.json(await manager.list());
  }));

  router.get('/runs/:runId', wrap(async (req, res) => {
    const state = await manager.get(requireParam(req.params, 'runId'));
    res.json({ state });
  }));

  router.post('/runs/:runId/approve', wrap(async (req, res) => {
    const runId = requireParam(req.params, 'runId');
    const parsed = PlanSchema.safeParse((req.body as Record<string, unknown> | undefined)?.plan);
    if (!parsed.success) throw invalidBody('invalid_plan', 'The plan is not a valid Headcount plan.', issueDetail(parsed.error));
    await manager.approve(runId, parsed.data);
    res.status(204).end();
  }));

  router.post('/runs/:runId/answer', wrap(async (req, res) => {
    const runId = requireParam(req.params, 'runId');
    const check = doValidateBody(req.body, { qid: { min: 1, max: 100 }, text: { min: 0, max: 1000 } });
    if (!check.ok) throw invalidBody('invalid_answer', 'A question id (1-100) and an answer of 0-1000 characters are required.', check.detail);
    await manager.answer(runId, check.values.qid, check.values.text);
    res.status(204).end();
  }));

  router.post('/runs/:runId/redirect', wrap(async (req, res) => {
    const runId = requireParam(req.params, 'runId');
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const agent = typeof body.agent === 'string' && DEPT_IDS.has(body.agent) ? (body.agent as DeptId) : null;
    const note = typeof body.note === 'string' ? body.note : '';
    if (agent === null || note.length < 1 || note.length > 600) {
      throw invalidBody('invalid_redirect', 'A department (scout|maker|herald) and a note of 1-600 characters are required.');
    }
    await manager.redirect(runId, agent, note);
    res.status(204).end();
  }));

  for (const action of ['pause', 'resume', 'replan'] as const) {
    router.post(`/runs/:runId/${action}`, wrap(async (req, res) => {
      const runId = requireParam(req.params, 'runId');
      await manager[action](runId);
      res.status(204).end();
    }));
  }

  router.get('/runs/:runId/artifacts/:aid', wrap(async (req, res) => {
    const runId = requireParam(req.params, 'runId');
    const aid = requireParam(req.params, 'aid');
    const artifact = await manager.getArtifact(runId, aid);
    res.json(artifact);
  }));

  router.get('/runs/:runId/events', wrap(async (req, res) => {
    const runId = requireParam(req.params, 'runId');
    await streamEvents(req, res, manager, runId);
  }));

  router.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found.' } });
  });

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    respondError(res, error);
  };
  router.use(onError);
  return router;
}

/** Lazy singleton: constructs the runtime (and its imports) on first use. */
export const apiRouter: Router = Router();

let backendPromise: Promise<Router> | undefined;

apiRouter.use((req, res, next) => {
  backendPromise ??= buildBackend().catch((error: unknown) => {
    backendPromise = undefined; // a transient failure must not brick the process
    throw error;
  });
  void backendPromise.then(
    backend => {
      backend(req, res, next);
    },
    error => next(error instanceof Error ? error : new Error(String(error))),
  );
});

async function buildBackend(): Promise<Router> {
  const { createRunManager } = await import('../runtime/manager');
  return createApiRouter(createRunManager());
}
