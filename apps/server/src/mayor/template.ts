// Template plan (§11.4): deterministic fallback used when planning or repair fails or times out.
import type { Plan } from '@hc/contracts';

export function deriveTitle(idea: string): string {
  const cleaned = idea.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Standard plan';
  const title = cleaned.slice(0, 40).trim();
  return title.length < cleaned.length ? `${title}…` : title;
}

export function templatePlan(idea: string): Plan {
  return {
    title: deriveTitle(idea),
    summary: 'Research the market, build the page, write the launch.',
    questions: [],
    tasks: [
      {
        id: 't1', owner: 'scout', title: 'Market research', deliverable: 'research', dependsOn: [], enabled: true,
        instructions: 'Find up to 5 direct competitors for the idea, their prices, the target audience, and 3 gaps we can exploit.',
      },
      {
        id: 't2', owner: 'maker', title: 'Landing page', deliverable: 'site', dependsOn: ['t1'], enabled: true,
        instructions: 'Build a landing page that positions us against the gaps found in research, with pricing in the market band.',
      },
      {
        id: 't3', owner: 'herald', title: 'Launch kit', deliverable: 'launch_kit', dependsOn: ['t1'], enabled: true,
        instructions: 'Write launch posts and outreach emails aimed at the researched audience; link the site.',
      },
    ],
  };
}
