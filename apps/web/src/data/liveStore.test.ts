import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialState, reduce } from '@hc/engine';
import { api } from './api';
import { loadReplay, loadRunEvents, parseLog } from './replaySource';
import { connectRun, useStore } from './store';
class FakeEventSource {
  static all:FakeEventSource[]=[];
  onopen:(()=>void)|null=null;onerror:(()=>void)|null=null;listener:((e:{data:string})=>void)|null=null;
  constructor(public url:string){FakeEventSource.all.push(this);}
  addEventListener(_type:string,fn:(e:{data:string})=>void){this.listener=fn;}
  close(){}
}
afterEach(()=>{useStore.getState().setPlaying(false);vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();FakeEventSource.all=[];});
const response=(events:unknown[])=>new Response(events.map(event=>`event: town\ndata: ${JSON.stringify(event)}\n\n`).join(''),{headers:{'Content-Type':'text/event-stream'}});
describe('snapshot bounded live history',()=>{
  it('loads prior history, scrubs silently, catches up reconnect silently, and rejoins the head',async()=>{
    vi.stubGlobal('EventSource',FakeEventSource);
    const {events}=await loadReplay('fixture:golden-boba');let end=10;
    vi.spyOn(api,'getRun').mockImplementation(async()=>({state:events.slice(0,end).reduce(reduce,initialState())}));
    vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>response(events.slice(0,end))));
    const cue=vi.fn(),stop=useStore.getState().cues$(cue);
    await connectRun(events[0].runId);expect(useStore.getState().events).toHaveLength(10);expect(cue).not.toHaveBeenCalled();
    useStore.getState().scrubTo(events[1].t);expect(useStore.getState().state.lastSeq).toBe(2);expect(cue).not.toHaveBeenCalled();
    useStore.getState().backToLive();expect(useStore.getState().state.lastSeq).toBe(10);
    vi.useFakeTimers();end=12;FakeEventSource.all.at(-1)!.onerror?.();await vi.advanceTimersByTimeAsync(1000);
    expect(useStore.getState().state.lastSeq).toBe(12);expect(FakeEventSource.all.at(-1)!.url).toContain('from=12');expect(cue).not.toHaveBeenCalled();
    FakeEventSource.all.at(-1)!.listener?.({data:JSON.stringify(events[12])});expect(useStore.getState().state.lastSeq).toBe(13);
    FakeEventSource.all.at(-1)!.listener?.({data:JSON.stringify(events[13])});expect(cue).toHaveBeenCalled();stop();
    useStore.getState().openReplay('fixture:redirect');await vi.advanceTimersByTimeAsync(0);useStore.getState().setPlaying(false);
  });
  it('ignores stale snapshot completion after opening a different recording',async()=>{
    vi.stubGlobal('EventSource',FakeEventSource);
    const {events}=await loadReplay('fixture:golden-boba');let resolve!:(value:Awaited<ReturnType<typeof api.getRun>>)=>void;
    vi.spyOn(api,'getRun').mockImplementation(()=>new Promise(done=>{resolve=done;}));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(events)));
    const pending=connectRun(events[0].runId);useStore.getState().openReplay('fixture:redirect');
    await vi.waitFor(()=>expect(useStore.getState().state.runId).toContain('redirect'));useStore.getState().setPlaying(false);
    resolve({state:events.reduce(reduce,initialState())});await pending;
    expect(useStore.getState().state.runId).toContain('redirect');expect(FakeEventSource.all).toHaveLength(0);
  });
  it('allows historical live deliverables and rejects stale artifact requests after switching runs',async()=>{
    vi.stubGlobal('EventSource',FakeEventSource);
    const {events,artifacts}=await loadReplay('fixture:golden-boba');
    vi.spyOn(api,'getRun').mockResolvedValue({state:events.reduce(reduce,initialState())});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(events)));
    await connectRun(events[0].runId);
    const created=events.find(e=>e.type==='artifact.created'&&e.data.artifact.kind==='research')!;
    useStore.getState().scrubTo(created.t);
    let resolve!:(value:typeof artifacts[string])=>void;
    const request=vi.spyOn(api,'getArtifact').mockImplementation(()=>new Promise(done=>{resolve=done;}));
    const pending=useStore.getState().getArtifact('a_research');
    expect(request).toHaveBeenCalledWith(events[0].runId,'a_research');
    const rejected=expect(pending).rejects.toThrow('active run changed');
    useStore.getState().openReplay('fixture:redirect');
    await vi.waitFor(()=>expect(useStore.getState().state.runId).toContain('redirect'));useStore.getState().setPlaying(false);
    resolve(artifacts.a_research);await rejected;
    useStore.getState().scrubTo(Infinity);
    expect((await useStore.getState().getArtifact('a_research')).runId).toContain('redirect');
  });
  it('rejects empty, wrong-run and gapped recordings and stops at the captured prefix',async()=>{
    const {events}=await loadReplay('fixture:golden-boba');
    expect(()=>parseLog('')).toThrow('contain events');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response([{...events[0],runId:'run_wrong'}])));
    await expect(loadRunEvents(events[0].runId,1)).rejects.toThrow('another run');
    vi.mocked(fetch).mockResolvedValue(response([events[0],events[2]]));
    await expect(loadRunEvents(events[0].runId,2)).rejects.toThrow('gap');
    vi.mocked(fetch).mockResolvedValue(response(events.slice(0,4)));
    expect(await loadRunEvents(events[0].runId,2)).toEqual(events.slice(0,2));
  });
});
