// Deterministic mock Mayor (A-01): schema-valid fixture payloads, HC_MOCK_SPEED-scaled delays,
// zero usage — mocks never masquerade as model spend (A-01 hard rule).
import type { Artifact, BriefPayload, Plan, PlanTask } from '@hc/contracts';
import { CANNED_SAY, vetSay, type SayMoment } from './canned';
import { mockDelayMs } from '../llm/mock-time';
import { mockPayloadFor } from './mock-payloads';
import { templatePlan } from './template';
import type { Mayor, Usage } from './index';

const ZERO: Usage = { tokensIn: 0, tokensOut: 0 };

export class MockMayor implements Mayor {
  async plan(i: { idea: string; answers?: { q: string; a: string }[] }): Promise<{ plan: Plan; source: 'template'; usage: Usage }> {
    await mockDelayMs(2_500);
    void i.answers;
    return { plan: templatePlan(i.idea), source: 'template', usage: { ...ZERO } };
  }

  async review(_i: { idea: string; task: PlanTask; artifact: Artifact }): Promise<{ verdict: 'accept'; note: string; usage: Usage }> {
    await mockDelayMs(1_500);
    return { verdict: 'accept', note: 'Mock review pass; fixture output stable.', usage: { ...ZERO } };
  }

  async brief(i: { idea: string; plan: Plan; artifacts: Artifact[] }): Promise<{ brief: BriefPayload; usage: Usage }> {
    await mockDelayMs(2_000);
    void i.idea;
    void i.plan;
    void i.artifacts;
    const nextSteps = ['Validate the price band with five real customers.', 'Offer preorders and track the first ten.', 'Post the launch where the audience already is.'];
    const markdown = [
      '## What we built', '',
      'A landing page and launch kit for the founder idea (mock run).', '',
      '## What we learned', '',
      '- Mock research payload: gaps and price bands are fixture data.', '- Fixture competitors are illustrative only.', '- Audience copy is deterministic for offline demos.', '',
      '## Next 3 steps', '',
      ...nextSteps.map((s) => `- ${s}`), '',
      '## Links', '',
      '- Landing page: see the deliverables shelf (mock run).', '- Launch kit: see the deliverables shelf (mock run).',
    ].join('\n');
    return { brief: { markdown, nextSteps }, usage: { ...ZERO } };
  }

  async say(i: { moment: 'planned' | 'approved' | 'handoff' | 'accepted' | 'completed'; context: string }): Promise<{ text: string; source: 'canned'; usage: Usage }> {
    await mockDelayMs(600);
    void i.context;
    const line = CANNED_SAY[i.moment as SayMoment] ?? CANNED_SAY.planned;
    return { text: vetSay(line), source: 'canned', usage: { ...ZERO } };
  }

  async cover(i: { idea: string; task: PlanTask; inputs: Artifact[] }): Promise<{ payload: unknown; usage: Usage }> {
    await mockDelayMs(2_000);
    void i.idea;
    void i.inputs;
    const kind = i.task.deliverable;
    return { payload: mockPayloadFor(kind === 'research' || kind === 'site' || kind === 'launch_kit' ? kind : 'research'), usage: { ...ZERO } };
  }

  async repairJson<T>(): Promise<{ value: T | null; usage: Usage }> {
    await mockDelayMs(1_200);
    return { value: null, usage: { ...ZERO } };
  }
}
