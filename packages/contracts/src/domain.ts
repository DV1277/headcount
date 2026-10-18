import type {DeptId, AgentId} from './roster';
import type {TownEvent} from './events';
// packages/contracts/src/domain.ts
export type ArtifactKind = 'research' | 'site' | 'launch_kit' | 'brief';

export type PlanTask = {
  id: string;                 // 't1'..'t6'
  owner: DeptId;
  title: string;              // ≤ 60
  instructions: string;       // ≤ 600
  deliverable: ArtifactKind;  // never 'brief' (Mayor-only)
  dependsOn: string[];        // task ids, acyclic
  enabled: boolean;
};
export type Plan = { title: string; summary: string; tasks: PlanTask[]; questions: string[] };

export type ArtifactMeta = {
  id: string; runId: string; taskId: string | null;
  agent: AgentId;             // the owning department, even when covered by the Mayor
  via?: 'creao-realtime' | 'creao-async' | 'mayor-cover' | 'mock';
  kind: ArtifactKind; title: string; createdAt: string; url?: string;
};

export type ResearchPayload = {
  competitors: { name: string; url: string; priceNote: string; notes: string }[]; // 1..5
  audience: string;            // ≤ 280
  priceBand: string;           // ≤ 60, e.g. "$6–9 per drink"
  gaps: string[];              // 1..3, each ≤ 140
  sources: string[];           // urls
};
export type SitePayload = { headline: string; html: string };            // html ≤ 120 KB, one self-contained file
export type LaunchKitPayload = {
  posts: { x: string; linkedin: string; instagram: string };
  emails: { persona: string; subject: string; body: string }[];          // 3..5
};
export type BriefPayload = { markdown: string; nextSteps: string[] };   // nextSteps length 3

export type Artifact = ArtifactMeta & {
  payload: ResearchPayload | SitePayload | LaunchKitPayload | BriefPayload;
};

// packages/contracts/src/domain.ts (continued)
export type RunStatus = 'drafting' | 'awaiting_founder' | 'awaiting_approval' | 'running' | 'paused' | 'finishing' | 'completed' | 'failed';
export type TaskStatus = 'blocked' | 'ready' | 'dispatched' | 'working' | 'submitted' | 'under_review' | 'revising' | 'covered' | 'accepted' | 'failed' | 'skipped';
export type LogLine = { seq: number; t: number; text: string; kind: TownEvent['type'] };
export type Subscribe<T> = (f: (x: T) => void) => () => void;
