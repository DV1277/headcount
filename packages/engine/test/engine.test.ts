import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ArtifactSchema, EventEnvelopeSchema, type EventEnvelope } from '@hc/contracts';
import { checkInvariants, deriveCues, initialState, reduce, statusLine } from '../src/index.js';

const fixture = (name: string) => readFileSync(new URL(`../../../fixtures/runs/${name}.jsonl`, import.meta.url), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as EventEnvelope);
const replay = (events: EventEnvelope[]) => events.reduce((state, event) => reduce(state, event), initialState());

describe('event-sourced engine', () => {
  it('replays fixtures deterministically and satisfies log invariants', () => {
    for (const name of ['golden-boba', 'failure-retry', 'redirect']) {
      const events = fixture(name);
      expect(checkInvariants(events), name).toEqual([]);
      expect(replay(events)).toEqual(replay(events));
      expect(replay(events).lastSeq).toBe(events.length);
    }
  });

  it('validates every fixture envelope and complete artifact payload', () => {
    const seen = new Set<string>();
    for (const name of ['golden-boba', 'failure-retry', 'redirect']) {
      const events = fixture(name);
      for (const event of events) {
        expect(EventEnvelopeSchema.safeParse(event).success, `${name} seq ${event.seq}`).toBe(true);
        seen.add(event.type);
      }
      const artifactMap = JSON.parse(readFileSync(new URL(`../../../fixtures/runs/${name}.artifacts.json`, import.meta.url), 'utf8')) as Record<string, unknown>;
      for (const [id, artifact] of Object.entries(artifactMap)) {
        expect(ArtifactSchema.safeParse(artifact).success, `${name} artifact ${id}`).toBe(true);
      }
    }
    expect([...seen].sort()).toEqual(['agent.progress', 'agent.say', 'agent.tool', 'artifact.created', 'brief.ready', 'founder.answer', 'founder.question', 'founder.redirect', 'handoff', 'mayor.thinking', 'payroll.tick', 'plan.approved', 'plan.proposed', 'review.verdict', 'run.completed', 'run.created', 'run.failed', 'run.finishing', 'run.paused', 'run.resumed', 'task.completed', 'task.dispatched', 'task.failed', 'task.revising', 'task.skipped', 'task.started', 'task.submitted'].sort());
  });

  it('keeps the reducer pure and ignores stale duplicate envelopes', () => {
    const events = fixture('golden-boba');
    const state = initialState();
    const event = events[0]!;
    const before = structuredClone(state);
    const once = reduce(state, event);
    const twice = reduce(once, event);
    expect(state).toEqual(before);
    expect(twice).toEqual(once);
  });

  it('marks replaced artifacts stale and accumulates payroll exactly', () => {
    const state = replay(fixture('golden-boba'));
    expect(state.artifacts.a_site?.stale).toBe(true);
    expect(state.artifacts.a_site_v2?.stale).toBeUndefined();
    expect(state.payroll.credits).toBe(9);
    expect(state.payroll.usd).toBeCloseTo(0.12);
    expect(state.payroll.byAgent.scout.credits).toBe(4);
    expect(state.payroll.byAgent.maker.credits).toBe(3);
    expect(state.payroll.byAgent.herald.credits).toBe(2);
    expect(state.progress).toBe(1);
  });

  it('preserves pause, skipped task, and the last 20 log entries', () => {
    const state = replay(fixture('redirect'));
    expect(state.status).toBe('completed');
    expect(state.tasks.t3?.status).toBe('skipped');
    const events = fixture('golden-boba');
    let withLog = initialState();
    for (const e of events.slice(0, 6)) withLog = reduce(withLog, e);
    const baseSeq = withLog.lastSeq;
    for (let i = 1; i <= 25; i++) withLog = reduce(withLog, { ...events[5]!, seq: baseSeq + i, t: 9000 + i, type: 'agent.progress', data: { agent: 'founder', note: `fixture log ${i}` } } as EventEnvelope);
    expect(withLog.agents.founder.log).toHaveLength(20);
    expect(withLog.agents.founder.log.at(-1)?.text).toBe('fixture log 25');
    expect(statusLine(state)).toContain('Run complete');
  });

  it('maps semantic events to deterministic cues', () => {
    const events = fixture('golden-boba');
    const initial = initialState();
    expect(deriveCues(initial, events[0]!)).toEqual([{ kind: 'bubble', agent: 'mayor', text: 'New business! Let me think…', priority: 2 }]);
    const handoff = events.find((e) => e.type === 'handoff')!;
    expect(deriveCues(initial, handoff).map((c) => c.kind)).toEqual(['exit', 'walk', 'bubble', 'receive', 'walk', 'enter']);
    const thinking = events.find((e) => e.type === 'mayor.thinking' && e.data.phase === 'review')!;
    expect(deriveCues(initial, thinking)).toEqual([{ kind: 'glow', building: 'hall', on: true, color: '#F2B544' }]);
    const failureEvents = fixture('failure-retry');
    const failureIndex = failureEvents.findIndex((e) => e.type === 'task.failed');
    const failedState = replay(failureEvents.slice(0, failureIndex + 1));
    const retryDispatch = failureEvents[failureIndex + 1]!;
    expect(deriveCues(failedState, retryDispatch)[0]).toEqual({ kind: 'alert', building: 'library', on: false, tone: 'error' });
    const pause = fixture('redirect').find((e) => e.type === 'run.paused')!;
    expect(deriveCues(initial, pause)).toEqual([{ kind: 'freeze', on: true }]);
  });

  it('restores the active task state after a pause and releases dependencies on skipped tasks', () => {
    const events = fixture('redirect');
    let state = replay(events.slice(0, 8)); // t1 is working
    const pause = events.find((event) => event.type === 'run.paused')!;
    const resume = events.find((event) => event.type === 'run.resumed')!;
    state = reduce(state, { ...pause, seq: 9, t: 9 });
    expect(state.agents.scout.status).toBe('paused');
    state = reduce(state, { ...resume, seq: 10, t: 10 });
    expect(state.agents.scout.status).toBe('working');
    expect(state.agents.maker.status).toBe('waiting');
    expect(state.tasks.t1?.status).toBe('working');

    let skipped = replay(events.slice(0, 6));
    const skippedTask = fixture('failure-retry').find((event) => event.type === 'task.skipped')!;
    skipped = reduce(skipped, { ...skippedTask, seq: 7, t: 7, data: { taskId: 't1', reason: 'optional source omitted' } });
    expect(skipped.tasks.t1?.status).toBe('skipped');
    expect(skipped.tasks.t2?.status).toBe('ready');
  });

  it('reopens accepted tasks in finishing checks and deduplicates handoffs by dependency task', () => {
    const events = fixture('redirect');
    const acceptedAt = events.findIndex((event) => event.type === 'task.completed' && event.data.taskId === 't1');
    const acceptedPrefix = events.slice(0, acceptedAt + 1);
    const redirect = events.find((event) => event.type === 'founder.redirect')!;
    const finishing = events.find((event) => event.type === 'run.finishing')!;
    const reopenedLog = [...acceptedPrefix, { ...redirect, seq: acceptedPrefix.length + 1, t: 90000, data: { agent: 'scout' as const, taskId: 't1', note: 'Please revise this accepted task.' } }, { ...finishing, seq: acceptedPrefix.length + 2, t: 91000 }];
    expect(checkInvariants(reopenedLog).some((message) => message.includes('task t1 is not terminal'))).toBe(true);

    const golden = fixture('golden-boba');
    const firstHandoffIndex = golden.findIndex((event) => event.type === 'handoff' && event.data.taskId === 't3' && event.data.from === 'scout');
    const handoff = golden[firstHandoffIndex]!;
    if (handoff.type !== 'handoff') throw new Error('Expected Scout handoff fixture.');
    const artifactEvent = golden.find((event) => event.type === 'artifact.created' && event.data.artifact.id === 'a_research');
    if (artifactEvent?.type !== 'artifact.created') throw new Error('Expected Scout research artifact fixture.');
    const prefix = golden.slice(0, firstHandoffIndex);
    const seq = prefix.length;
    const secondArtifact = { ...artifactEvent, seq: seq + 1, t: 200000, data: { artifact: { ...artifactEvent.data.artifact, id: 'a_research_v2' } } };
    const secondCompletion = { type: 'task.completed' as const, data: { taskId: 't1', artifactId: 'a_research_v2', revised: true }, v: 1 as const, runId: handoff.runId, seq: seq + 2, t: 201000, at: handoff.at };
    const firstDependencyHandoff = { ...handoff, seq: seq + 3, t: 202000 };
    const alternateArtifactHandoff = { ...handoff, seq: seq + 4, t: 203000, data: { ...handoff.data, artifactId: 'a_research_v2' } };
    expect(checkInvariants([...prefix, secondArtifact, secondCompletion, firstDependencyHandoff, alternateArtifactHandoff]).some((message) => message.includes('duplicate handoff'))).toBe(true);
  });

  it('checks run identity and nondecreasing event times', () => {
    const events = fixture('golden-boba');
    const wrongRunId = events.map((event) => ({ ...event }));
    wrongRunId[1] = { ...wrongRunId[1]!, runId: 'run_other' };
    expect(checkInvariants(wrongRunId).some((message) => message.includes('runId run_other'))).toBe(true);

    const backwardTime = events.map((event) => ({ ...event }));
    backwardTime[1] = { ...backwardTime[1]!, t: -1, at: 'invalid' };
    const errors = checkInvariants(backwardTime);
    expect(errors.some((message) => message.includes('finite nonnegative timestamp'))).toBe(true);
    expect(errors.some((message) => message.includes('valid timestamp'))).toBe(true);
  });
});

