// Mock payload fixtures (A-01): schema-valid, deterministic, idea-independent.
// __SITE_URL__ tokens are replaced with the run's deterministic site URL.
import type { LaunchKitPayload, ResearchPayload, SitePayload } from '@hc/contracts';
import { readFileSync } from 'node:fs';

export type RolePayload = ResearchPayload | SitePayload | LaunchKitPayload;
export type MockPayloads = { scout: ResearchPayload; maker: SitePayload; herald: LaunchKitPayload };

function load<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../../../../fixtures/agent-outputs/${name}.json`, import.meta.url), 'utf8')) as T;
}

let cached: MockPayloads | null = null;

export function mockPayloads(): MockPayloads {
  cached ??= { scout: load('scout'), maker: load('maker'), herald: load('herald') };
  return cached;
}

/** Deep-copy the fixture payload for a role kind, substituting the deterministic site URL. */
export function mockPayloadFor(kind: 'research' | 'site' | 'launch_kit'): RolePayload {
  const base = kind === 'research' ? mockPayloads().scout : kind === 'site' ? mockPayloads().maker : mockPayloads().herald;
  return substituteSiteUrl(structuredClone(base), null) as RolePayload;
}

export function substituteSiteUrl(value: unknown, siteUrl: string | null): unknown {
  if (siteUrl === null || siteUrl === undefined) return value;
  if (typeof value === 'string') return value.replaceAll('__SITE_URL__', siteUrl);
  if (Array.isArray(value)) return value.map((v) => substituteSiteUrl(v, siteUrl));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substituteSiteUrl(v, siteUrl)]));
  }
  return value;
}
