import { create } from 'zustand';
import { initialState, reduce, deriveCues, type TownState, type Cue } from '@hc/engine';
import { ArtifactSchema, PlanSchema, type AgentId, type Artifact, type DeptId, type EventEnvelope, type Plan, type Subscribe } from '@hc/contracts';
import { bridge } from '../bridge';
import { api } from './api';
import { LiveSource } from './liveSource';
import { loadReplay, loadRunEvents, ReplaySource } from './replaySource';

export type Store = {
  state:TownState;cues$:Subscribe<Cue>;mode:'live'|'replay';speed:number;selected:AgentId|null;orgChart:boolean;reducedMotion:boolean;
  history:boolean;connection:'open'|'reconnecting'|'offline';events:EventEnvelope[];duration:number;playing:boolean;playbackRevision:number;error:string|null;
  select(a:AgentId|null):void;setOrgChart(on:boolean):void;setReducedMotion(on:boolean):void;
  getArtifact(aid:string):Promise<Artifact>;replan():Promise<void>;startRun(idea:string):Promise<void>;approve(plan:Plan):Promise<void>;
  answer(qid:string,text:string):Promise<void>;redirect(agent:DeptId,note:string):Promise<void>;pause():Promise<void>;resume():Promise<void>;
  openReplay(src:string,speed?:number):void;scrubTo(t:number):void;backToLive():void;setSpeed(speed:number):void;setPlaying(on:boolean):void;
};
const cueListeners=new Set<(cue:Cue)=>void>();
const cues$:Subscribe<Cue>=listener=>{cueListeners.add(listener);return()=>{cueListeners.delete(listener);};};
let replay:ReplaySource|null=null,live:LiveSource|null=null;
let artifactCache:Record<string,Artifact>={};
let snapshot=initialState();
let generation=0;
const rebuild=(events:EventEnvelope[],t:number)=>events.filter(e=>e.t<=t).reduce(reduce,initialState());
const liveId=():string=>{
  const current=useStore.getState();
  if(current.mode!=='live'||current.history)throw new Error('Live controls are unavailable while viewing a recording.');
  if(!current.state.runId)throw new Error('Start a live run first.');
  return current.state.runId;
};
async function action(fn:()=>Promise<void>):Promise<void> {
  try {useStore.setState({error:null});await fn();}catch(error){useStore.setState({error:error instanceof Error?error.message:'Request failed.'});throw error;}
}
function emitEvent(event:EventEnvelope):void {
  const current=useStore.getState();
  if((current.state.runId!==null&&event.runId!==current.state.runId)||event.seq<=current.state.lastSeq)return;
  const cues=deriveCues(current.state,event);
  useStore.setState({state:reduce(current.state,event)});
  for(const cue of cues)for(const listener of cueListeners)listener(cue);
}
export const useStore=create<Store>((set,get)=>({
  state:initialState(),cues$,mode:'live',speed:1,selected:null,orgChart:false,
  reducedMotion:typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,
  history:false,connection:'offline',events:[],duration:0,playing:false,playbackRevision:0,error:null,
  select:selected=>set({selected}),setOrgChart:orgChart=>set({orgChart}),setReducedMotion:reducedMotion=>set({reducedMotion}),
  getArtifact:async aid=>{
    if(!get().state.artifacts[aid])throw new Error('This deliverable is not available at this point in the run.');
    if(artifactCache[aid])return artifactCache[aid];
    if(get().mode==='replay')throw new Error('The recording does not contain this deliverable.');
    const version=generation,runId=get().state.runId!;
    const artifact=ArtifactSchema.parse(await api.getArtifact(runId,aid));
    if(version!==generation)throw new Error('The active run changed while loading this deliverable.');
    if(artifact.id!==aid||artifact.runId!==runId)throw new Error('The server returned a mismatched deliverable.');
    artifactCache[aid]=artifact;return artifact;
  },
  replan:()=>action(()=>api.replan(liveId())),
  startRun:idea=>action(async()=>{
    const version=++generation;
    const trimmed=idea.trim();if(trimmed.length<8||trimmed.length>280)throw new Error('Describe your business in 8–280 characters.');
    const health=await api.health();
    if(!health.ok||health.stepfun==='down'||health.creao==='down')throw new Error('The Mayor or a saved CREAO agent is unavailable. Check the server credentials and saved app IDs.');
    if(version!==generation)return;
    const {runId}=await api.createRun(trimmed);if(version===generation)await connectRun(runId);
  }),
  approve:plan=>action(()=>api.approve(liveId(),PlanSchema.parse(plan))),answer:(qid,text)=>action(()=>api.answer(liveId(),qid,text)),
  redirect:(agent,note)=>action(()=>api.redirect(liveId(),agent,note)),pause:()=>action(()=>api.pause(liveId())),resume:()=>action(()=>api.resume(liveId())),
  openReplay:(src,speed=1)=>{
    const version=++generation;replay?.destroy();live?.close();live=null;replay=null;artifactCache={};
    set(current=>({state:initialState(),mode:'replay',events:[],duration:0,history:false,error:null,playing:false,connection:'offline',playbackRevision:current.playbackRevision+1}));
    void loadReplay(src).then(data=>{
      if(version!==generation)return;
      artifactCache=data.artifacts;
      replay=new ReplaySource(data.events,t=>{
        for(const event of data.events)if(event.seq>get().state.lastSeq&&event.t<=t)emitEvent(event);
        set(current=>({state:{...current.state,t},playing:t<(replay?.duration??0)}));
      });
      replay.speed=Math.max(.25,Math.min(20,speed));
      set(current=>({state:rebuild(data.events,0),events:data.events,duration:replay!.duration,mode:'replay',history:false,speed:replay!.speed,selected:null,playbackRevision:current.playbackRevision+1,connection:'open',playing:replay!.duration>0}));
      replay.play();
    }).catch(error=>{if(version===generation)set({error:error instanceof Error?error.message:'Recording could not be loaded.',playing:false});});
  },
  scrubTo:t=>{
    if(Number.isNaN(t))return;
    const time=Math.max(0,Math.min(get().duration,t));replay?.pause(false);replay?.seek(time);
    const events=get().events;
    const state=rebuild(events,time);
    set(current=>({state:{...state,t:time},playing:false,history:current.mode==='live',playbackRevision:current.playbackRevision+1}));
  },
  backToLive:()=>{
    if(get().mode!=='live')return;
    set(current=>({state:current.events.reduce(reduce,initialState()),history:false,playbackRevision:current.playbackRevision+1}));
  },
  setSpeed:speed=>{if(!Number.isFinite(speed))return;const bounded=Math.max(.25,Math.min(20,speed));if(replay)replay.speed=bounded;set({speed:bounded});},
  setPlaying:playing=>{
    if(!replay)return;
    if(playing){if(replay.time>=replay.duration){replay.seek(0);set(current=>({state:rebuild(current.events,0),playbackRevision:current.playbackRevision+1}));}replay.play();}else replay.pause();
    set({playing:replay.playing});
  },
}));
export const store=useStore;
bridge.on('select',({agent})=>useStore.getState().select(agent));
export async function connectRun(runId:string):Promise<void> {
  const version=++generation;replay?.destroy();replay=null;live?.close();live=null;artifactCache={};
  useStore.setState({state:initialState(),mode:'live',events:[],duration:0,history:false,playing:false,connection:'reconnecting',error:null});
  const catchup=async():Promise<{seq:number;t:number}>=>{
    const response=await api.getRun(runId);
    if(response.state.runId!==runId)throw new Error('The run snapshot belongs to another run.');
    const events=await loadRunEvents(runId,response.state.lastSeq);
    if(version!==generation)throw new Error('The active source changed.');
    snapshot=response.state;
    useStore.setState(current=>({
      state:current.mode==='live'&&current.history?current.state:snapshot,
      mode:'live',events,duration:snapshot.t,playing:false,
      history:current.mode==='live'&&current.history,
      playbackRevision:current.playbackRevision+1,
    }));
    return {seq:snapshot.lastSeq,t:snapshot.t};
  };
  try {
    const head=await catchup();
    if(version!==generation)return;
    live=new LiveSource(runId,head.seq,event=>{
      if(version!==generation)return;
      useStore.setState(current=>({events:[...current.events,event],duration:event.t}));
      if(!useStore.getState().history)emitEvent(event);
    },connection=>{if(version===generation)useStore.setState({connection});},catchup,head.t);
    live.connect();
  }catch(error){
    if(version!==generation)return;
    useStore.setState({connection:'offline',error:error instanceof Error?error.message:'Run could not be loaded.'});
    throw error;
  }
}
