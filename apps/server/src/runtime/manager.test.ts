import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkInvariants} from '@hc/engine';
import type {Artifact,DeptId,EventEnvelope,Plan,PlanTask} from '@hc/contracts';
import type {Mayor} from '../mayor';
import type {Worker,WorkerInput,WorkerEvent,WorkerResult} from '../workers';
import {createRunManager,type RunManager,type RunManagerOptions} from './manager';

const zero={tokensIn:0,tokensOut:0};
const raw=JSON.parse(await readFile(new URL('../../../../fixtures/runs/golden-boba.artifacts.json',import.meta.url),'utf8')) as Record<string,Artifact>;
const plan:Plan={title:'Test company',summary:'Research, page and launch.',questions:[],tasks:[
  {id:'t1',owner:'scout',title:'Research',instructions:'Research the market.',deliverable:'research',dependsOn:[],enabled:true},
  {id:'t2',owner:'maker',title:'Page',instructions:'Build a page.',deliverable:'site',dependsOn:['t1'],enabled:true},
  {id:'t3',owner:'herald',title:'Launch',instructions:'Write launch drafts.',deliverable:'launch_kit',dependsOn:['t1'],enabled:true},
]};
const payload=(kind:string)=>structuredClone(Object.values(raw).find(artifact=>artifact.kind===kind)!.payload);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function deferred<T=void>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};}
function mayor():Mayor {
  return {
    plan:vi.fn(async()=>({plan:structuredClone(plan),source:'model' as const,usage:zero})),
    review:vi.fn(async()=>({verdict:'accept' as const,note:'Accepted.',usage:zero})),
    brief:vi.fn(async()=>({brief:payload('brief') as {markdown:string;nextSteps:string[]},usage:zero})),
    cover:vi.fn(async({task})=>({payload:payload(task.deliverable),usage:zero})),
    say:vi.fn(async()=>({text:'Team update.',source:'canned' as const,usage:zero})),
    repairJson:vi.fn(async()=>({value:null,usage:zero})),
  };
}
function success(input:WorkerInput):WorkerResult{return {ok:true,payload:payload(input.task.deliverable) as Extract<WorkerResult,{ok:true}>['payload'],credits:0,raw:'mock output',via:'mock'};}
let root:string;let managers:RunManager[]=[];
beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'hc-manager-'));vi.stubEnv('HC_MAYOR','mock');vi.stubEnv('HC_WORKERS','mock');vi.stubEnv('HC_MODE','live');vi.stubEnv('HC_KILL','0');vi.stubEnv('PUBLIC_BASE_URL','');});
afterEach(async()=>{for(const manager of managers)await manager.dispose();managers=[];await rm(root,{recursive:true,force:true});vi.unstubAllEnvs();});
function make(options:RunManagerOptions={}){const instance=createRunManager({rootDir:root,mayor:mayor(),getWorker:()=>({run:vi.fn(async(input,onEvent)=>{onEvent({kind:'started'});return success(input);})}),...options});managers.push(instance);return instance;}
async function until<T>(get:()=>Promise<T>,test:(value:T)=>boolean,timeout=5000){const deadline=Date.now()+timeout;let value=await get();while(!test(value)&&Date.now()<deadline){await sleep(5);value=await get();}if(!test(value))throw new Error(`Condition not reached: ${JSON.stringify(value)}`);return value;}
async function proposed(manager:RunManager){const id=await manager.create('A neighborhood boba business');await until(()=>manager.get(id),state=>state.status==='awaiting_approval');return id;}
async function completed(manager:RunManager,id:string){return until(()=>manager.get(id),state=>state.status==='completed');}
async function events(manager:RunManager,id:string){const sub=await manager.subscribe(id,()=>{});sub.close();return sub.history;}

