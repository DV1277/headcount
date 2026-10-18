import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveSource } from './liveSource';
import { loadReplay } from './replaySource';

class FakeEventSource {
  static all:FakeEventSource[]=[];
  onopen:(()=>void)|null=null;onerror:(()=>void)|null=null;
  listener:((event:{data:string})=>void)|null=null;closed=false;
  constructor(public url:string){FakeEventSource.all.push(this);}
  addEventListener(_type:string,fn:(event:{data:string})=>void){this.listener=fn;}
  send(value:unknown){this.listener?.({data:typeof value==='string'?value:JSON.stringify(value)});}
  close(){this.closed=true;}
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();FakeEventSource.all=[];});
describe('live event source',()=>{
  it('deduplicates, catches up gaps before reconnecting, and ignores closed source callbacks',async()=>{
    vi.useFakeTimers();vi.stubGlobal('EventSource',FakeEventSource);
    const {events}=await loadReplay('fixture:golden-boba'),onEvent=vi.fn(),connection=vi.fn(),catchup=vi.fn().mockResolvedValue({seq:3,t:events[2].t});
    const source=new LiveSource(events[0].runId,1,onEvent,connection,catchup);source.connect();
    const first=FakeEventSource.all[0];first.send(events[0]);expect(onEvent).not.toHaveBeenCalled();
    first.send(events[2]);expect(first.closed).toBe(true);expect(connection).toHaveBeenCalledWith('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);expect(catchup).toHaveBeenCalledOnce();
    const second=FakeEventSource.all[1];expect(second.url).toContain('from=3');
    first.send(events[1]);expect(onEvent).not.toHaveBeenCalled();
    second.send(events[3]);expect(onEvent).toHaveBeenCalledWith(events[3]);source.close();
    second.send(events[4]);expect(onEvent).toHaveBeenCalledTimes(1);
  });
  it('closes malformed or wrong-run streams and cancels pending reconnect on dispose',async()=>{
    vi.useFakeTimers();vi.stubGlobal('EventSource',FakeEventSource);
    const {events}=await loadReplay('fixture:golden-boba');
    for(const value of ['not json',{...events[1],runId:'run_wrong'}]){
      const event=vi.fn(),connection=vi.fn(),source=new LiveSource(events[0].runId,1,event,connection);
      source.connect();const stream=FakeEventSource.all.at(-1)!;stream.send(value);
      expect(event).not.toHaveBeenCalled();expect(connection).toHaveBeenLastCalledWith('offline');expect(stream.closed).toBe(true);
    }
    const catchup=vi.fn(),source=new LiveSource(events[0].runId,1,vi.fn(),vi.fn(),catchup);source.connect();
    FakeEventSource.all.at(-1)!.onerror?.();source.close();await vi.advanceTimersByTimeAsync(2000);expect(catchup).not.toHaveBeenCalled();
  });
});
