// Plan validation (A-03/HC-F-020/021): PlanSchema plus ADR-008/§11.2 department constraints.
import type { Plan } from '@hc/contracts';
import { PlanSchema } from '@hc/contracts';

export const MAX_PLAN_REPAIR_ISSUES = 600;

export type PlanValidation =
  | { ok: true; plan: Plan }
  | { ok: false; issues: string };

/** Validate a raw candidate: schema first, then the department DAG rules (Scout first, others only on Scout). */
export function validatePlan(candidate: unknown): PlanValidation {
  const parsed = PlanSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, MAX_PLAN_REPAIR_ISSUES) };
  }
  const plan = parsed.data;
  const ids = new Set(plan.tasks.map((t) => t.id));
  const extra: string[] = [];
  for (const task of plan.tasks) {
    if (!task.enabled) continue; // untick rules are the founder's; validation gates generated plans
    if (task.owner === 'scout') {
      if (task.dependsOn.length > 0) extra.push(`${task.id}: scout tasks must run first and have no dependencies.`);
    } else {
      const bad = task.dependsOn.filter((d) => !plan.tasks.some((t) => t.id === d && t.owner === 'scout'));
      if (bad.length) extra.push(`${task.id}: ${task.owner} tasks may only depend on Scout tasks (${bad.join(', ')}).`);
      if (!task.dependsOn.length) extra.push(`${task.id}: task has no Scout dependency; it would run without research.`);
    }
  }
  if (!plan.tasks.some((t) => t.owner === 'scout' && t.enabled)) extra.push('plan: at least one enabled Scout task is required.');
  if (extra.length) return { ok: false, issues: extra.join(' ').slice(0, MAX_PLAN_REPAIR_ISSUES) };
  if (ids.size !== plan.tasks.length) return { ok: false, issues: 'Task IDs must be unique.' };
  return { ok: true, plan };
}
