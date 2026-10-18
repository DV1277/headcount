import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialState, reduce } from '@hc/engine';
import { loadReplay, parseLog } from './replaySource';
import { useStore } from './store';

afterEach(()=>{useStore.getState().setPlaying(false);vi.useRealTimers();vi.restoreAllMocks();});
describe('recording sources and state',()=>{
  it('bundles every fixture and rejects path traversal or broken event order',async()=>{
    for(const name of ['golden-boba','failure-retry','redirect']){
      const data=await loadReplay(`fixture:${name}`);expect(data.events.length).toBeGreaterThan(20);
      expect(Object.keys(data.artifacts).length).toBeGreaterThan(0);
    }
    await expect(loadReplay('fixture:../../.env')).rejects.toThrow('Unknown fixture');
    const {events}=await loadReplay('fixture:golden-boba');
    expect(()=>parseLog(JSON.stringify({...events[0],seq:2}))).toThrow('sequence');
  });
  it('scrubs by rebuilding the reducer without emitting animation cues',async()=>{
    const {events}=await loadReplay('fixture:golden-boba');
    const cue=vi.fn(),stop=useStore.getState().cues$(cue);
    useStore.getState().openReplay('fixture:golden-boba');
    await vi.waitFor(()=>expect(useStore.getState().mode).toBe('replay'));
    useStore.getState().setPlaying(false);
    cue.mockClear();
    const time=events[Math.floor(events.length/2)].t;
    useStore.getState().scrubTo(time);
    expect(useStore.getState().state).toEqual({...events.filter(event=>event.t<=time).reduce(reduce,initialState()),t:time});
    expect(cue).not.toHaveBeenCalled();
    useStore.getState().scrubTo(0);expect(useStore.getState().state.lastSeq).toBe(1);
    useStore.getState().scrubTo(Infinity);expect(useStore.getState().state.status).toBe('completed');
    stop();
  });
  it('keeps recording metadata available but blocks future deliverables',async()=>{
    useStore.getState().openReplay('fixture:redirect');
    await vi.waitFor(()=>expect(useStore.getState().state.runId).toContain('redirect'));
    useStore.getState().setPlaying(false);useStore.getState().scrubTo(0);
    await expect(useStore.getState().getArtifact('a_site')).rejects.toThrow('not available');
    useStore.getState().scrubTo(useStore.getState().duration);
    const aid=Object.keys(useStore.getState().state.artifacts)[0];
    expect((await useStore.getState().getArtifact(aid)).id).toBe(aid);
    await expect(useStore.getState().approve(useStore.getState().state.plan!)).rejects.toThrow('Live controls');
  });
});
