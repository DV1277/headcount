// scripts/try-mayor.ts (O4 A-03 evaluation harness, PRD §11.6). HEAD runs this against a
// configured .env:
//   node --env-file-if-exists=.env --import tsx scripts/try-mayor.ts                # all 5 golden ideas, plan mode
//   node --env-file-if-exists=.env --import tsx scripts/try-mayor.ts plan 2         # one gold idea by index (1..5)
//   node --env-file-if-exists=.env --import tsx scripts/try-mayor.ts plan "free text idea"
//   node --env-file-if-exists=.env --import tsx scripts/try-mayor.ts brief 1        # plan + brief for idea 1
//   add --save to write the result into fixtures/agent-outputs/ (mock runs are NOT saved;
//   AC-11.1 evidence must come from live model output).
import { mkdirSync, writeFileSync } from 'node:fs';
import { createMayor } from '../apps/server/src/mayor';
import { validatePlan } from '../apps/server/src/mayor/validate';
import { PlanSchema } from '@hc/contracts';

const GOLDEN_IDEAS = [
  'Late-night boba delivery for UCLA dorms',
  'AI study buddy for intro CS students',
  'Vintage film-camera rental in Santa Monica',
  'Weekend dog-walking co-op for apartment buildings',
  'Meal-prep subscription for night-shift nurses',
];

const outDir = new URL('../fixtures/agent-outputs/', import.meta.url).pathname;

function ideaFor(arg: string | undefined, fallbackIndex: number | null): { idea: string; index: number | null } | null {
  if (arg === undefined && fallbackIndex === null) return null;
  const n = Number(arg);
  if (arg !== undefined && Number.isInteger(n) && n >= 1 && n <= GOLDEN_IDEAS.length) return { idea: GOLDEN_IDEAS[n - 1], index: n };
  if (arg !== undefined && arg.trim()) return { idea: arg.trim(), index: null };
  return { idea: GOLDEN_IDEAS[(fallbackIndex ?? 1) - 1], index: fallbackIndex };
}

async function runPlan(mayor: ReturnType<typeof createMayor>, idea: string, index: number | null, save: boolean): Promise<boolean> {
  console.log(`\n== plan: ${idea}`);
  try {
    const res = await mayor.plan({ idea });
    const check = validatePlan(res.plan);
    const schema = PlanSchema.safeParse(res.plan);
    const line = `source=${res.source} schemaValid=${schema.success} planValid=${check.ok} tasks=${res.plan.tasks.length} usage(in/out)=${res.usage.tokensIn}/${res.usage.tokensOut}`;
    console.log(`  ${line}`);
    res.plan.tasks.forEach((t) => console.log(`  ${t.id} ${t.owner.padEnd(6)} ${t.title} → ${t.deliverable}${t.dependsOn.length ? ` (after ${t.dependsOn.join(',')})` : ''}`));
    if (!check.ok) console.log(`  ✗ plan validation: ${check.issues}`);
    if (!schema.success) console.log(`  ✗ zod: ${schema.error.issues.length} issue(s)`);
    if (save && process.env.HC_MAYOR !== 'mock' && index !== null) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(`${outDir}mayor-plan-${index}.json`, JSON.stringify({ idea, ...res }, null, 1));
    }
    return check.ok && schema.success;
  } catch (err) {
    console.log(`  ✗ plan threw: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

async function runBrief(mayor: ReturnType<typeof createMayor>, idea: string, index: number | null, save: boolean): Promise<boolean> {
  const plan = (await mayor.plan({ idea })).plan;
  console.log(`\n== brief for: ${plan.title}`);
  const res = await mayor.brief({ idea, plan, artifacts: [] });
  const ok = res.brief.nextSteps.length === 3 && typeof res.brief.markdown === 'string' && res.brief.markdown.length > 0;
  console.log(`  usage(in/out)=${res.usage.tokensIn}/${res.usage.tokensOut} nextSteps=${res.brief.nextSteps.length}`);
  console.log(`  ${res.brief.markdown.split('\n').slice(0, 4).join(' | ')}`);
  if (save && process.env.HC_MAYOR !== 'mock' && index !== null) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${outDir}mayor-brief-${index}.json`, JSON.stringify({ idea, ...res }, null, 1));
  }
  return ok;
}

async function main(): Promise<number> {
  const mode = process.argv[2] ?? 'plan';
  const arg = process.argv[3];
  const save = process.argv.includes('--save');
  const mayor = createMayor();
  console.log(`mayor=${process.env.HC_MAYOR === 'mock' ? 'mock' : 'stepfun (step-5-preview)'} mode=${mode}`);

  if (mode === 'brief') {
    const target = ideaFor(arg, 1);
    if (!target) return 2;
    return (await runBrief(mayor, target.idea, target.index, save)) ? 0 : 1;
  }
  if (mode !== 'plan') {
    console.log('usage: try-mayor.ts [plan|brief] [ideaIndex|ideaText] [--save]');
    return 2;
  }
  const singles = ideaFor(arg, null);
  const targets = singles ? [singles] : GOLDEN_IDEAS.map((idea, i) => ({ idea, index: i + 1 }));
  let ok = true;
  for (const t of targets) ok = (await runPlan(mayor, t.idea, t.index, save)) && ok;
  console.log(ok ? '\nall plans valid' : '\nsome plans INVALID (see above)');
  return ok ? 0 : 1;
}

process.exitCode = await main();
