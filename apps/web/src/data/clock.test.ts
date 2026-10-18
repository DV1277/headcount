import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReplaySource, loadReplay } from './replaySource';
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
describe('replay clock',()=>{
  it('accounts for elapsed time at pause and speed changes and resumes without paused time',async()=>{
    vi.useFakeTimers();let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
    const {events}=await loadReplay('fixture:golden-boba'),onTime=vi.fn();
    const source=new ReplaySource(events,onTime);source.play();now=15;source.speed=2;expect(source.time).toBe(15);
    now=25;source.pause();expect(source.time).toBe(35);now=5000;source.play();now=5010;source.pause();expect(source.time).toBe(55);
    source.seek(Infinity);source.play();expect(source.playing).toBe(false);expect(source.time).toBe(source.duration);
    source.seek(NaN);source.speed=NaN;expect(source.time).toBe(source.duration);expect(source.speed).toBe(2);source.destroy();
  });
});
