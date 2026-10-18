// Output parsing (A-06, HC-F-043): last fenced ```json block → role schema → one Mayor repair.
import type { ArtifactKind } from '@hc/contracts';
import { ArtifactSchemas } from '@hc/contracts';
import { jsonCandidate, parseLooseJson } from '../llm/json';
import type { RolePayload } from '../mayor/mock-payloads';
import type { Mayor, Usage } from '../mayor';

export type ParseOutcome<K extends Exclude<ArtifactKind, 'brief'>> =
  | { ok: true; payload: RolePayload; usage: Usage | null }
  | { ok: false; reason: string; usage: Usage | null };

const ROLE = { research: true, site: true, launch_kit: true } as const;

export function isRoleKind(kind: string): kind is keyof typeof ROLE {
  return kind in ROLE;
}

/**
 * Parse an agent's raw output against the role schema; on failure, ONE Step-5 repair call
 * (HC-F-043). Returns a typed outcome; never fabricates a payload.
 */
export async function parseAgentOutput<T extends keyof typeof ROLE>(
  kind: T,
  raw: string,
  mayor: Mayor,
): Promise<ParseOutcome<T>> {
  const candidate = parseLooseJson(jsonCandidate(raw));
  if (candidate != null) {
    const checked = ArtifactSchemas[kind].safeParse(candidate);
    if (checked.success) return { ok: true, payload: checked.data, usage: null };
  }
  const repaired = await mayor.repairJson({
    raw: raw.slice(0, 160_000),
    schemaName: kind,
    errors: 'Expected a JSON object matching the role schema (last fenced ```json block).',
  }).catch(() => ({ value: null, usage: null }));
  const value = repaired.value;
  if (value != null) {
    const checked = ArtifactSchemas[kind].safeParse(value);
    if (checked.success) return { ok: true, payload: checked.data, usage: repaired.usage };
  }
  return { ok: false, reason: `output could not be parsed as ${kind} even after one repair call`, usage: repaired.usage };
}
