import { describe, expect, it } from 'vitest';
import { admitBubble, shouldFastForward, truncateText } from './policies';

const holder = (priority: 1 | 2 | 3 | 4, i: number) => ({
  id: i,
  agent: 'mayor' as const,
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

describe('walk fast-forward rule', () => {
  it('teleports long plain walk queues', () => {
    expect(shouldFastForward(7, false)).toBe(true);
    expect(shouldFastForward(6, false)).toBe(false);
  });

  it('never skips a carrying stroll', () => {
    expect(shouldFastForward(50, true)).toBe(false);
  });
});
