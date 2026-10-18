import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const out = join(process.cwd(), 'fixtures/runs');
const stamp = '2026-10-18T09:00:00.000Z';
const env = (runId: string, seq: number, t: number, type: string, data: unknown) => ({ v: 1, runId, seq, t, at: new Date(Date.parse(stamp) + t).toISOString(), type, data });
const commonPlan = { title: 'Golden Boba', summary: 'Validate a focused boba launch in Westwood.', questions: [], tasks: [
  { id: 't1', owner: 'scout', title: 'Research Westwood boba buyers', instructions: 'Map nearby alternatives and unmet needs.', deliverable: 'research', dependsOn: [], enabled: true },
  { id: 't2', owner: 'maker', title: 'Build the preorder page', instructions: 'Create a mobile-friendly one-page site.', deliverable: 'site', dependsOn: ['t1'], enabled: true },
  { id: 't3', owner: 'herald', title: 'Prepare launch messages', instructions: 'Write channel copy grounded in the research.', deliverable: 'launch_kit', dependsOn: ['t1'], enabled: true },
] };
const artifact = <Payload>(id: string, taskId: string | null, agent: string, kind: string, title: string, payload: Payload, via = 'mock') => ({ id, runId: 'run_fixture', taskId, agent, via, kind, title, createdAt: stamp, payload });
const research = artifact('a_research', 't1', 'scout', 'research', 'Westwood boba market scan', { competitors: [{ name: 'Example Tea House', url: 'https://example.com/tea', priceNote: '$6–8 (illustrative)', notes: 'Fixture example; verify independently.' }, { name: 'Sample Pearl Bar', url: 'https://example.org/pearls', priceNote: '$5–7 (illustrative)', notes: 'Fictional competitor for offline demo.' }], audience: 'Westwood students looking for a quick customizable afternoon drink.', priceBand: '$6–9 per drink (illustrative)', gaps: ['Clear pickup timing during class changes.'], sources: ['https://example.com/tea', 'https://example.org/pearls'] });
const site = artifact('a_site', 't2', 'maker', 'site', 'Golden Boba preorder page', { headline: 'Your next favorite study break', html: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Golden Boba · Fixture</title><style>body{font:18px system-ui;max-width:700px;margin:4rem auto;padding:0 1rem;background:#fff8e8;color:#30251d}button{background:#bd572f;color:white;border:0;padding:1rem;border-radius:9px}</style></head><body><p>OFFLINE DEMO · FIXTURE / MOCK</p><h1>Your next favorite study break</h1><p>Golden Boba is a fictional neighborhood tea counter concept. Choose your sweetness, pick a time, and get back to your day.</p><button>Join the sample waitlist</button><small> Demo only. No order is placed.</small></body></html>' });
const kit = artifact('a_launch', 't3', 'herald', 'launch_kit', 'Golden Boba launch kit', { posts: { x: 'A fictional Westwood boba concept is brewing. Fixture copy for demo only.', linkedin: 'Meet Golden Boba, a fictional student-first tea counter concept. This is sample launch copy.', instagram: 'Study break, poured your way 🧋 (fictional fixture)' }, emails: [{ persona: 'Students', subject: 'A sample study break is brewing', body: 'Golden Boba is a fictional concept in this offline demo.' }, { persona: 'Campus clubs', subject: 'Fixture: a tea pickup idea', body: 'Sample partnership message; no real business or offer.' }, { persona: 'Neighbors', subject: 'Meet the demo concept', body: 'This launch kit is illustrative only.' }] });
const brief = artifact('a_brief', null, 'mayor', 'brief', 'Founder brief', { markdown: '# Founder brief (fixture)\nGolden Boba is a fictional concept. Validate demand before investment.', nextSteps: ['Interview five students.', 'Test pickup windows.', 'Replace mock competitor data with verified research.'] });

function makeRun(name: string, runId: string, events: any[]) {
  const scale = name === 'golden-boba' ? 3.4 : 1;
  const fixRunId = (value: any): any => Array.isArray(value) ? value.map(fixRunId) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'runId' ? runId : fixRunId(v)])) : value;
  return events.map(([type, data, t]: [string, unknown, number], i: number) => env(runId, i + 1, t * scale, type, fixRunId(data)));
}
const base = (runId: string, plan = commonPlan) => [
  ['run.created', { idea: 'A student-friendly boba counter near Westwood.', mode: 'demo' }, 0],
  ['mayor.thinking', { phase: 'plan' }, 500],
  ['founder.question', { qid: 'q1', text: 'Should pickup be optimized for class breaks?' }, 1800],
  ['founder.answer', { qid: 'q1', text: 'Yes, prioritize a fast pickup window.' }, 4200],
  ['plan.proposed', { plan, source: 'template' }, 6500],
  ['plan.approved', { plan, edited: false }, 9000],
];
const artMeta = (a: any) => { const { payload: _payload, ...meta } = a; return meta; };
type FixtureEvent = [string, unknown, number];
const updateBurst = (agent: string, taskId: string, tool: string, label: string, note: string, say: string, t: number): FixtureEvent[] => [
  ['agent.tool', { agent, taskId, tool, label }, t],
  ['agent.progress', { agent, taskId, note }, t + 500],
  ['agent.say', { agent, text: say, source: 'canned' }, t + 1200],
];
const makerUpdates: FixtureEvent[] = [
  ...[
    ['copy_research', 'Reading Scout’s accepted audience and pickup notes', 'Using Scout’s handoff as the page brief.', 'The page will focus on a quick class-break pickup.'],
    ['html_builder', 'Drafting the hero and sample menu section', 'Keeping the page in one self-contained HTML file.', 'The first layout is ready for review.'],
    ['html_validator', 'Checking mobile layout and semantic markup', 'Checking heading order and viewport behavior.', 'The page reads well at phone width.'],
    ['form_guard', 'Checking that the sample action has no side effects', 'The demo button does not place an order or send data.', 'I will make the demo-only note more visible.'],
  ].flatMap((row, i) => updateBurst('maker', 't2', row[0]!, row[1]!, row[2]!, row[3]!, 61200 + i * 1700)),
  ['agent.tool', { agent: 'maker', taskId: 't2', tool: 'html_builder', label: 'Building a self-contained sample page' }, 60000],
];
const heraldUpdates: FixtureEvent[] = [
  ...[
    ['launch_copy', 'Drafting a sample social post', 'Using the student audience and pickup benefit.', 'A short version is ready for the social card.'],
    ['email_writer', 'Writing sample partner outreach', 'This is only a draft; no message is being sent.', 'The partner note stays specific and low pressure.'],
    ['copy_check', 'Checking claims against fixture artifacts', 'Removing claims not present in the sample work.', 'The copy is grounded in Scout’s research.'],
    ['channel_format', 'Formatting sample channel variations', 'Keeping each channel draft within its intended tone.', 'The launch kit is ready for review.'],
  ].flatMap((row, i) => updateBurst('herald', 't3', row[0]!, row[1]!, row[2]!, row[3]!, 58200 + i * 2200)),
];
const departmentUpdates: FixtureEvent[] = [...makerUpdates, ...heraldUpdates].sort((left, right) => left[2] - right[2]);
const golden = [...base('run_golden_boba'),
  ['task.dispatched', { taskId: 't1', agent: 'scout', attempt: 1, via: 'mock' }, 12000], ['task.started', { taskId: 't1', agent: 'scout', externalRunId: 'fixture-scout-1' }, 15000],
  ...[
    ['web_search', 'Searching sample menus and public pricing', 'Collected example menu patterns; verify all facts before use.', 'I found several illustrative menu patterns.'],
    ['browser_open', 'Opening fictional competitor pages', 'Comparing sample pickup hours and page structure.', 'Pickup clarity may be a useful angle.'],
    ['web_search', 'Checking public audience discussions', 'Looking for student routines in public sample sources.', 'Class changes create short ordering windows.'],
    ['browser_extract', 'Extracting sample pickup details', 'Separating fixture examples from verified research.', 'I am keeping the examples clearly labeled.'],
    ['web_search', 'Checking price range examples', 'Pricing notes remain illustrative in this offline fixture.', 'The page should avoid implying a real offer.'],
  ].flatMap((row, i) => updateBurst('scout', 't1', row[0]!, row[1]!, row[2]!, row[3]!, 16000 + i * 3800)),
  ['artifact.created', { artifact: artMeta(research) }, 37000], ['task.submitted', { taskId: 't1', artifactId: 'a_research' }, 40000], ['mayor.thinking', { phase: 'review', taskId: 't1' }, 42000],
  ...[
    ['stepfun_review', 'Reviewing the research fixture for unsupported claims', 'Checking whether each sample is clearly identified as fictional.', 'The labels make the limits clear.'],
    ['stepfun_review', 'Checking handoff usefulness for the Maker', 'Reducing the findings to a concrete pickup insight.', 'This is ready for a sample page brief.'],
  ].flatMap((row, i) => updateBurst('mayor', 't1', row[0]!, row[1]!, row[2]!, row[3]!, 42100 + i * 1300)),
  ['review.verdict', { taskId: 't1', artifactId: 'a_research', verdict: 'accept', note: 'Clear and appropriately labeled as fixture data.' }, 45000], ['task.completed', { taskId: 't1', artifactId: 'a_research', revised: false }, 47000],
  ['payroll.tick', { agent: 'scout', credits: 2, tokensIn: 1800, tokensOut: 620, usd: 0.01 }, 48000],
  ['handoff', { from: 'scout', to: 'maker', taskId: 't2', artifactId: 'a_research', summary: 'Use the class-break pickup insight.' }, 49000], ['handoff', { from: 'scout', to: 'herald', taskId: 't3', artifactId: 'a_research', summary: 'Ground launch copy in the research.' }, 50000],
  ['task.dispatched', { taskId: 't2', agent: 'maker', attempt: 1, via: 'mock' }, 52000], ['task.dispatched', { taskId: 't3', agent: 'herald', attempt: 1, via: 'mock' }, 53000], ['task.started', { taskId: 't2', agent: 'maker' }, 55000], ['task.started', { taskId: 't3', agent: 'herald' }, 56000],
  ...departmentUpdates,
  ['founder.redirect', { agent: 'herald', taskId: 't3', note: 'Keep every channel clearly labeled as sample copy.' }, 67600], ['task.revising', { taskId: 't3', note: 'Add clear sample-copy labels.', by: 'founder' }, 67650], ['task.dispatched', { taskId: 't3', agent: 'herald', attempt: 2, via: 'mock' }, 67700], ['task.started', { taskId: 't3', agent: 'herald' }, 67750],
  ['artifact.created', { artifact: artMeta(kit) }, 68000], ['task.submitted', { taskId: 't3', artifactId: 'a_launch' }, 69000], ['task.completed', { taskId: 't3', artifactId: 'a_launch', revised: true }, 70000], ['payroll.tick', { agent: 'herald', credits: 2, tokensIn: 1600, tokensOut: 800, usd: 0.03 }, 71000],
  ['artifact.created', { artifact: artMeta(site) }, 73000], ['task.submitted', { taskId: 't2', artifactId: 'a_site' }, 75000], ['mayor.thinking', { phase: 'review', taskId: 't2' }, 75500], ['review.verdict', { taskId: 't2', artifactId: 'a_site', verdict: 'revise', note: 'Make the sample waitlist clearly nonfunctional.' }, 76000], ['task.revising', { taskId: 't2', note: 'Clarify that no orders are placed.', by: 'mayor' }, 78000], ['task.dispatched', { taskId: 't2', agent: 'maker', attempt: 2, via: 'mock' }, 82000],
  ['task.started', { taskId: 't2', agent: 'maker' }, 83000], ['artifact.created', { artifact: artMeta({ ...site, id: 'a_site_v2', title: 'Golden Boba preorder page (fixture)' }) }, 87000], ['task.submitted', { taskId: 't2', artifactId: 'a_site_v2' }, 89000], ['task.completed', { taskId: 't2', artifactId: 'a_site_v2', revised: true }, 92000], ['payroll.tick', { agent: 'maker', credits: 3, tokensIn: 2600, tokensOut: 1150, usd: 0.04 }, 93000], ['run.finishing', {}, 114000], ['mayor.thinking', { phase: 'brief' }, 115000], ['artifact.created', { artifact: artMeta(brief) }, 118000], ['brief.ready', { artifactId: 'a_brief' }, 120000], ['payroll.tick', { agent: 'scout', credits: 2, tokensIn: 400, tokensOut: 150, usd: 0.04 }, 121000], ['run.completed', { siteUrl: 'http://localhost:8788/sites/run_golden_boba/', stats: { tasks: 3, handoffs: 2, revisions: 2, minutes: 7, credits: 9, usd: 0.12 } }, 123000],
];
const failure = [...base('run_failure_retry'), ['task.dispatched', { taskId: 't1', agent: 'scout', attempt: 1, via: 'creao-realtime' }, 12000], ['task.started', { taskId: 't1', agent: 'scout' }, 15000], ['task.failed', { taskId: 't1', error: { code: 'timeout', message: 'Fixture timeout while streaming.' }, willRetry: true, next: 'retry' }, 26000], ['task.dispatched', { taskId: 't1', agent: 'scout', attempt: 2, via: 'creao-async' }, 29000], ['task.started', { taskId: 't1', agent: 'scout' }, 30000], ['agent.progress', { agent: 'scout', taskId: 't1', note: 'Retry completed from saved run.' }, 36000], ['artifact.created', { artifact: artMeta({ ...research, via: 'creao-async' }) }, 43000], ['task.submitted', { taskId: 't1', artifactId: 'a_research' }, 45000], ['task.completed', { taskId: 't1', artifactId: 'a_research', revised: false }, 47000], ['handoff', { from: 'scout', to: 'maker', taskId: 't2', artifactId: 'a_research', summary: 'Use the class-break pickup insight.' }, 48000], ['task.dispatched', { taskId: 't2', agent: 'maker', attempt: 1, via: 'creao-realtime' }, 50000], ['task.started', { taskId: 't2', agent: 'maker' }, 52000], ['agent.tool', { agent: 'maker', taskId: 't2', tool: 'browser', label: 'Opening sample page references' }, 53000], ['task.failed', { taskId: 't2', error: { code: 'upstream', message: 'Maker fixture worker unavailable.' }, willRetry: false, next: 'mayor-cover' }, 54000], ['task.dispatched', { taskId: 't2', agent: 'maker', attempt: 2, via: 'mayor-cover' }, 57000], ['artifact.created', { artifact: artMeta({ ...site, via: 'mayor-cover' }) }, 65000], ['task.submitted', { taskId: 't2', artifactId: 'a_site' }, 68000], ['task.completed', { taskId: 't2', artifactId: 'a_site', revised: false }, 70000], ['task.skipped', { taskId: 't3', reason: 'Skipped in failure-path fixture.' }, 73000], ['run.finishing', {}, 75000], ['run.failed', { error: { code: 'upstream', message: 'Mayor could not prepare the founder brief in this failure-path fixture.' } }, 78000]];
const redirectPlan = { ...commonPlan, tasks: commonPlan.tasks.map((task) => task.id === 't3' ? { ...task, enabled: false } : task) };
const redirect = [...base('run_redirect', redirectPlan), ['task.dispatched', { taskId: 't1', agent: 'scout', attempt: 1, via: 'mock' }, 12000], ['task.started', { taskId: 't1', agent: 'scout' }, 15000], ['artifact.created', { artifact: artMeta(research) }, 23000], ['task.submitted', { taskId: 't1', artifactId: 'a_research' }, 25000], ['mayor.thinking', { phase: 'review', taskId: 't1' }, 26000], ['review.verdict', { taskId: 't1', artifactId: 'a_research', verdict: 'revise', note: 'Label illustrative pricing more clearly.' }, 27000], ['task.revising', { taskId: 't1', note: 'Add explicit fixture labels.', by: 'mayor' }, 29000], ['task.dispatched', { taskId: 't1', agent: 'scout', attempt: 2, via: 'mock' }, 32000], ['task.started', { taskId: 't1', agent: 'scout' }, 33000], ['artifact.created', { artifact: artMeta({ ...research, id: 'a_research_v2', title: 'Westwood boba scan (labeled fixture)' }) }, 40000], ['task.submitted', { taskId: 't1', artifactId: 'a_research_v2' }, 42000], ['task.completed', { taskId: 't1', artifactId: 'a_research_v2', revised: true }, 44000], ['handoff', { from: 'scout', to: 'maker', taskId: 't2', artifactId: 'a_research_v2', summary: 'Use the labeled buyer and pickup notes.' }, 45000], ['task.dispatched', { taskId: 't2', agent: 'maker', attempt: 1, via: 'mock' }, 46000], ['task.started', { taskId: 't2', agent: 'maker' }, 47000], ['founder.redirect', { agent: 'maker', taskId: 't2', note: 'Make the sample order action clearly nonfunctional.' }, 48000], ['task.revising', { taskId: 't2', note: 'Clarify demo-only action.', by: 'founder' }, 50000], ['task.dispatched', { taskId: 't2', agent: 'maker', attempt: 2, via: 'mock' }, 52000], ['task.started', { taskId: 't2', agent: 'maker' }, 53000], ['artifact.created', { artifact: artMeta(site) }, 61000], ['task.submitted', { taskId: 't2', artifactId: 'a_site' }, 62000], ['task.completed', { taskId: 't2', artifactId: 'a_site', revised: true }, 63000], ['run.paused', {}, 71000], ['run.resumed', {}, 72000], ['payroll.tick', { agent: 'mayor', tokensIn: 300, tokensOut: 80, usd: 0.02 }, 74000], ['run.finishing', {}, 76000], ['mayor.thinking', { phase: 'brief' }, 77000], ['artifact.created', { artifact: artMeta(brief) }, 79000], ['brief.ready', { artifactId: 'a_brief' }, 82000], ['run.completed', { siteUrl: 'http://localhost:8788/sites/run_redirect/', stats: { tasks: 3, handoffs: 1, revisions: 2, minutes: 1, credits: 0, usd: 0.02 } }, 84000]];

await mkdir(out, { recursive: true });
for (const [name, id, events, artifacts] of [
  ['golden-boba', 'run_golden_boba', golden, { a_research: research, a_site: site, a_site_v2: { ...site, id: 'a_site_v2', title: 'Golden Boba preorder page (fixture)' }, a_launch: kit, a_brief: brief }],
  ['failure-retry', 'run_failure_retry', failure, { a_research: { ...research, via: 'creao-async' }, a_site: { ...site, via: 'mayor-cover' } }],
  ['redirect', 'run_redirect', redirect, { a_research: research, a_research_v2: { ...research, id: 'a_research_v2', title: 'Westwood boba scan (labeled fixture)' }, a_site: site, a_brief: brief }],
] as const) {
  const records = makeRun(name, id, events);
  await writeFile(join(out, `${name}.jsonl`), records.map((x) => JSON.stringify(x)).join('\n') + '\n');
  const fixtureArtifacts = Object.fromEntries(Object.entries(artifacts).map(([key, value]: [string, any]) => [key, { ...value, runId: id }]));
  await writeFile(join(out, `${name}.artifacts.json`), JSON.stringify(fixtureArtifacts, null, 2) + '\n');
  await writeFile(join(out, `${name}.site.html`), site.payload.html);
}
