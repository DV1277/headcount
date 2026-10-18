import { z } from 'zod';
import type { Artifact, EventEnvelope, Plan } from './index';

export const AgentIdSchema = z.enum(['mayor', 'scout', 'maker', 'herald', 'founder']);
export const DeptIdSchema = z.enum(['scout', 'maker', 'herald']);
export const BuildingIdSchema = z.enum(['hall', 'library', 'workshop', 'post', 'home', 'plaza']);
export const ArtifactKindSchema = z.enum(['research', 'site', 'launch_kit', 'brief']);
export const RunStatusSchema = z.enum(['drafting', 'awaiting_founder', 'awaiting_approval', 'running', 'paused', 'finishing', 'completed', 'failed']);
export const TaskStatusSchema = z.enum(['blocked', 'ready', 'dispatched', 'working', 'submitted', 'under_review', 'revising', 'covered', 'accepted', 'failed', 'skipped']);
export const ErrorCodeSchema = z.enum(['timeout', 'upstream', 'unparseable', 'budget', 'cancelled', 'server_restart', 'unknown']);
const id = z.string().min(1).max(100);
const text = z.string().min(1);
const nonnegative = z.number().finite().nonnegative();
export const ViaSchema = z.enum(['creao-realtime', 'creao-async', 'mayor-cover', 'mock']);
export const PlanTaskSchema = z.object({
  id, owner: DeptIdSchema, title: text.max(60), instructions: text.max(600),
  deliverable: z.enum(['research', 'site', 'launch_kit']), dependsOn: z.array(id).max(5), enabled: z.boolean(),
}).strict();
export const PlanSchema: z.ZodType<Plan> = z.object({
  title: text.max(100), summary: text.max(280), tasks: z.array(PlanTaskSchema).min(3).max(6), questions: z.array(text.max(280)).max(2),
}).strict().superRefine((plan, ctx) => {
  const tasks = new Map(plan.tasks.map(task => [task.id, task]));
  if (tasks.size !== plan.tasks.length) ctx.addIssue({ code: 'custom', path: ['tasks'], message: 'Task IDs must be unique.' });
  const done = new Set<string>(), active = new Set<string>();
  const visit = (taskId: string): boolean => {
    if (active.has(taskId)) return false;
    if (done.has(taskId)) return true;
    active.add(taskId);
    for (const dep of tasks.get(taskId)?.dependsOn ?? []) if (tasks.has(dep) && !visit(dep)) return false;
    active.delete(taskId); done.add(taskId); return true;
  };
  for (const [i, task] of plan.tasks.entries()) {
    if (new Set(task.dependsOn).size !== task.dependsOn.length) ctx.addIssue({ code: 'custom', path: ['tasks', i, 'dependsOn'], message: 'Dependencies must be unique.' });
    for (const dep of task.dependsOn) if (!tasks.has(dep) || dep === task.id) ctx.addIssue({ code: 'custom', path: ['tasks', i, 'dependsOn'], message: 'Dependencies must reference another task in this plan.' });
    const kinds = {scout:'research',maker:'site',herald:'launch_kit'} as const;
    if (task.deliverable !== kinds[task.owner]) ctx.addIssue({ code: 'custom', path: ['tasks', i, 'deliverable'], message: 'Deliverable must match the department.' });
  }
  if (plan.tasks.some(task => !visit(task.id))) ctx.addIssue({ code: 'custom', path: ['tasks'], message: 'Task dependencies must be acyclic.' });
});
export const ArtifactMetaSchema = z.object({
  id, runId: id, taskId: id.nullable(), agent: AgentIdSchema, via: ViaSchema.optional(),
  kind: ArtifactKindSchema, title: text.max(160), createdAt: z.string().datetime(), url: z.string().min(1).optional(),
}).strict();
export const ResearchPayloadSchema = z.object({
  competitors: z.array(z.object({name:text,url:z.string().url(),priceNote:text,notes:text}).strict()).min(1).max(5),
  audience: text.max(280), priceBand: text.max(60), gaps: z.array(text.max(140)).min(1).max(3), sources: z.array(z.string().url()).min(1),
}).strict();
export const SitePayloadSchema = z.object({
  headline: text.max(140), html: text.refine(html => new TextEncoder().encode(html).byteLength <= 120 * 1024, 'HTML exceeds 120 KB.'),
}).strict();
export const LaunchKitPayloadSchema = z.object({
  posts: z.object({x:text.max(270),linkedin:text,instagram:text}).strict(),
  emails: z.array(z.object({persona:text,subject:text.max(60),body:text}).strict()).min(3).max(5),
}).strict();
export const BriefPayloadSchema = z.object({markdown:text,nextSteps:z.array(text).length(3)}).strict();
export const ArtifactSchema: z.ZodType<Artifact> = z.discriminatedUnion('kind', [
  ArtifactMetaSchema.extend({kind:z.literal('research'),payload:ResearchPayloadSchema}),
  ArtifactMetaSchema.extend({kind:z.literal('site'),payload:SitePayloadSchema}),
  ArtifactMetaSchema.extend({kind:z.literal('launch_kit'),payload:LaunchKitPayloadSchema}),
  ArtifactMetaSchema.extend({kind:z.literal('brief'),payload:BriefPayloadSchema}),
]);
export const RunStatsSchema = z.object({tasks:nonnegative.int(),handoffs:nonnegative.int(),revisions:nonnegative.int(),minutes:nonnegative,credits:nonnegative,usd:nonnegative}).strict();
const error = z.object({code:ErrorCodeSchema,message:text}).strict();
const taskAgent = {taskId:id,agent:DeptIdSchema};
const event = <T extends string, S extends z.ZodRawShape>(type:T, shape:S) => z.object({type:z.literal(type),data:z.object(shape).strict()}).strict();
export const TownEventSchema = z.discriminatedUnion('type', [
  event('run.created',{idea:text.min(8).max(280),mode:z.enum(['live','mock','demo'])}),
  event('mayor.thinking',{phase:z.enum(['plan','review','brief','repair']),taskId:id.optional()}),
  event('founder.question',{qid:id,text:text.max(280)}), event('founder.answer',{qid:id,text:text.max(1000)}),
  event('plan.proposed',{plan:PlanSchema,source:z.enum(['model','repaired','template'])}),
  event('plan.approved',{plan:PlanSchema,edited:z.boolean()}),
  event('handoff',{from:DeptIdSchema,to:DeptIdSchema,taskId:id,artifactId:id,summary:text.max(60)}),
  event('task.dispatched',{...taskAgent,attempt:z.number().int().min(1),via:ViaSchema}),
  event('task.started',{...taskAgent,externalRunId:id.optional()}),
  event('agent.tool',{agent:AgentIdSchema,taskId:id.optional(),tool:text,label:text.max(80)}),
  event('agent.progress',{agent:AgentIdSchema,taskId:id.optional(),note:text.max(80)}),
  event('agent.say',{agent:AgentIdSchema,text:text.max(80),source:z.enum(['model','canned'])}),
  event('artifact.created',{artifact:ArtifactMetaSchema}),
  event('task.submitted',{taskId:id,artifactId:id}),
  event('review.verdict',{taskId:id,artifactId:id,verdict:z.enum(['accept','revise']),note:z.string().max(140)}),
  event('task.revising',{taskId:id,note:text.max(600),by:z.enum(['mayor','founder'])}),
  event('task.completed',{taskId:id,artifactId:id,revised:z.boolean()}),
  event('task.failed',{taskId:id,error,willRetry:z.boolean(),next:z.enum(['retry','mayor-cover','skip'])}),
  event('founder.redirect',{...taskAgent,note:text.max(600)}),
  event('run.paused',{}), event('run.resumed',{}),
  event('payroll.tick',{agent:AgentIdSchema,credits:nonnegative.optional(),tokensIn:nonnegative.int().optional(),tokensOut:nonnegative.int().optional(),usd:nonnegative}),
  event('brief.ready',{artifactId:id}), event('run.completed',{siteUrl:z.string().nullable(),stats:RunStatsSchema}),
  event('task.skipped',{taskId:id,reason:text}), event('run.finishing',{}), event('run.failed',{error}),
]);
const envelope = z.object({v:z.literal(1),runId:id,seq:z.number().int().min(1),t:nonnegative,at:z.string().datetime()}).strict();
// Validate the two halves separately so strict schemas retain the wire format.
export const EventEnvelopeSchema: z.ZodType<EventEnvelope, z.ZodTypeDef, unknown> = z.unknown().transform((value, ctx) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {ctx.addIssue({code:'custom',message:'Expected an event envelope.'});return z.NEVER;}
  const {v,runId,seq,t,at,type,data,...extra} = value as Record<string, unknown>;
  if (Object.keys(extra).length) {ctx.addIssue({code:'custom',message:'Unknown event fields.'});return z.NEVER;}
  const head=envelope.safeParse({v,runId,seq,t,at}), body=TownEventSchema.safeParse({type,data});
  if (!head.success) for (const issue of head.error.issues) ctx.addIssue(issue);
  if (!body.success) for (const issue of body.error.issues) ctx.addIssue(issue);
  if (!head.success || !body.success) return z.NEVER;
  return {...head.data,...body.data} as EventEnvelope;
});
export const ArtifactSchemas = {research:ResearchPayloadSchema,site:SitePayloadSchema,launch_kit:LaunchKitPayloadSchema,brief:BriefPayloadSchema};
