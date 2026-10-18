import { ArtifactSchema, EventEnvelopeSchema, type Artifact, type EventEnvelope } from '@hc/contracts';
import { api, request } from './api';

const logs=import.meta.glob('../../../../fixtures/runs/*.jsonl',{query:'?raw',import:'default',eager:true}) as Record<string,string>;
const artifactFiles=import.meta.glob('../../../../fixtures/runs/*.artifacts.json',{query:'?raw',import:'default',eager:true}) as Record<string,string>;
const sites=import.meta.glob('../../../../fixtures/runs/*.site.html',{query:'?url',import:'default',eager:true}) as Record<string,string>;
export type ReplayData={events:EventEnvelope[];artifacts:Record<string,Artifact>;siteUrl:string|null};
export function parseLog(raw:string):EventEnvelope[] {
  if (!raw.trim()) throw new Error('A recording must contain events.');
  const events=raw.trim().split(/\r?\n/).filter(Boolean).map(line=>EventEnvelopeSchema.parse(JSON.parse(line)));
  for (let i=0;i<events.length;i++) {
    if (i===0 && events[i].type!=='run.created') throw new Error('A recording must begin with run.created.');
    if (i>0 && events[i].type==='run.created') throw new Error('A recording must contain one run.created.');
    if (events[i].seq!==i+1) throw new Error('Recorded event sequence has a gap.');
    if (events[i].runId!==events[0].runId) throw new Error('A recording must contain one run.');
    if (i>0 && events[i].t<events[i-1].t) throw new Error('Recorded event times must be monotonic.');
  }
  return events;
}
/** Capture the append-only SSE prefix bounded by a snapshot, then release the stream. */
export async function loadRunEvents(runId:string,lastSeq:number):Promise<EventEnvelope[]> {
  if (!Number.isInteger(lastSeq)||lastSeq<1) throw new Error('The run snapshot has no valid event sequence.');
  const response=await fetch(`/api/runs/${encodeURIComponent(runId)}/events?from=0`,{signal:AbortSignal.timeout(15000)});
  if(!response.ok||!response.body)throw new Error('The run recording could not be read.');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='';const captured:EventEnvelope[]=[];
  try {
    while(captured.length<lastSeq){
      const {value,done}=await reader.read();if(done)break;
      buffer+=decoder.decode(value,{stream:true});const frames=buffer.split(/\r?\n\r?\n/);buffer=frames.pop()??'';
      for(const frame of frames){
        if(captured.length===lastSeq)break;
        const lines=frame.split(/\r?\n/);
        const type=lines.find(line=>line.startsWith('event:'))?.slice(6).trim();
        if(type && type!=='town')continue;
        const data=lines.filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        if(!data)continue;
        const event=EventEnvelopeSchema.parse(JSON.parse(data));
        if(event.runId!==runId)throw new Error('The recording contains events for another run.');
        if(event.seq!==captured.length+1)throw new Error('Recorded event sequence has a gap.');
        captured.push(event);
      }
    }
  }finally{await reader.cancel();}
  if(captured.length!==lastSeq)throw new Error('The recording ended before its final event.');
  return parseLog(captured.map(event=>JSON.stringify(event)).join('\n'));
}
export async function loadReplay(src:string):Promise<ReplayData> {
  if (!src.startsWith('fixture:')) {
    const {state}=await api.getRun(src);
    if(state.runId!==src)throw new Error('The run snapshot belongs to another run.');
    const events=await loadRunEvents(src,state.lastSeq);
    const ids=events.flatMap(e=>e.type==='artifact.created'?[e.data.artifact.id]:[]);
    const values=await Promise.all(ids.map(async id=>{
      const artifact=ArtifactSchema.parse(await request(`/api/runs/${encodeURIComponent(src)}/artifacts/${encodeURIComponent(id)}`));
      if(artifact.id!==id||artifact.runId!==src)throw new Error('The recording contains a mismatched deliverable.');
      return [id,artifact] as const;
    }));
    return {events,artifacts:Object.fromEntries(values),siteUrl:null};
  }
  const name=src.slice('fixture:'.length);
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Unknown fixture.');
  const key=`../../../../fixtures/runs/${name}`;
  if (!(key+'.jsonl' in logs)) throw new Error(`Recording '${name}' is not available.`);
  const values=JSON.parse(artifactFiles[key+'.artifacts.json']??'{}') as Record<string,unknown>;
  const artifacts=Object.fromEntries(Object.entries(values).map(([id,value])=>[id,ArtifactSchema.parse(value)]));
  const siteUrl=sites[key+'.site.html']??null;
  if (siteUrl) for (const artifact of Object.values(artifacts)) if (artifact.kind==='site') artifact.url=siteUrl;
  return {events:parseLog(logs[key+'.jsonl']),artifacts,siteUrl};
}

/** A monotonic recording clock. Seeking rebuilds state in the store without cues. */
export class ReplaySource {
  private timer:ReturnType<typeof setInterval>|null=null;
  private last=0;
  private rate=1;
  public time=0;
  public readonly duration:number;
  public playing=false;
  constructor(public readonly events:EventEnvelope[],private readonly onTime:(t:number)=>void) {this.duration=events.at(-1)?.t??0;}
  get speed():number {return this.rate;}
  set speed(value:number) {
    if(!Number.isFinite(value))return;
    if(this.playing)this.advance();
    this.rate=Math.max(.25,Math.min(20,value));
  }
  private advance():void {
    const now=performance.now();
    this.time=Math.min(this.duration,this.time+(now-this.last)*this.rate);this.last=now;
    this.onTime(this.time);
    if(this.time>=this.duration)this.stop();
  }
  private stop():void {this.playing=false;if(this.timer!==null)clearInterval(this.timer);this.timer=null;}
  play():void {
    if (this.playing || this.time>=this.duration) return;
    this.playing=true;this.last=performance.now();this.timer=setInterval(()=>this.advance(),32);
  }
  pause(flush=true):void {if(this.playing&&flush)this.advance();this.stop();}
  seek(t:number):void {if(Number.isNaN(t))return;this.time=Math.max(0,Math.min(this.duration,t));this.last=performance.now();}
  destroy():void {this.stop();}
}
