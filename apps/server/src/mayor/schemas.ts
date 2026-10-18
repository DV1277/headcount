// JSON Schema documents handed to step-5-preview via response_format json_schema.
// Hand-written (no zod-to-json-schema dep); length limits mirror packages/contracts.

const s = { type: 'string' } as const;

const taskItem = {
  type: 'object',
  properties: {
    id: s,
    owner: { type: 'string', enum: ['scout', 'maker', 'herald'] },
    title: s,
    instructions: s,
    deliverable: { type: 'string', enum: ['research', 'site', 'launch_kit'] },
    dependsOn: { type: 'array', items: s },
    enabled: { type: 'boolean' },
  },
  required: ['id', 'owner', 'title', 'instructions', 'deliverable', 'dependsOn', 'enabled'],
  additionalProperties: false,
};

export const PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: s,
    summary: s,
    questions: { type: 'array', items: s, maxItems: 2 },
    tasks: { type: 'array', items: taskItem, minItems: 3, maxItems: 6 },
  },
  required: ['title', 'summary', 'questions', 'tasks'],
  additionalProperties: false,
} as const;

export const RESEARCH_JSON_SCHEMA = {
  type: 'object',
  properties: {
    competitors: {
      type: 'array', minItems: 1, maxItems: 5,
      items: { type: 'object', properties: { name: s, url: s, priceNote: s, notes: s }, required: ['name', 'url', 'priceNote', 'notes'], additionalProperties: false },
    },
    audience: s,
    priceBand: s,
    gaps: { type: 'array', items: s, minItems: 1, maxItems: 3 },
    sources: { type: 'array', items: s, minItems: 1 },
  },
  required: ['competitors', 'audience', 'priceBand', 'gaps', 'sources'],
  additionalProperties: false,
} as const;

export const SITE_JSON_SCHEMA = {
  type: 'object',
  properties: { headline: s, html: s },
  required: ['headline', 'html'],
  additionalProperties: false,
} as const;

export const LAUNCH_KIT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    posts: { type: 'object', properties: { x: s, linkedin: s, instagram: s }, required: ['x', 'linkedin', 'instagram'], additionalProperties: false },
    emails: {
      type: 'array', minItems: 3, maxItems: 5,
      items: { type: 'object', properties: { persona: s, subject: s, body: s }, required: ['persona', 'subject', 'body'], additionalProperties: false },
    },
  },
  required: ['posts', 'emails'],
  additionalProperties: false,
} as const;

export const REVIEW_JSON_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['accept', 'revise'] },
    note: s,
  },
  required: ['verdict', 'note'],
  additionalProperties: false,
} as const;

export const BRIEF_JSON_SCHEMA = {
  type: 'object',
  properties: {
    markdown: s,
    nextSteps: { type: 'array', items: s, minItems: 3, maxItems: 3 },
  },
  required: ['markdown', 'nextSteps'],
  additionalProperties: false,
} as const;

export const REPAIR_VALUE_JSON_SCHEMA = {
  type: 'object',
  properties: { value: {} },
  required: ['value'],
  additionalProperties: false,
} as const;

export const KIND_TO_JSON_SCHEMA = {
  plan: PLAN_JSON_SCHEMA,
  research: RESEARCH_JSON_SCHEMA,
  site: SITE_JSON_SCHEMA,
  launch_kit: LAUNCH_KIT_JSON_SCHEMA,
  brief: BRIEF_JSON_SCHEMA,
} as const;
