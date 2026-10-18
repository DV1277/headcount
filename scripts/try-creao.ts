// scripts/try-creao.ts (O4 A-05 evaluation harness, PRD §11.6). HEAD runs this against a
// configured .env (developer cr_sk_ account key + personal agent ids in account mode, or per-role
// capi_ triggers in app mode):
//   node --env-file-if-exists=.env --import tsx scripts/try-creao.ts scout 1 --save
//   node --env-file-if-exists=.env --import tsx scripts/try-creao.ts maker 2
//   node --env-file-if-exists=.env --import tsx scripts/try-creao.ts herald 1
// --mock forces HC_WORKERS=mock (offline; no CREAO call, no credits). Q-008 note: if a saved agent
// refuses arbitrary JSON input, set CREAO_INPUT_AS_REQUEST=1 in .env to wrap it in {"request": "…"}.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createCreaoWorker } from '../apps/server/src/workers/creao-worker';
import { buildRoleInput, deterministicSiteUrl } from '../apps/server/src/workers/inputs';
import { mockPayloads } from '../apps/server/src/mayor/mock-payloads';
import { ArtifactSchemas, type Artifact, type DeptId, type PlanTask } from '@hc/contracts';

const GOLDEN_IDEAS = [
  'Late-night boba delivery for UCLA dorms',
  'AI study buddy for intro CS students',
  'Vintage film-camera rental in Santa Monica',
  'Weekend dog-walking co-op for apartment buildings',
  'Meal-prep subscription for night-shift nurses',
];

const outDir = new URL('../fixtures/agent-outputs/', import.meta.url).pathname;

function ideaFor(arg: string | undefined): { idea: string; index: number } {
  const n = Number(arg);
  const idx = arg !== undefined && Number.isInteger(n) && n >= 1 && n <= GOLDEN_IDEAS.length ? n : 1;
  return { idea: GOLDEN_IDEAS[idx - 1], index: idx };
}

function taskFor(dept: DeptId, todo: string): PlanTask {
  if (dept === 'scout') return { id: 't1', owner: 'scout', title: 'Market research', instructions: todo, deliverable: 'research', dependsOn: [], enabled: true };
  return {
    id: dept === 'maker' ? 't2' : 't3',
    owner: dept,
    title: dept === 'maker' ? 'Landing page' : 'Launch kit',
    instructions: todo,
    deliverable: dept === 'maker' ? 'site' : 'launch_kit',
    dependsOn: ['t1'],
    enabled: true,
  };
}

/** makers/heralds need a research payload: the last saved Scout output, else the mock fixture. */
function researchArtifact(idea: string): Artifact {
  let payload: unknown = null;
  for (const name of ['creao-scout-1.json', 'creao-scout-2.json']) {
    const live = readFileSyncSafe(`${outDir}${name}`);
    if (live) {
      try {
        payload = (JSON.parse(live) as { payload?: unknown }).payload ?? null;
      } catch {
        payload = null;
      }
      if (payload) break;
    }
  }
  payload ??= mockPayloads().scout;
  return {
    id: 'a_try_research', runId: 'run_try', taskId: 't1', agent: 'scout', via: 'mock', kind: 'research',
    title: `Research for ${idea.slice(0, 40)}`, createdAt: new Date().toISOString(),
    payload: payload as Artifact['payload'],
  };
}

function readFileSyncSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

async function main(): Promise<number> {
  const deptArg = (process.argv[2] ?? '').toLowerCase();
  const arg = process.argv[3];
  const save = process.argv.includes('--save');
  if (!['scout', 'maker', 'herald'].includes(deptArg)) {
    console.log('usage: try-creao.ts <scout|maker|herald> [ideaIndex] [--save] [--mock]');
    return 2;
  }
  const mock = process.argv.includes('--mock') || process.env.HC_WORKERS === 'mock';
  if (mock) process.env.HC_WORKERS = 'mock';
  const dept = deptArg as DeptId;
  const { idea, index } = ideaFor(arg);
  const todo =
    dept === 'scout'
      ? 'Find up to 5 direct competitors, their prices, the target audience, and 3 gaps.'
      : dept === 'maker'
        ? 'Build a landing page that positions us against the gaps found in research, with pricing in the market band.'
        : 'Write launch posts and outreach emails aimed at the researched audience; link the site.';
  const task = taskFor(dept, todo);
  const inputs = dept === 'scout' ? [] : [researchArtifact(idea)];
  const siteUrl = deterministicSiteUrl('run_try');
  const requestWrapped = process.env.CREAO_INPUT_AS_REQUEST === '1';

  const preview = buildRoleInput({ task, idea, inputs, founderNotes: [], siteUrl });
  console.log(`worker=${mock ? 'mock' : 'creao'} agent=${dept} idea=${idea}${requestWrapped ? ' input={"request":"…"}' : ''}`);
  console.log(`input keys: ${Object.keys(preview).join(', ')}${String(preview.research) === 'null' ? ' (research: "null")' : ''}`);

  const worker = createCreaoWorker(dept);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6 * 60_000); // the executor's per-attempt budget
  try {
    const result = await worker.run(
      { runId: 'run_try', task, idea, inputs, founderNotes: [], siteUrl },
      (e) => {
        if (e.kind === 'started') console.log(`  started${e.externalRunId ? ` run=${e.externalRunId}` : ''}`);
        else if (e.kind === 'tool') console.log(`  tool ${e.tool}: ${e.label}`);
        else console.log(`  … ${e.note}`);
      },
      controller.signal,
    );
    clearTimeout(timer);
    if (result.ok) {
      const kind = task.deliverable;
      const valid = ArtifactSchemas[kind].safeParse(result.payload);
      console.log(`  ✓ ok via=${result.via} credits=${result.credits} chars=${result.raw.length} zodValid=${valid.success}`);
      if (!valid.success) console.log(`  ✗ zod: ${valid.error.issues.length} first=${JSON.stringify(valid.error.issues[0])}`);
      if (save) {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(`${outDir}creao-${dept}-${requestWrapped ? 'req' : 'raw'}-${index}.json`, JSON.stringify({ idea, task: task.id, via: result.via, credits: result.credits, payload: result.payload, raw: result.raw }, null, 1));
      }
      return valid.success ? 0 : 1;
    }
    console.log(`  ✗ failed: code=${result.error.code} retryable=${result.retryable} message=${result.error.message}`);
    return 1;
  } catch (err) {
    clearTimeout(timer);
    console.log(`  ✗ threw: ${err instanceof Error ? err.message : err}`);
    return 1;
  }
}

process.exitCode = await main();