describe('reviewed canonical regressions',()=>{
  it('requires each dependency handoff before first dispatch and rejects wrong recipients',()=>{
    const events=fixture('golden-boba');
    const missing=events.filter(e=>!(e.type==='handoff'&&e.data.taskId==='t2')).map((e,i)=>({...e,seq:i+1}));
    expect(checkInvariants(missing).some(error=>error.includes('missing dependency handoff t2:t1'))).toBe(true);
    const wrong=events.map(e=>e.type==='handoff'&&e.data.taskId==='t2'?{...e,data:{...e.data,to:'herald' as const}}:e);
    expect(checkInvariants(wrong).some(error=>error.includes('dependency owners'))).toBe(true);
  });
  it('accepts terminal failure while rejecting forged completion artifacts',()=>{
    const events=fixture('golden-boba'),prefix=events.slice(0,6);
    const failed=prefix[0]!;
    const terminal:EventEnvelope[]=[...prefix,...['t1','t2','t3'].map((taskId,i)=>({...failed,seq:7+i,t:40000+i,type:'task.failed' as const,data:{taskId,error:{code:'upstream' as const,message:'Abandoned task'},willRetry:false,next:'skip' as const}})),{...failed,seq:10,t:50000,type:'run.finishing',data:{}}];
    expect(checkInvariants(terminal)).toEqual([]);
    const forged=events.map(e=>e.type==='task.completed'&&e.data.taskId==='t1'?{...e,data:{...e.data,artifactId:'a_missing'}}:e);
    expect(checkInvariants(forged).some(error=>error.includes('completion artifact'))).toBe(true);
  });
  it('uses only the approved task definitions when approval changes the plan',()=>{
    const events=fixture('golden-boba'),proposed=events.find(e=>e.type==='plan.proposed')!,approved=events.find(e=>e.type==='plan.approved')!;
    if(approved.type!=='plan.approved')throw new Error('Missing approval');
    const plan=structuredClone(approved.data.plan);plan.tasks[2]={...plan.tasks[2]!,id:'t4'};
    const state=reduce(reduce(replay(events.slice(0,4)),proposed),{...approved,data:{...approved.data,plan}});
    expect(Object.keys(state.tasks)).toEqual(['t1','t2','t4']);
  });
  it('keeps canonical started/review events and cover metadata in every fixture',()=>{
    for(const name of ['golden-boba','failure-retry','redirect']){
      const events=fixture(name),started=new Set<string>(),reviewing=new Set<string>();
      const artifacts=JSON.parse(readFileSync(new URL(`../../../fixtures/runs/${name}.artifacts.json`,import.meta.url),'utf8'));
      const via=new Map<string,string>();
      for(const event of events){
        if(event.type==='task.dispatched'){via.set(event.data.taskId,event.data.via);started.delete(event.data.taskId);}
        if(event.type==='task.started')started.add(event.data.taskId);
        if(event.type==='mayor.thinking'&&event.data.phase==='review'&&event.data.taskId)reviewing.add(event.data.taskId);
        if(event.type==='review.verdict')expect(reviewing.delete(event.data.taskId),`${name} review ${event.seq}`).toBe(true);
        if(event.type==='artifact.created'&&event.data.artifact.taskId){
          const meta=event.data.artifact;
          expect(started.has(meta.taskId!)||via.get(meta.taskId!)==='mayor-cover',`${name} artifact ${meta.id} needs a started attempt`).toBe(true);
          expect(meta.via,`${name} artifact ${meta.id}`).toBe(via.get(meta.taskId!));
          const {payload:_payload,...stored}=artifacts[meta.id];expect(stored).toEqual(meta);
        }
      }
    }
  });
});
