import { afterEach, describe, expect, it } from 'vitest';
import { rm, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { EventEnvelope, TownEvent } from '@hc/contracts';
import { createEventLog, openEventLog } from './eventLog';
import { runsRoot } from './fs';

const PREFIX = 'evlog-test-';
const scratch = new Set<string>();
const FIXED_NOW = () => 1000;
const iso = (ms: number): string => new Date(ms).toISOString();

const thinking = (suffix = ''): TownEvent => ({ type: 'mayor.thinking', data: { phase: suffix === '' ? 'plan' : 'review' } });
const planned = (): TownEvent => ({ type: 'run.created', data: { idea: 'an idea for the event log', mode: 'live' } });

const cleanIds = async (): Promise<void> => {
  for (const path of scratch) await rm(path, { recursive: true, force: true });
  scratch.clear();
};

describe('append serialization', () => {
  it('derives seq/time inside the commit: N concurrent appends stay gapless and monotonic', async () => {
    const runId = `${PREFIX}concurrent`;
    scratch.add(join(runsRoot(), runId));
    const log = await openEventLog(runId, { now: FIXED_NOW });
    const settled = await Promise.all(
      Array.from({ length: 50 }, () => log.append(planned()).catch(error => ({ error }))),
    );
    expect(settled.filter(entry => !('error' in entry))).toHaveLength(50);
    const history = log.read();
    expect(history.map(envelope => envelope.seq)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    const times = history.map(envelope => envelope.t);
    for (let i = 1; i < times.length; i += 1) expect(times[i]).toBeGreaterThan(times[i - 1]);
    for (const envelope of history) expect(envelope.at).toBe(iso(1000 + envelope.t));
  });

  it('persists exactly one line per commit and never advances the index on a failed sink', async () => {
    const runId = `${PREFIX}failed-sink`;
    scratch.add(join(runsRoot(), runId));
    const lines: string[] = [];
    let broken = false;
    const sink = async (line: string): Promise<void> => {
      if (broken) throw new Error('sink exploded');
      lines.push(line);
    };
    const log = await openEventLog(runId, { now: FIXED_NOW, sink });
    await log.append(planned());
    expect(log.size()).toBe(1);
    broken = true;
    await expect(log.append(thinking())).rejects.toThrow('sink exploded');
    expect(log.size()).toBe(1);
    const rejectedAgain = await log.append(thinking()).catch(error => ({ error }));
    expect(rejectedAgain).toBeDefined();
    broken = false;
    await expect(log.append(thinking('review'))).resolves.toMatchObject({ seq: 2 });
    expect(lines).toHaveLength(2);
    expect(lines.every(line => JSON.parse(line).runId === runId)).toBe(true);
  });
});

describe('subscribe isolation and ordering', () => {
  it('buffers post-registration events as live; history and live never overlap', async () => {
    const runId = `${PREFIX}subscribe`;
    scratch.add(join(runsRoot(), runId));
    const log = await openEventLog(runId, { now: FIXED_NOW });
    for (let i = 0; i < 3; i += 1) await log.append(thinking());
    const live: EventEnvelope[] = [];
    const history = log.subscribe(envelope => live.push(envelope), 1);
    expect(history.history.map(envelope => envelope.seq)).toEqual([2, 3]);
    await log.append(thinking('review'));
    expect(live.map(envelope => envelope.seq)).toEqual([4]);
    history.close();
    await log.append(thinking());
    expect(live).toHaveLength(1);
  });

  it('isolates a throwing listener from durability and the other listeners', async () => {
    const runId = `${PREFIX}throwing-listener`;
    scratch.add(join(runsRoot(), runId));
    const log = await openEventLog(runId, { now: FIXED_NOW });
    const seen: number[] = [];
    log.subscribe(() => { throw new Error('subscriber exploded'); });
    const second = log.subscribe(envelope => seen.push(envelope.seq));
    await expect(log.append(planned())).resolves.toMatchObject({ seq: 1 });
    expect(seen).toEqual([1]);
    second.close();
  });
});

describe('reload and recovery', () => {
  it('round-trips through disk and continues the sequence after a reload', async () => {
    const runId = `${PREFIX}reload`;
    const dir = join(runsRoot(), runId);
    scratch.add(dir);
    const first = await openEventLog(runId, { now: FIXED_NOW });
    for (let i = 0; i < 10; i += 1) await first.append(thinking());
    const reopened = await openEventLog(runId, { now: FIXED_NOW });
    expect(reopened.size()).toBe(10);
    expect(reopened.read(8).map(envelope => envelope.seq)).toEqual([9, 10]);
    await expect(reopened.append(planned())).resolves.toMatchObject({ seq: 11, t: 10 });
  });

  it('honors HC_RUNS_DIR the same way the sites publisher does', async () => {
    const previous = process.env.HC_RUNS_DIR;
    const root = join(runsRoot(), `${PREFIX}hcdir`);
    scratch.add(root);
    process.env.HC_RUNS_DIR = root;
    try {
      const runId = `${PREFIX}via-env`;
      const log = await openEventLog(runId, { now: FIXED_NOW });
      await log.append(planned());
      const path = join(root, runId, 'events.jsonl');
      const persisted = await readFile(path, 'utf8');
      expect(JSON.parse(persisted.trim())).toMatchObject({ runId, seq: 1 });
      const reopened = await openEventLog(runId, { now: FIXED_NOW });
      expect(reopened.size()).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.HC_RUNS_DIR;
      else process.env.HC_RUNS_DIR = previous;
    }
  });

  it('repairs a torn final write once and keeps the clean prefix', async () => {
    const runId = `${PREFIX}torn`;
    const dir = join(runsRoot(), runId);
    scratch.add(dir);
    const path = join(dir, 'events.jsonl');
    const good = [
      JSON.stringify({ v: 1, runId, seq: 1, t: 0, at: iso(1000), type: 'run.created', data: { idea: 'an idea for the event log', mode: 'live' } }),
      JSON.stringify({ v: 1, runId, seq: 2, t: 5, at: iso(1005), type: 'mayor.thinking', data: { phase: 'plan' } }),
    ];
    await mkdir(dir, { recursive: true });
    await writeFile(path, `${good.join('\n')}\n{"v":1,"runId":"`, 'utf8'); // dies mid-write
    const log = await openEventLog(runId, { now: FIXED_NOW });
    expect(log.size()).toBe(2);
    expect(log.last()?.seq).toBe(2);
    const after = await readFile(path, 'utf8');
    expect(after).toBe(`${good.join('\n')}\n`);
    await expect(log.append(thinking('review'))).resolves.toMatchObject({ seq: 3 });
    const again = await openEventLog(runId, { now: FIXED_NOW });
    expect(again.size()).toBe(3);
  });

  it('skips blank lines left by the previous torn-tail behaviour', async () => {
    const runId = `${PREFIX}blank-lines`;
    const dir = join(runsRoot(), runId);
    scratch.add(dir);
    const path = join(dir, 'events.jsonl');
    const line = (seq: number, t: number): string => JSON.stringify({ v: 1, runId, seq, t, at: iso(1000 + t), type: 'mayor.thinking', data: { phase: 'plan' } });
    await mkdir(dir, { recursive: true });
    await writeFile(path, `${line(1, 0)}\n\n${line(2, 4)}\n`, 'utf8');
    const log = await openEventLog(runId, { now: FIXED_NOW });
    expect(log.size()).toBe(2);
    expect(log.read().map(envelope => envelope.seq)).toEqual([1, 2]);
  });

  it("fails clearly on a corrupt middle line instead of ignoring it", async () => {
    const runId = `${PREFIX}corrupt-middle`;
    const dir = join(runsRoot(), runId);
    scratch.add(dir);
    const path = join(dir, 'events.jsonl');
    const line = (seq: number): string => JSON.stringify({ v: 1, runId, seq, t: seq, at: iso(1000 + seq), type: 'mayor.thinking', data: { phase: 'plan' } });
    await mkdir(dir, { recursive: true });
    await writeFile(path, `${line(1)}\nnot-json\n${line(3)}\n`, 'utf8');
    await expect(openEventLog(runId, { now: FIXED_NOW })).rejects.toThrow(/line 2.*invalid JSON/);
    const content = await readFile(path, 'utf8');
    expect(content).toContain('not-json'); // no silent rewrite
  });

  it('fails on a schema-invalid middle line, a foreign run identity and a sequence gap', async () => {
    const cases: [string, string, RegExp][] = [
      [`${PREFIX}bad-schema`, `${JSON.stringify({ v: 1, runId: `${PREFIX}bad-schema`, seq: 1, t: 0, at: iso(1000), type: 'run.created', data: { idea: 'short', mode: 'live' } })}\n`, /contract violation/],
      [`${PREFIX}foreign-line`, `${JSON.stringify({ v: 1, runId: 'not_this_run', seq: 1, t: 0, at: iso(1000), type: 'run.paused', data: {} })}\n`, /foreign run identity/],
      [`${PREFIX}missing-seq`, [
        JSON.stringify({ v: 1, runId: `${PREFIX}missing-seq`, seq: 1, t: 0, at: iso(1000), type: 'run.paused', data: {} }),
        JSON.stringify({ v: 1, runId: `${PREFIX}missing-seq`, seq: 3, t: 9, at: iso(1009), type: 'run.paused', data: {} }),
      ].join('\n') + '\n', /expected seq 2, found 3/],
      [`${PREFIX}backwards`, [
        JSON.stringify({ v: 1, runId: `${PREFIX}backwards`, seq: 1, t: 10, at: iso(1010), type: 'run.paused', data: {} }),
        JSON.stringify({ v: 1, runId: `${PREFIX}backwards`, seq: 2, t: 4, at: iso(1004), type: 'run.paused', data: {} }),
      ].join('\n') + '\n', /time runs backwards/],
    ];
    for (const [runId, content, pattern] of cases) {
      const dir = join(runsRoot(), runId);
      scratch.add(dir);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'events.jsonl'), content, 'utf8');
      await expect(openEventLog(runId, { now: FIXED_NOW })).rejects.toThrow(pattern);
    }
  });

  it('pins replay times via appendWithTime but keeps the log monotonic', async () => {
    const runId = `${PREFIX}replay-times`;
    scratch.add(join(runsRoot(), runId));
    const log = await openEventLog(runId, { now: FIXED_NOW });
    await expect(log.appendWithTime(planned(), { t: 300, at: iso(5000) })).resolves.toMatchObject({ seq: 1, t: 300, at: iso(5000) });
    await expect(log.appendWithTime(thinking(), { t: 50 })).resolves.toMatchObject({ t: 301 });
    await expect(log.append(thinking('review'))).resolves.toMatchObject({ t: 302 });
  });

  it('validates envelopes against the contracts before persisting', async () => {
    const runId = `${PREFIX}shape`;
    scratch.add(join(runsRoot(), runId));
    const log = await openEventLog(runId, { now: FIXED_NOW });
    const bad = { type: 'run.created', data: { idea: 'tiny', mode: 'live' } } as unknown as TownEvent;
    await expect(log.append(bad)).rejects.toThrow(/violates contracts/);
    expect(log.size()).toBe(0);
    const files = await readdir(join(runsRoot(), runId)).catch(error => (error as NodeJS.ErrnoException).code);
    expect(files).toBe('ENOENT');
  });
});

afterEach(cleanIds);