describe('approved event-sourced executor',()=>{
  it('gates work, admits one active run, dispatches both downstream tasks concurrently, reviews each once, and stores sanitized HTML',async()=>{
    const gate=deferred();const downstream=new Set<string>();const m=mayor();
    const worker=vi.fn(async(input:WorkerInput,onEvent:(event:WorkerEvent)=>void)=>{
      onEvent({kind:'started'});
      if(input.task.owner!=='scout'){expect(input.inputs).toHaveLength(1);expect(input.inputs[0].kind).toBe('research');downstream.add(input.task.owner);await gate.promise;}
      if(input.task.owner==='maker')return {...success(input),payload:{headline:'Safe',html:'<h1>Safe</h1><script>bad()</script>'}} as WorkerResult;
      return success(input);
    });
    const manager=make({mayor:m,getWorker:()=>({run:worker})});const id=await proposed(manager);
    await sleep(20);expect(worker).not.toHaveBeenCalled();await expect(manager.create('Another valid business idea')).rejects.toMatchObject({code:'run_active'});
    await manager.approve(id,plan);await until(async()=>downstream.size,size=>size===2);expect(downstream).toEqual(new Set(['maker','herald']));gate.resolve();
    const state=await completed(manager,id);const log=await events(manager,id);expect(checkInvariants(log)).toEqual([]);expect(m.review).toHaveBeenCalledTimes(3);expect(state.handoffs).toHaveLength(2);
    const site=Object.values(state.artifacts).find(artifact=>artifact.kind==='site')!;const artifact=await manager.getArtifact(id,site.id);
    expect((artifact.payload as {html:string}).html).not.toContain('script');expect(await readFile(join(root,'runs',id,'site','index.html'),'utf8')).toBe((artifact.payload as {html:string}).html);
    expect(log.at(-1)?.type).toBe('run.completed');
  });
  it('serializes simultaneous create requests',async()=>{
    const manager=make();const results=await Promise.allSettled([manager.create('The first business idea'),manager.create('The second business idea')]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
  });
  it('accepts a Mayor revision on resubmission without another review or duplicate handoff',async()=>{
    const m=mayor();m.review=vi.fn(async({task}:{task:PlanTask})=>({verdict:task.owner==='maker'?'revise' as const:'accept' as const,note:'Use a warmer headline.',usage:zero}));
    const worker=vi.fn(async(input:WorkerInput,onEvent:(event:WorkerEvent)=>void)=>{onEvent({kind:'started'});return success(input);});
    const manager=make({mayor:m,getWorker:()=>({run:worker})});const id=await proposed(manager);await manager.approve(id,plan);await completed(manager,id);
    expect(vi.mocked(m.review).mock.calls.filter(([input])=>input.task.owner==='maker')).toHaveLength(1);
    expect(worker.mock.calls.filter(([input])=>input.task.owner==='maker')).toHaveLength(2);
    const log=await events(manager,id);expect(log.filter(event=>event.type==='handoff'&&event.data.to==='maker')).toHaveLength(1);expect(checkInvariants(log)).toEqual([]);
  });
  it('holds finished work while paused, without timing out completed calls or dispatching dependents',async()=>{
    const gate=deferred();const calls:string[]=[];
    const worker:Worker={run:async(input,onEvent)=>{calls.push(input.task.owner);onEvent({kind:'started'});if(input.task.owner==='scout')await gate.promise;return success(input);}};
    const manager=make({getWorker:()=>worker,taskTimeoutMs:100});const id=await proposed(manager);await manager.approve(id,plan);
    await until(()=>manager.get(id),state=>state.tasks.t1.status==='working');await manager.pause(id);gate.resolve();await sleep(150);
    expect((await manager.get(id)).artifacts).toEqual({});expect(calls).toEqual(['scout']);await manager.resume(id);await completed(manager,id);expect(calls).toHaveLength(3);expect(checkInvariants(await events(manager,id))).toEqual([]);
  });
  it('times out an uncooperative worker, retries once, covers, and ignores late callbacks',async()=>{
    const late:((event:WorkerEvent)=>void)[]=[];const pending:ReturnType<typeof deferred<WorkerResult>>[]=[];const m=mayor();
    const manager=make({mayor:m,taskTimeoutMs:15,getWorker:agent=>({run:async(input,onEvent)=>{if(agent!=='scout'){onEvent({kind:'started'});return success(input);}late.push(onEvent);const result=deferred<WorkerResult>();pending.push(result);return result.promise;}})});
    const id=await proposed(manager);await manager.approve(id,plan);await until(async()=>late.length,count=>count===2);late[0]({kind:'progress',note:'Old attempt callback must be ignored.'});await completed(manager,id);
    expect(late).toHaveLength(2);expect(m.cover).toHaveBeenCalledTimes(1);const before=(await manager.get(id)).lastSeq;
    for(const callback of late)callback({kind:'progress',note:'Late callback must be ignored.'});for(const result of pending)result.resolve({ok:false,error:{code:'upstream',message:'late'},retryable:false});await sleep(25);
    expect((await manager.get(id)).lastSeq).toBe(before);const history=await events(manager,id);expect(history.some(event=>event.type==='agent.progress'&&event.data.note.includes('Old attempt'))).toBe(false);expect(checkInvariants(history)).toEqual([]);
  });
  it('queues founder redirect notes for a fresh pass, preserving the completed old pass spend',async()=>{
    const gate=deferred();const makerNotes:string[][]=[];
    const manager=make({getWorker:()=>({run:async(input,onEvent)=>{onEvent({kind:'started'});if(input.task.owner==='maker'){makerNotes.push([...input.founderNotes]);if(makerNotes.length===1)await gate.promise;return {...success(input),credits:1};}return success(input);}})});
    const id=await proposed(manager);await manager.approve(id,plan);await until(()=>manager.get(id),state=>state.tasks.t2.status==='working');
    await manager.redirect(id,'maker','Use student group pricing.');gate.resolve();const state=await completed(manager,id);
    expect(makerNotes).toEqual([[],['Use student group pricing.']]);expect(state.payroll.byAgent.maker.credits).toBe(2);expect(state.tasks.t2.revised).toBe(true);expect(checkInvariants(await events(manager,id))).toEqual([]);
  });
  it('honors a founder redirect received during Mayor cover instead of publishing stale cover output',async()=>{
    const gate=deferred();const m=mayor();let scoutCalls=0;
    m.cover=vi.fn(async()=>{await gate.promise;return {payload:payload('research'),usage:zero};});
    const worker:Worker={run:async(input,onEvent)=>{onEvent({kind:'started'});if(input.task.owner==='scout'&&++scoutCalls===1)return {ok:false,error:{code:'upstream',message:'failed'},retryable:false};return success(input);}};
    const manager=make({mayor:m,getWorker:()=>worker});const id=await proposed(manager);await manager.approve(id,plan);
    await until(()=>manager.get(id),state=>state.tasks.t1.status==='covered');
    await manager.redirect(id,'scout','Focus on dorm lobbies.');gate.resolve();await completed(manager,id);
    expect(scoutCalls).toBe(2);const history=await events(manager,id);
    expect(history.filter(e=>e.type==='artifact.created'&&e.data.artifact.via==='mayor-cover')).toHaveLength(0);
    expect(checkInvariants(history)).toEqual([]);
  });
  it('asks at most two sequential questions and incorporates answers into a new plan',async()=>{
    const m=mayor();let calls=0;m.plan=vi.fn(async()=>({plan:{...structuredClone(plan),questions:calls++===0?['Which neighborhood?','What budget?']:[]},source:'model' as const,usage:zero}));
    const manager=make({mayor:m});const id=await manager.create('A neighborhood boba business');let state=await until(()=>manager.get(id),value=>value.status==='awaiting_founder');
    await manager.answer(id,state.questions[0].qid,'Westwood');state=await manager.get(id);expect(state.status).toBe('awaiting_founder');await manager.answer(id,state.questions[1].qid,'');
    state=await until(()=>manager.get(id),value=>value.status==='awaiting_approval');expect(state.questions.every(question=>question.answered)).toBe(true);expect(m.plan).toHaveBeenLastCalledWith({idea:'A neighborhood boba business',answers:[{q:'Which neighborhood?',a:'Westwood'},{q:'What budget?',a:''}]});
  });
  it('recovers an interrupted run as failed without starting workers',async()=>{
    const first=make();const id=await proposed(first);await first.dispose();
    const worker=vi.fn();const recovered=make({getWorker:()=>({run:worker})});const state=await recovered.get(id);expect(state.status).toBe('failed');expect((await events(recovered,id)).at(-1)).toMatchObject({type:'run.failed',data:{error:{code:'server_restart'}}});expect(worker).not.toHaveBeenCalled();
  });
});
