import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ArtifactSchema, EventEnvelopeSchema, PlanSchema, SitePayloadSchema } from '../src';
const raw=readFileSync(new URL('../../../fixtures/runs/golden-boba.jsonl',import.meta.url),'utf8').trim().split('\n').map(line=>EventEnvelopeSchema.parse(JSON.parse(line)));
const plan=raw.find(e=>e.type==='plan.proposed')!;
if(plan.type!=='plan.proposed')throw new Error('Fixture missing plan.');
const valid=plan.data.plan;
describe('runtime contracts',()=>{
  it('rejects cycles, missing dependencies, duplicate IDs and mismatched deliverables',()=>{
    const cyclic=structuredClone(valid);cyclic.tasks[0].dependsOn=[cyclic.tasks[1].id];
    expect(PlanSchema.safeParse(cyclic).success).toBe(false);
    const missing=structuredClone(valid);missing.tasks[1].dependsOn=['absent'];expect(PlanSchema.safeParse(missing).success).toBe(false);
    const duplicate=structuredClone(valid);duplicate.tasks[1].id=duplicate.tasks[0].id;expect(PlanSchema.safeParse(duplicate).success).toBe(false);
    const wrong=structuredClone(valid);wrong.tasks[0].deliverable='site';expect(PlanSchema.safeParse(wrong).success).toBe(false);
  });
  it('accepts plans with skipped tasks and rejects Mayor-owned tasks',()=>{
    const edited=structuredClone(valid);edited.tasks[2].enabled=false;expect(PlanSchema.parse(edited)).toEqual(edited);
    expect(PlanSchema.safeParse({...valid,tasks:[{...valid.tasks[0],owner:'mayor'},...valid.tasks.slice(1)]}).success).toBe(false);
  });
  it('rejects unknown envelope fields and nonfinite/negative wire values',()=>{
    expect(EventEnvelopeSchema.safeParse({...raw[0],secret:'not-a-contract-field'}).success).toBe(false);
    expect(EventEnvelopeSchema.safeParse({...raw[0],seq:0}).success).toBe(false);
    expect(EventEnvelopeSchema.safeParse({...raw[0],t:NaN}).success).toBe(false);
    expect(EventEnvelopeSchema.safeParse({...raw[0],v:2}).success).toBe(false);
    expect(EventEnvelopeSchema.safeParse({v:1,runId:'run_test',seq:1,t:0,at:new Date().toISOString(),type:'payroll.tick',data:{agent:'scout',usd:-1}}).success).toBe(false);
  });
  it('pairs artifact kinds with their payload and measures the HTML byte cap',()=>{
    const map=JSON.parse(readFileSync(new URL('../../../fixtures/runs/golden-boba.artifacts.json',import.meta.url),'utf8'));
    const research=Object.values(map).find((a:unknown)=>(a as {kind:string}).kind==='research') as object;
    expect(ArtifactSchema.safeParse({...research,kind:'site'}).success).toBe(false);
    expect(SitePayloadSchema.safeParse({headline:'Test page',html:'é'.repeat(70000)}).success).toBe(false);
  });
});
