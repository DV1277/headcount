/** Shared filesystem location helpers for published sites and run data (PRD §9.4). */
import { mkdir, rename, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const RUN_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

/** Published IDs become filesystem paths and public URL segments; only plain slug shapes qualify. */
export function isSafeRunId(runId: string): boolean {
  return typeof runId === 'string' && RUN_ID_RE.test(runId) && !runId.includes('..');
}

export function runsRoot(): string {
  return join(REPO_ROOT, 'runs');
}

export function runDir(runId: string): string {
  if (!isSafeRunId(runId)) throw new Error(`Unsafe run id: ${JSON.stringify(runId)}.`);
  return join(runsRoot(), runId);
}

export function siteDir(runId: string): string {
  return join(runDir(runId), 'site');
}

export function siteFilePath(runId: string): string {
  return join(siteDir(runId), 'index.html');
}

/** Write a file atomically so readers never observe a half-written site. */
export async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
  const dir = filePath.slice(0, filePath.lastIndexOf('/')) || '.';
  await mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, contents);
  await rename(tmp, filePath);
}

export async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
