import {nanoid} from 'nanoid';
import {ArtifactSchema,ArtifactSchemas,BriefPayloadSchema,PlanSchema,type AgentId,type Artifact,type ArtifactMeta,type DeptId,type EventEnvelope,type Plan,type PlanTask,type RunListItem,type TownEvent} from '@hc/contracts';
import {initialState,reduce,type TownState} from '@hc/engine';
import {createMayor,type Mayor,type Usage} from '../mayor';
import {getWorker,type Worker,type WorkerEvent,type WorkerResult} from '../workers';
import {publishSiteInRoot,sanitizeSiteHtml,siteUrlFor} from '../sites';
import {payrollTick} from '../payroll';
import {openEventLog,type EventLogStream} from './eventLog';
import {artifactPath,isSafeRunId,listRunIds,readJsonIfExists,runsRoot,writeJsonAtomic} from './fs';
import {RunError} from './errors';

export type RunManagerOptions={rootDir?:string;mayor?:Mayor;getWorker?:(agent:DeptId)=>Worker;taskTimeoutMs?:number;maxCreaoRuns?:number;maxStepTokens?:number};
type Meta={attempt:number;failures:number;reviewed:boolean;notes:string[];redo:boolean;handoffs:Set<string>};
type Job={accepting:boolean;started:boolean;generation:number;events:Promise<void>;controller:AbortController|null};
type Run={id:string;log:EventLogStream;state:TownState;queue:Promise<unknown>;artifacts:Map<string,Artifact>;meta:Map<string,Meta>;jobs:Map<string,Job>;waiters:Set<()=>void>;answers:{q:string;a:string}[];questions:string[];issued:number;planning:boolean;finishing:boolean;stopping:boolean;tokens:number;calls:number;flavors:number;publicUrl:string};
class BudgetError extends Error {}
const terminal=(run:Run)=>run.stopping||['completed','failed'].includes(run.state.status);
const numberEnv=(key:string,fallback:number)=>{const n=Number(process.env[key]);return Number.isFinite(n)&&n>0?n:fallback;};
const clean=(text:string,max:number)=>text.trim().slice(0,max)||'Update received.';
const delayError=(message:string)=>new Error(message);

