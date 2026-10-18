// Copies the exact accepted recorded site HTML into the Vite dist output so the
// edge worker can serve it under /sites/<runId>/index.html.
// Byte-for-byte copy: no transformation, no other files touched.
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUN_ID = 'run_4hN7Q1M-b-';
const src = join(root, 'fixtures', 'runs', 'live-boba-g2.site.html');
const dest = join(root, 'apps', 'web', 'dist', 'sites', RUN_ID, 'index.html');

await mkdir(dirname(dest), { recursive: true });
const before = await readFile(src);
await copyFile(src, dest);
const after = await readFile(dest);
if (!before.equals(after)) throw new Error(`prepare-edge: byte mismatch copying ${src}`);
const sha = createHash('sha256').update(after).digest('hex');
console.log(`prepare-edge: ${before.length} bytes -> ${dest} (sha256 ${sha})`);
