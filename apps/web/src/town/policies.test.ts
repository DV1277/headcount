import { describe, expect, it } from 'vitest';
import { admitBubble, fitCanvasLabel, shouldFastForward, truncateText, visualDuration } from './policies';

const holder = (priority: 1 | 2 | 3 | 4, i: number) => ({
  id: i,
  agent: (['mayor', 'scout', 'maker', 'herald'] as const)[(i - 1) % 4],
  text: `bubble ${i}`,
  at: 1000 + i,
  priority,
});

describe('bubble truncate', () => {
  it('keeps short text intact', () => {
    expect(truncateText('Ship the brief')).toBe('Ship the brief');
  });

  it('collapses whitespace', () => {
    expect(truncateText('Research  is\t underway\nnow')).toBe('Research is underway now');
  });

  it('caps at 80 chars with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const cut = truncateText(long);
    expect(cut.length).toBe(80);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.startsWith('xxxxx')).toBe(true);
  });
});

describe('admitBubble', () => {
  it('replaces a speaker instead of rendering two messages at the same position', () => {
    const previous = holder(2, 1);
    const incoming = { ...holder(3, 2), agent: previous.agent };
    const result = admitBubble([previous], incoming);
    expect(result.kept).toEqual([incoming]);
    expect(result.evicted).toEqual([previous]);
  });

  it('keeps a founder-facing note when the same speaker emits lower-priority chatter', () => {
    const previous = holder(4, 1);
    const incoming = { ...holder(1, 2), agent: previous.agent };
    expect(admitBubble([previous], incoming).admitted).toBeNull();
  });
  it('admits while under the town-wide cap', () => {
    const first = admitBubble([], holder(2, 1));
    expect(first.admitted?.id).toBe(1);
    expect(first.kept.length).toBe(1);
    expect(first.evicted).toEqual([]);
  });

  it('drops a newcomer whose priority cannot evict anyone', () => {
    const state = [holder(1, 1), holder(2, 2)];
    const result = admitBubble(state, holder(1, 3));
    expect(result.admitted).toBeNull();
    expect(result.kept.map((entry) => entry.id)).toEqual([1, 2]);
    expect(result.evicted).toEqual([]);
  });

  it('keeps the oldest pair when priorities tie', () => {
    const state = [holder(2, 1), holder(2, 2)];
    const result = admitBubble(state, holder(2, 3));
    expect(result.admitted).toBeNull();
    expect(result.kept.map((entry) => entry.id)).toEqual([1, 2]);
  });

  it('a stronger newcomer evicts exactly one weaker speaker', () => {
    const state = [holder(1, 1), holder(1, 2)];
    const result = admitBubble(state, holder(3, 3));
    expect(result.admitted?.id).toBe(3);
    expect(result.evicted.map((entry) => entry.id)).toEqual([1]);
    expect(result.kept.map((entry) => entry.id)).toEqual([2, 3]);
  });

  it('the strongest newcomer evicts the weakest of three', () => {
    const state = [holder(2, 1), holder(2, 2), holder(2, 3)];
    const result = admitBubble(state, holder(4, 4));
    expect(result.admitted?.id).toBe(4);
    expect(result.evicted.map((entry) => entry.id)).toEqual([1]);
  });
});

describe('accelerated visual timing and labels', () => {
  it('keeps transitions visible and speech readable at 20× without changing the event clock', () => {
    expect(visualDuration(140, 20)).toBe(140);
    expect(visualDuration(600, 20, 260)).toBe(260);
    expect(visualDuration(3200, 20, 1800)).toBe(1800);
    expect(visualDuration(600, 1, 260)).toBe(600);
  });

  it('fits long titles and unbroken identifiers to the measured notice-board width', () => {
    const measure = (text: string) => text.length * 3;
    for (const input of ['Late-Night Boba Delivery for UCLA Dorms: Work Plan', 'LongUnbrokenCompanyName'.repeat(4), 'Boba']) {
      const output = fitCanvasLabel(input, 34, 2, measure);
      expect(output.split('\n').length).toBeLessThanOrEqual(2);
      expect(output.split('\n').every((line) => measure(line) <= 34)).toBe(true);
    }
    expect(fitCanvasLabel('Boba', 34, 2, measure)).toBe('Boba');
  });
});

describe('walk fast-forward rule', () => {
  it('teleports long plain walk queues', () => {
    expect(shouldFastForward(7, false)).toBe(true);
    expect(shouldFastForward(6, false)).toBe(false);
  });

  it('never skips a carrying stroll', () => {
    expect(shouldFastForward(50, true)).toBe(false);
  });
});