/** Append-only execution. The per-run queue holds only state/IO transactions, never an upstream call. */
export class RunManager {
  private readonly runs=new Map<string,Run>();
  private readonly initialized:Promise<void>;
  private creates:Promise<unknown>=Promise.resolve();
  private readonly shutdown=new AbortController();
  private disposed=false;
  private monitor:ReturnType<typeof setInterval>;
  private mayorInstance:Mayor|undefined;
  constructor(readonly options:RunManagerOptions={}) {
    this.initialized=this.recover();
    // Keep initialization errors observed even when health is the only request.
    void this.initialized.catch(()=>{});
    this.monitor=setInterval(()=>{if(process.env.HC_KILL==='1')for(const run of this.runs.values())if(!terminal(run))void this.failRun(run,'cancelled','Stopped by the operator kill switch.');},250);
    this.monitor.unref();
  }
  private mayor(){return this.mayorInstance??=this.options.mayor??createMayor();}
  private transact<T>(run:Run,fn:()=>Promise<T>):Promise<T>{const next=run.queue.then(fn);run.queue=next.catch(()=>{});return next;}
  private emit(run:Run,event:TownEvent){return run.log.append(event);}
  private build(id:string,log:EventLogStream):Run {
    const events=log.read();
    const run:Run={id,log,state:events.reduce(reduce,initialState()),queue:Promise.resolve(),artifacts:new Map(),meta:new Map(),jobs:new Map(),waiters:new Set(),answers:[],questions:[],issued:0,planning:false,finishing:false,stopping:false,tokens:events.reduce((n,e)=>n+(e.type==='payroll.tick'?(e.data.tokensIn??0)+(e.data.tokensOut??0):0),0),calls:0,flavors:0,publicUrl:siteUrlFor(id)};
    // Registered before API listeners: every durable event updates the snapshot before it is streamed.
    log.subscribe(event=>{run.state=reduce(run.state,event);});
    return run;
  }
  private async recover(){
    for(const id of await listRunIds(this.options.rootDir)){
      const log=await openEventLog(id,{rootDir:this.options.rootDir});
      if(!log.size())continue;
      const run=this.build(id,log);this.runs.set(id,run);
      if(!terminal(run))await this.emit(run,{type:'run.failed',data:{error:{code:'server_restart',message:'The server restarted before this run finished.'}}});
    }
  }
  private async require(id:string){await this.initialized;if(!isSafeRunId(id)||!this.runs.has(id))throw new RunError(404,'run_not_found','Run not found.');return this.runs.get(id)!;}
  async create(idea:string):Promise<string>{
    const next=this.creates.then(async()=>{
      await this.initialized;
      if(this.disposed)throw new RunError(503,'server_stopping','Server is stopping.');
      if(process.env.HC_KILL==='1')throw new RunError(409,'kill_switch','The operator kill switch is enabled.');
      if(process.env.HC_MODE==='demo')throw new RunError(503,'demo_pending','Use a bundled browser recording for offline replay.');
      const text=idea.trim();if(text.length<8||text.length>280)throw new RunError(422,'invalid_idea','Describe a business in 8–280 characters.');
      if([...this.runs.values()].some(run=>!terminal(run)))throw new RunError(409,'run_active','This town already has an active run.');
      const id=`run_${nanoid(10)}`;const log=await openEventLog(id,{rootDir:this.options.rootDir});const run=this.build(id,log);this.runs.set(id,run);
      await this.emit(run,{type:'run.created',data:{idea:text,mode:process.env.HC_MAYOR==='mock'&&process.env.HC_WORKERS==='mock'?'mock':'live'}});
      this.beginPlan(run);return id;
    });
    this.creates=next.catch(()=>{});return next;
  }
  async list():Promise<RunListItem[]>{await this.initialized;return [...this.runs.values()].map(run=>({runId:run.id,title:run.state.title,status:run.state.status,createdAt:run.log.read()[0].at})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  async get(id:string):Promise<TownState>{return structuredClone((await this.require(id)).state);}
  async subscribe(id:string,listener:(event:EventEnvelope)=>void,from=0){const run=await this.require(id);return run.log.subscribe(listener,from);}
  async getArtifact(id:string,aid:string):Promise<Artifact>{
    const run=await this.require(id);if(!isSafeRunId(aid)||!run.state.artifacts[aid])throw new RunError(404,'artifact_not_found','Deliverable not found.');
    let artifact=run.artifacts.get(aid);if(!artifact){const value=await readJsonIfExists(artifactPath(id,aid,this.options.rootDir));if(!value)throw new RunError(404,'artifact_not_found','Deliverable payload is unavailable.');artifact=ArtifactSchema.parse(value);if(artifact.id!==aid||artifact.runId!==id)throw new Error('Stored artifact identity mismatch.');run.artifacts.set(aid,artifact);}
    return structuredClone(artifact);
  }
  async approve(id:string,input:Plan){
    const run=await this.require(id);const parsed=PlanSchema.safeParse(input);if(!parsed.success)throw new RunError(422,'invalid_plan','The edited plan is invalid.');
    await this.transact(run,async()=>{
      if(run.state.status!=='awaiting_approval'||terminal(run))throw new RunError(409,'not_awaiting_approval','This run is not waiting for plan approval.');
      const plan=parsed.data;const edited=JSON.stringify(plan)!==JSON.stringify(run.state.plan);
      for(const task of plan.tasks)run.meta.set(task.id,{attempt:0,failures:0,reviewed:false,notes:[],redo:false,handoffs:new Set()});
      await this.emit(run,{type:'plan.approved',data:{plan,edited}});
      for(const task of plan.tasks)if(!task.enabled)await this.emit(run,{type:'task.skipped',data:{taskId:task.id,reason:'Disabled in the approved plan.'}});
    });
    this.spawnFlavor(run,'approved','The founder approved the plan.');void this.pump(run);
  }
  async answer(id:string,qid:string,text:string){
    const run=await this.require(id);let again=false;
    await this.transact(run,async()=>{
      const question=run.state.questions.find(q=>q.qid===qid&&!q.answered);
      if(terminal(run)||run.state.status!=='awaiting_founder'||!question)throw new RunError(409,'question_unavailable','This question is no longer waiting for an answer.');
      if(text.length>1000)throw new RunError(422,'invalid_answer','Answer exceeds 1000 characters.');
      await this.emit(run,{type:'founder.answer',data:{qid,text:text.trim()||'Skipped.'}});run.answers.push({q:question.text,a:text.trim()});
      if(run.questions.length)await this.askNext(run);else again=true;
    });
    if(again)this.beginPlan(run);
  }
  async replan(id:string){const run=await this.require(id);await this.transact(run,async()=>{if(run.state.status!=='awaiting_approval'||run.planning||terminal(run))throw new RunError(409,'cannot_replan','Re-plan is available while waiting for approval.');await this.emit(run,{type:'mayor.thinking',data:{phase:'plan'}});});this.beginPlan(run,true);}
  async pause(id:string){const run=await this.require(id);await this.transact(run,async()=>{if(run.state.status!=='running'||terminal(run))throw new RunError(409,'cannot_pause','Only a running company can be paused.');await this.emit(run,{type:'run.paused',data:{}});});}
  async resume(id:string){const run=await this.require(id);await this.transact(run,async()=>{if(run.state.status!=='paused'||terminal(run))throw new RunError(409,'cannot_resume','The run is not paused.');await this.emit(run,{type:'run.resumed',data:{}});this.release(run);});void this.pump(run);}
  async redirect(id:string,agent:DeptId,note:string){
    const run=await this.require(id);const text=note.trim();if(!text||text.length>600)throw new RunError(422,'invalid_note','A redirect needs 1–600 characters.');
    await this.transact(run,async()=>{
      if(!['running','paused'].includes(run.state.status)||terminal(run))throw new RunError(409,'cannot_redirect','Redirect needs a running or paused company.');
      const task=Object.values(run.state.tasks).find(task=>task.def.owner===agent&&task.def.enabled&&!['accepted','skipped'].includes(task.status));
      if(!task)throw new RunError(409,'no_remaining_task','This agent has no remaining task to redirect.');
      const meta=run.meta.get(task.def.id)!;meta.notes.push(text);meta.notes=meta.notes.slice(-8);meta.redo=run.jobs.has(task.def.id);
      await this.emit(run,{type:'founder.redirect',data:{agent,taskId:task.def.id,note:text}});
      await this.emit(run,{type:'task.revising',data:{taskId:task.def.id,note:text,by:'founder'}});
    });void this.pump(run);
  }
  private release(run:Run){for(const resolve of run.waiters)resolve();run.waiters.clear();}
  private async unpaused(run:Run){while(run.state.status==='paused'&&!terminal(run)&&!this.disposed)await new Promise<void>(resolve=>run.waiters.add(resolve));}
  private current(run:Run,task:PlanTask,job:Job){return !this.disposed&&!terminal(run)&&run.jobs.get(task.id)===job;}
  private async active<T>(run:Run,task:PlanTask,job:Job,fn:()=>Promise<T>):Promise<T|undefined>{
    for(;;){await this.unpaused(run);const result=await this.transact(run,async()=>{if(!this.current(run,task,job))return {kind:'end'} as const;if(run.state.status==='paused')return {kind:'wait'} as const;return {kind:'value',value:await fn()} as const;});if(result.kind==='end')return undefined;if(result.kind==='value')return result.value;}
  }
  private async bounded<T>(promise:Promise<T>,ms:number,signal=this.shutdown.signal):Promise<T>{
    let timer:ReturnType<typeof setTimeout>;let abort:()=>void=()=>{};
    const limit=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(delayError('Mayor request timed out.')),ms);abort=()=>reject(delayError('Server is stopping.'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
    try{return await Promise.race([promise,limit]);}finally{clearTimeout(timer!);signal.removeEventListener('abort',abort);}
  }
  private checkBudget(run:Run){if(run.tokens>=(this.options.maxStepTokens??numberEnv('HC_MAX_STEP_TOKENS',200000)))throw new BudgetError('The StepFun token budget was reached.');}
  private async billMayor(run:Run,usage:Usage|undefined){
    if(!usage)return;
    await this.transact(run,async()=>{if(terminal(run)||this.disposed)return;const tokensIn=Math.max(0,Math.floor(usage.tokensIn||0)),tokensOut=Math.max(0,Math.floor(usage.tokensOut||0));run.tokens+=tokensIn+tokensOut;if(tokensIn||tokensOut)await this.emit(run,payrollTick('mayor',{tokensIn,tokensOut,cachedIn:usage.cachedIn}));if(run.tokens>(this.options.maxStepTokens??numberEnv('HC_MAX_STEP_TOKENS',200000)))throw new BudgetError('The StepFun token budget was exceeded.');});
  }
  private beginPlan(run:Run,thinking=false){if(run.planning||terminal(run)||this.disposed)return;run.planning=true;void (async()=>{
    try{
      if(!thinking)await this.transact(run,async()=>{await this.emit(run,{type:'mayor.thinking',data:{phase:'plan'}});});
      this.checkBudget(run);const reply=await this.bounded(this.mayor().plan({idea:run.state.idea,answers:run.answers}),60000);await this.billMayor(run,reply.usage);
      const plan=PlanSchema.parse(reply.plan);
      await this.transact(run,async()=>{if(terminal(run)||this.disposed)return;const questions=plan.questions.slice(0,Math.max(0,2-run.issued));if(questions.length){run.questions=questions;await this.askNext(run);}else{await this.emit(run,{type:'plan.proposed',data:{plan,source:reply.source}});}});
      if(run.state.status==='awaiting_approval')this.spawnFlavor(run,'planned',plan.title);
    }catch(error){await this.failRun(run,error instanceof BudgetError?'budget':'upstream','The Mayor could not produce a valid plan.');}finally{run.planning=false;}
  })();}
  private async askNext(run:Run){const text=run.questions.shift()!;run.issued++;await this.emit(run,{type:'founder.question',data:{qid:`q_${nanoid(8)}`,text}});}
  private async pump(run:Run){
    try{await this.transact(run,async()=>{
      if(this.disposed||terminal(run)||run.state.status!=='running'||run.finishing)return;
      this.checkBudget(run);
      const ready=Object.values(run.state.tasks).filter(task=>task.def.enabled&&['ready','revising'].includes(task.status)&&!run.jobs.has(task.def.id)&&task.def.dependsOn.every(id=>['accepted','skipped'].includes(run.state.tasks[id]?.status)));
      for(const task of ready){
        const job:Job={accepting:false,started:false,generation:0,events:Promise.resolve(),controller:null};run.jobs.set(task.def.id,job);
        const meta=run.meta.get(task.def.id)!;
        for(const depId of task.def.dependsOn){const dep=run.state.tasks[depId];if(dep.status!=='accepted'||!dep.artifactId||meta.handoffs.has(depId))continue;meta.handoffs.add(depId);await this.emit(run,{type:'handoff',data:{from:dep.def.owner,to:task.def.owner,taskId:task.def.id,artifactId:dep.artifactId,summary:clean(`${dep.def.title} ready`,60)}});}
        await this.dispatch(run,task.def,meta);
        void this.execute(run,task.def,job).catch(error=>this.failRun(run,error instanceof BudgetError?'budget':'unknown','Execution stopped before the run could finish.')).finally(()=>{if(run.jobs.get(task.def.id)===job)run.jobs.delete(task.def.id);void this.pump(run);});
      }
      if(!run.jobs.size&&!run.flavors&&Object.values(run.state.tasks).every(task=>['accepted','skipped','failed'].includes(task.status))){run.finishing=true;await this.emit(run,{type:'run.finishing',data:{}});void this.finish(run).catch(error=>this.failRun(run,error instanceof BudgetError?'budget':'upstream','The founder brief could not be completed.'));}
    });}catch(error){await this.failRun(run,error instanceof BudgetError?'budget':'unknown','The scheduler could not continue.');}
  }
  private async dispatch(run:Run,task:PlanTask,meta:Meta,cover=false){meta.attempt++;await this.emit(run,{type:'task.dispatched',data:{taskId:task.id,agent:task.owner,attempt:meta.attempt,via:cover?'mayor-cover':process.env.HC_WORKERS==='mock'?'mock':process.env.CREAO_API_MODE==='account'?'creao-realtime':'creao-async'}});}
  private async inputs(run:Run,task:PlanTask){const artifacts:Artifact[]=[];for(const id of task.dependsOn){const dep=run.state.tasks[id];if(dep.status==='accepted'&&dep.artifactId)artifacts.push(await this.getArtifact(run.id,dep.artifactId));}return artifacts;}
  private callback(run:Run,task:PlanTask,job:Job,event:WorkerEvent){
    if(!job.accepting||!this.current(run,task,job)||run.meta.get(task.id)?.redo)return;
    if(event.kind==='started'){if(job.started)return;job.started=true;}
    else if(!job.started){this.callback(run,task,job,{kind:'started'});}
    job.events=job.events.then(async()=>{await this.active(run,task,job,async()=>{if(event.kind==='started')await this.emit(run,{type:'task.started',data:{taskId:task.id,agent:task.owner,...(event.externalRunId?{externalRunId:event.externalRunId}:{})}});else if(event.kind==='tool')await this.emit(run,{type:'agent.tool',data:{taskId:task.id,agent:task.owner,tool:clean(event.tool,80),label:clean(event.label,80)}});else await this.emit(run,{type:'agent.progress',data:{taskId:task.id,agent:task.owner,note:clean(event.note,80)}});});});
    void job.events.catch(()=>this.failRun(run,'unknown','The worker event stream could not be recorded.'));
  }
  private async invoke(run:Run,task:PlanTask,job:Job):Promise<WorkerResult>{
    if(run.calls>=(this.options.maxCreaoRuns??numberEnv('HC_MAX_CREAO_RUNS',8)))return {ok:false,error:{code:'budget',message:'The CREAO run budget was reached.'},retryable:false};
    run.calls++;job.controller=new AbortController();job.accepting=true;job.started=false;job.events=Promise.resolve();
    const generation=++job.generation;
    const signal=job.controller.signal;let timer:ReturnType<typeof setTimeout>|undefined;let aborted:()=>void=()=>{};
    const abortPromise=new Promise<WorkerResult>(resolve=>{aborted=()=>resolve({ok:false,error:{code:signal.reason==='timeout'?'timeout':'cancelled',message:signal.reason==='timeout'?'The agent attempt timed out.':'The agent attempt was stopped.'},retryable:signal.reason==='timeout'});signal.addEventListener('abort',aborted,{once:true});timer=setTimeout(()=>job.controller?.abort('timeout'),this.options.taskTimeoutMs??numberEnv('HC_TASK_TIMEOUT_MS',360000));});
    try{
      const worker=this.options.getWorker?.(task.owner)??getWorker(task.owner);
      const input={runId:run.id,task,idea:run.state.idea,inputs:await this.inputs(run,task),founderNotes:[...run.meta.get(task.id)!.notes],siteUrl:run.publicUrl};
      return await Promise.race([worker.run(input,event=>{if(job.generation===generation)this.callback(run,task,job,event);},signal).catch(()=>({ok:false as const,error:{code:'upstream' as const,message:'CREAO could not finish this attempt.'},retryable:true})),abortPromise]);
    }catch{return {ok:false,error:{code:'upstream',message:'The worker could not start.'},retryable:false};}
    finally{clearTimeout(timer);signal.removeEventListener('abort',aborted);job.accepting=false;}
  }
  private async execute(run:Run,task:PlanTask,job:Job){
    const meta=run.meta.get(task.id)!;
    while(this.current(run,task,job)){
      const result=await this.invoke(run,task,job);
      await this.billMayor(run,(result as WorkerResult&{mayorUsage?:Usage}).mayorUsage);
      const credits=(result as WorkerResult&{credits?:number|null}).credits;
      if(typeof credits==='number')await this.transact(run,async()=>{if(!terminal(run))await this.emit(run,payrollTick(task.owner,{credits}));});
      await job.events;
      if(!this.current(run,task,job))return;
      const redo=await this.active(run,task,job,async()=>{if(!meta.redo)return false;meta.redo=false;await this.dispatch(run,task,meta);return true;});
      if(redo===undefined)return;if(redo)continue;
      if(!result.ok){
        meta.failures++;const retry=result.retryable&&meta.failures===1;
        await this.active(run,task,job,async()=>{await this.emit(run,{type:'task.failed',data:{taskId:task.id,error:result.error,willRetry:retry,next:retry?'retry':'mayor-cover'}});});
        if(!this.current(run,task,job))return;
        if(retry){await this.active(run,task,job,async()=>{await this.dispatch(run,task,meta);});continue;}
        if(await this.cover(run,task,job))continue;return;
      }
      if(!job.started)await this.active(run,task,job,async()=>{await this.emit(run,{type:'task.started',data:{taskId:task.id,agent:task.owner}});});
      const artifact=await this.active(run,task,job,async()=>{
        if(result.via==='creao-async'&&run.state.tasks[task.id].via==='creao-realtime')await this.emit(run,{type:'task.dispatched',data:{taskId:task.id,agent:task.owner,attempt:meta.attempt,via:'creao-async'}});
        const artifact=await this.persist(run,task,result.payload,result.via);
        await this.emit(run,{type:'task.submitted',data:{taskId:task.id,artifactId:artifact.id}});return artifact;
      });
      if(!artifact)return;
      if(!meta.reviewed){
        meta.reviewed=true;await this.active(run,task,job,async()=>{await this.emit(run,{type:'mayor.thinking',data:{phase:'review',taskId:task.id}});});
        this.checkBudget(run);const review=await this.bounded(this.mayor().review({idea:run.state.idea,task,artifact}),60000);await this.billMayor(run,review.usage);
        const again=await this.active(run,task,job,async()=>{
          if(meta.redo){meta.redo=false;await this.dispatch(run,task,meta);return true;}
          await this.emit(run,{type:'review.verdict',data:{taskId:task.id,artifactId:artifact.id,verdict:review.verdict,note:review.note.slice(0,140)}});
          if(review.verdict==='revise'){const note=clean(review.note,600);meta.notes.push(note);await this.emit(run,{type:'task.revising',data:{taskId:task.id,note,by:'mayor'}});await this.dispatch(run,task,meta);return true;}
          return false;
        });if(again===undefined)return;if(again)continue;
      }
      const done=await this.active(run,task,job,async()=>{if(meta.redo){meta.redo=false;await this.dispatch(run,task,meta);return false;}await this.emit(run,{type:'task.completed',data:{taskId:task.id,artifactId:artifact.id,revised:run.state.tasks[task.id].revised}});return true;});
      if(done){this.spawnFlavor(run,'accepted',task.title);return;}
    }
  }
  private async persist(run:Run,task:PlanTask|null,payload:unknown,via:ArtifactMeta['via']):Promise<Artifact>{
    const kind=task?.deliverable??'brief';let parsed=ArtifactSchemas[kind].parse(payload);
    let url:string|undefined;
    if(kind==='site'){
      const site=parsed as {headline:string;html:string};parsed={...site,html:sanitizeSiteHtml(site.html)};
      url=await publishSiteInRoot(run.id,parsed as {headline:string;html:string},runsRoot(this.options.rootDir));if(url!==run.publicUrl)throw new Error('Public site URL changed during the run.');
    }
    const meta:ArtifactMeta={id:`a_${nanoid(12)}`,runId:run.id,taskId:task?.id??null,agent:task?.owner??'mayor',kind,title:task?.title??'Founder brief',createdAt:new Date().toISOString(),...(via?{via}:{}),...(url?{url}:{})};
    const artifact=ArtifactSchema.parse({...meta,payload:parsed});await writeJsonAtomic(artifactPath(run.id,meta.id,this.options.rootDir),artifact);run.artifacts.set(meta.id,artifact);await this.emit(run,{type:'artifact.created',data:{artifact:meta}});return artifact;
  }
  private async cover(run:Run,task:PlanTask,job:Job){
    try{
      this.checkBudget(run);
      const dispatch=await this.active(run,task,job,async()=>{await this.dispatch(run,task,run.meta.get(task.id)!,true);return true;});if(!dispatch)return;
      const reply=await this.bounded(this.mayor().cover({idea:run.state.idea,task,inputs:await this.inputs(run,task)}),60000);await this.billMayor(run,reply.usage);
      return await this.active(run,task,job,async()=>{const meta=run.meta.get(task.id)!;if(meta.redo){meta.redo=false;await this.dispatch(run,task,meta);return true;}const artifact=await this.persist(run,task,reply.payload,'mayor-cover');await this.emit(run,{type:'task.submitted',data:{taskId:task.id,artifactId:artifact.id}});await this.emit(run,{type:'task.completed',data:{taskId:task.id,artifactId:artifact.id,revised:run.state.tasks[task.id].revised}});return false;});
    }catch(error){if(!this.current(run,task,job))return;await this.active(run,task,job,async()=>{await this.emit(run,{type:'task.failed',data:{taskId:task.id,error:{code:error instanceof BudgetError?'budget':'unparseable',message:'The Mayor could not cover this task.'},willRetry:false,next:'skip'}});await this.emit(run,{type:'task.skipped',data:{taskId:task.id,reason:'Neither the department nor the Mayor produced a valid deliverable.'}});});}
  }
  private spawnFlavor(run:Run,moment:'planned'|'approved'|'accepted',context:string){
    if(terminal(run)||this.disposed)return;run.flavors++;
    void this.flavor(run,moment,context).catch(error=>this.failRun(run,error instanceof BudgetError?'budget':'unknown','A Mayor update could not be recorded.')).finally(()=>{run.flavors--;void this.pump(run);});
  }
  private async flavor(run:Run,moment:'planned'|'approved'|'accepted'|'completed',context:string){
    let reply:{text:string;source:'model'|'canned';usage:Usage}={text:{planned:'The plan is ready for your approval.',approved:'The team is getting to work.',accepted:'That is one more piece ready.',completed:'Your company has its first launch kit.'}[moment],source:'canned',usage:{tokensIn:0,tokensOut:0}};
    if(run.tokens<(this.options.maxStepTokens??numberEnv('HC_MAX_STEP_TOKENS',200000)))try{reply=await this.bounded(this.mayor().say({moment,context}),30000);}catch{}
    await this.billMayor(run,reply.usage);await this.transact(run,async()=>{if(!terminal(run)&&!this.disposed)await this.emit(run,{type:'agent.say',data:{agent:'mayor',text:clean(reply.text,80),source:reply.source}});});
  }
  private async finish(run:Run){
    if(terminal(run)||this.disposed)return;
    await this.transact(run,async()=>{await this.emit(run,{type:'mayor.thinking',data:{phase:'brief'}});});
    this.checkBudget(run);const artifacts=await Promise.all(Object.keys(run.state.artifacts).filter(id=>!run.state.artifacts[id].stale).map(id=>this.getArtifact(run.id,id)));
    const reply=await this.bounded(this.mayor().brief({idea:run.state.idea,plan:run.state.plan!,artifacts}),60000);await this.billMayor(run,reply.usage);const payload=BriefPayloadSchema.parse(reply.brief);
    await this.transact(run,async()=>{if(terminal(run)||this.disposed)return;const artifact=await this.persist(run,null,payload,run.state.mode==='mock'?'mock':undefined);await this.emit(run,{type:'brief.ready',data:{artifactId:artifact.id}});});
    await this.flavor(run,'completed',run.state.title);
    await this.transact(run,async()=>{if(terminal(run)||this.disposed)return;const events=run.log.read();await this.emit(run,{type:'run.completed',data:{siteUrl:Object.values(run.state.artifacts).some(a=>a.kind==='site')?run.publicUrl:null,stats:{tasks:Object.values(run.state.tasks).filter(task=>task.status==='accepted').length,handoffs:run.state.handoffs.length,revisions:events.filter(event=>event.type==='task.revising').length,minutes:Number((run.state.t/60000).toFixed(2)),credits:run.state.payroll.credits,usd:run.state.payroll.usd}}});});
  }
  private async failRun(run:Run,code:'unknown'|'upstream'|'budget'|'cancelled',message:string){
    await this.transact(run,async()=>{if(terminal(run)||this.disposed)return;run.stopping=true;await this.emit(run,{type:'run.failed',data:{error:{code,message}}});for(const job of run.jobs.values()){job.accepting=false;job.controller?.abort('stopped');}this.release(run);});
  }
  async dispose(){this.disposed=true;clearInterval(this.monitor);this.shutdown.abort();for(const run of this.runs.values()){for(const job of run.jobs.values()){job.accepting=false;job.controller?.abort('stopped');}this.release(run);await run.queue;}}
}
export const createRunManager=(options:RunManagerOptions={})=>new RunManager(options);
