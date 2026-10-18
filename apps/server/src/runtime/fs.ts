/** Local filesystem layout for run event logs and artifacts (PRD §9.4). */
import { appendFile, mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/** Runtime source sits at apps/server/src/runtime/; four hops reach the repository root. */
export const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

const RUN_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

/** Ids become filesystem paths and URL segments; only plain slug shapes qualify. */
export function isSafeRunId(runId: string): boolean {
  return typeof runId === 'string' && RUN_ID_RE.test(runId) && !runId.includes('..');
}

/**
 * Run storage root: an explicit rootDir wins (tests/agents pass one), then
 * HC_RUNS_DIR (shared with the sites publisher so smoke never touches a live
 * server's runs), then repo/runs.
 */
export function runsRoot(rootDir?: string): string {
  if (rootDir) return join(rootDir, 'runs');
  const configured = process.env.HC_RUNS_DIR?.trim();
  if (configured) return resolve(configured);
  return join(REPO_ROOT, 'runs');
}

export function runDir(runId: string, rootDir?: string): string {
  if (!isSafeRunId(runId)) throw new Error(`Unsafe run id: ${JSON.stringify(runId)}.`);
  return join(runsRoot(rootDir), runId);
}

export function eventsPath(runId: string, rootDir?: string): string {
  return join(runDir(runId, rootDir), 'events.jsonl');
}

export function artifactsDir(runId: string, rootDir?: string): string {
  return join(runDir(runId, rootDir), 'artifacts');
}

export function artifactPath(runId: string, aid: string, rootDir?: string): string {
  if (!isSafeRunId(aid)) throw new Error(`Unsafe artifact id: ${JSON.stringify(aid)}.`);
  return join(artifactsDir(runId, rootDir), `${aid}.json`);
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Append one JSON line; the caller serializes appends through the event log. */
export async function appendJsonLine(filePath: string, line: string): Promise<void> {
  await ensureDir(dirname(filePath));
  await appendFile(filePath, line === '' ? '\n' : `${line}\n`, 'utf8');
}

export async function readFileText(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8');
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await ensureDir(dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, filePath);
}

export async function listRunIds(rootDir?: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(runsRoot(rootDir));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return names.filter(isSafeRunId);
}
