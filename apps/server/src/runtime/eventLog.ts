/**
 * O3 S-01 — persistent append-only event log per run (HC-F-180).
 *
 * Storage: `runs/<id>/events.jsonl`, one `EventEnvelope` per line, gapless
 * `seq` starting at 1, monotonic `t` (ms since run creation) with
 * `at = createdAt + t` for live appends (replay may pin both).
 *
 * Invariants enforced here:
 * - `seq`/`t`/`at` are derived INSIDE the serialized commit, so any number of
 *   concurrent `append` calls stay gapless and strictly time-ordered
 *   (PRD §8.2). A failed persistence never advances the index.
 * - On reload every persisted line is validated against the frozen contracts
 *   (`EventEnvelopeSchema`) and checked for monotonic time, gapless seq and
 *   run identity. A corrupt middle line fails loudly; only a torn final write
 *   (the crash mid-append case, HC-N-014) is repaired deliberately, once, by
 *   truncating the tail so later reloads see a clean log. Empty lines carry
 *   no data and are skipped.
 * - Listener exceptions are isolated: a broken subscriber can neither damage
 *   durability nor prevent delivery to the other subscribers.
 *
 * Subscription is race-free: `subscribe()` registers the listener first, then
 * snapshots history in the same synchronous block. Events committed before
 * that block are delivered via history, anything committed after via live
 * push — no gap, no duplicate. Use `openEventLog` (awaits reload) before
 * subscribing; subscribing on a fresh `createEventLog` instance legitimately
 * sees an empty history until `load()` runs.
 */
import { EventEnvelopeSchema, type EventEnvelope, type TownEvent } from '@hc/contracts';
import { writeFile } from 'node:fs/promises';
import { appendJsonLine, ensureDir, eventsPath, readFileText, runDir } from './fs';

export type Notify = (envelope: EventEnvelope) => void;

export type EventLogSubscription = {
  /** Persisted events with seq > from, snapshotted at subscription time. */
  history: EventEnvelope[];
  /** Unsubscribe. Returns nothing. */
  close(): void;
};

export type EventLogBase = {
  append(event: TownEvent): Promise<EventEnvelope>;
  read(from?: number): EventEnvelope[];
};

/** Compatibility alias for the original minimal log surface. */
export type EventLog = EventLogBase;

export type EventLogStream = EventLogBase & {
  /** Reload from disk (restart recovery); one-time per fresh instance. */
  load(): Promise<void>;
  last(): EventEnvelope | null;
  size(): number;
  /** Race-free history + live subscription (see module doc). */
  subscribe(push: Notify, from?: number): EventLogSubscription;
  /** Demo replay / deterministic tests: derive the envelope from fixed t. */
  appendWithTime(event: TownEvent, opts: { t: number; at?: string }): Promise<EventEnvelope>;
};

export type EventLogOptions = {
  rootDir?: string;
  /** Validate every envelope against the frozen contracts (HC-F-180 dev assert). */
  assertEvents?: boolean;
  /** Deterministic clock for tests; defaults to Date.now. */
  now?: () => number;
  /** Persistence sink override for tests (fakes). Defaults to the events file. */
  sink?: (line: string) => Promise<void>;
};

type AppendOptions = { t?: number; at?: string };

const corrupt = (runId: string, lineNo: number, detail: string): Error =>
  new Error(`Corrupt event log ${JSON.stringify(runId)} at persisted line ${lineNo}: ${detail}`);

class FileEventLog implements EventLogStream {
  private readonly filePath: string;
  private readonly listeners = new Set<Notify>();
  private readonly saver: (line: string) => Promise<void>;
  private readonly usesDefaultSink: boolean;
  private readonly assert: boolean;
  private readonly now: () => number;
  private readonly rootDir: string | undefined;
  private readonly baseTime: number;
  private index: EventEnvelope[] = [];
  private createdAt: number;
  private loaded = false;
  private failure: Error | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly runId: string, options: EventLogOptions) {
    this.rootDir = options.rootDir;
    this.filePath = eventsPath(runId, options.rootDir);
    this.assert = options.assertEvents ?? true;
    this.now = options.now ?? Date.now;
    this.createdAt = this.now();
    this.baseTime = this.createdAt;
    this.usesDefaultSink = options.sink === undefined;
    this.saver = options.sink ?? (async (line: string) => {
      await ensureDir(runDir(runId, this.rootDir));
      await appendJsonLine(this.filePath, line);
    });
  }

  /**
   * Rebuild the index from disk. Forbidden on an instance that already took
   * appends; `openEventLog()` is the supported flow.
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.index.length) throw new Error(`Event log ${JSON.stringify(this.runId)} cannot reload while it holds in-memory events.`);
    this.loaded = true;
    let raw: string;
    try {
      raw = await readFileText(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const endsAtNewline = raw.endsWith('\n');
    const body = endsAtNewline ? raw.slice(0, -1) : raw;
    const lines = body.length ? body.split('\n') : [];
    const keep: string[] = [];
    const initialTail = !endsAtNewline;
    let droppedTail = false;
    try {
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line) continue;
        const suspiciousTail = i === lines.length - 1 && initialTail;
        const envelope = parsePersistedLine(line, i + 1, this.runId, suspiciousTail);
        if (envelope === null) {
          droppedTail = true; // torn final write; truncated below
          continue;
        }
        if (envelope.seq !== this.index.length + 1) {
          throw corrupt(this.runId, i + 1, `expected seq ${this.index.length + 1}, found ${envelope.seq}`);
        }
        const previous = this.index[this.index.length - 1];
        if (previous && envelope.t < previous.t) {
          throw corrupt(this.runId, i + 1, `time runs backwards (${envelope.t} < ${previous.t})`);
        }
        if (Number.isFinite(Date.parse(envelope.at))) {
          this.createdAt = Date.parse(envelope.at) - envelope.t;
        }
        this.index.push(envelope);
        keep.push(JSON.stringify(envelope));
      }
    } catch (error) {
      this.index = [];
      this.createdAt = this.baseTime;
      this.failure = error instanceof Error ? error : corrupt(this.runId, 0, String(error));
      throw this.failure;
    }
    // Repair a torn tail exactly once so later reloads never re-parse
    // corruption. Only meaningful for the default file sink; sink fakes own
    // their storage and are never rewritten here.
    if ((initialTail || droppedTail) && this.usesDefaultSink) {
      const content = keep.length ? `${keep.join('\n')}\n` : '';
      await writeFile(this.filePath, content, 'utf8');
    }
  }

  last(): EventEnvelope | null {
    return this.index[this.index.length - 1] ?? null;
  }

  size(): number {
    return this.index.length;
  }

  read(from?: number): EventEnvelope[] {
    const floor = from ?? 0;
    return this.index.filter(envelope => envelope.seq > floor);
  }

  /** Subscribe before collecting history; one synchronous, race-free block. */
  subscribe(push: Notify, from?: number): EventLogSubscription {
    if (this.failure) throw this.failure;
    this.listeners.add(push);
    let history: EventEnvelope[] = [];
    if (this.loaded) {
      // Snapshot only after registration so no commit can fall in between.
      history = this.read(from);
    }
    return {
      history,
      close: (): void => { this.listeners.delete(push); },
    };
  }

  /** Serialized append: seq/t/at derivation, durability, index, then notify. */
  append(event: TownEvent, over: AppendOptions = {}): Promise<EventEnvelope> {
    if (this.failure) return Promise.reject(this.failure);
    const run = this.queue.then(() => this.commit(event, over));
    this.queue = run.catch(() => undefined);
    return run;
  }

  appendWithTime(event: TownEvent, opts: AppendOptions): Promise<EventEnvelope> {
    return this.append(event, opts);
  }

  private async commit(event: TownEvent, over: AppendOptions): Promise<EventEnvelope> {
    const previous = this.index[this.index.length - 1];
    const seq = this.index.length + 1;
    const elapsed = Math.max(this.now() - this.createdAt, 0);
    const t = previous ? Math.max(previous.t + 1, over.t ?? elapsed) : (over.t ?? 0);
    const at = over.at ?? new Date(this.createdAt + t).toISOString();
    const envelope = {
      v: 1 as const,
      runId: this.runId,
      seq,
      t,
      at,
      type: event.type,
      data: event.data,
    } as EventEnvelope;
    if (!Number.isFinite(Date.parse(envelope.at))) throw new Error(`Event stamp is not ISO: ${envelope.at}`);
    this.enforceShape(envelope);
    await this.saver(JSON.stringify(envelope));
    this.index.push(envelope);
    this.notify(envelope);
    return envelope;
  }

  private notify(envelope: EventEnvelope): void {
    for (const push of [...this.listeners]) {
      try {
        push(envelope);
      } catch {
        // A subscriber must never break durability or the other listeners.
      }
    }
  }

  private enforceShape(envelope: EventEnvelope): void {
    if (!this.assert) return;
    const parsed = EventEnvelopeSchema.safeParse(envelope);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      throw new Error(`Event ${envelope.type} at seq ${envelope.seq} violates contracts: ${issues}`);
    }
  }
}

/** Parse one persisted line; only a torn final write returns null (repairable). */
function parsePersistedLine(line: string, lineNo: number, runId: string, suspiciousTail: boolean): EventEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    if (!suspiciousTail) throw corrupt(runId, lineNo, 'invalid JSON.');
    return null; // torn tail: truncated once at the end of load()
  }
  const checked = EventEnvelopeSchema.safeParse(parsed);
  if (!checked.success) {
    const issues = checked.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    if (!suspiciousTail) throw corrupt(runId, lineNo, `contract violation (${issues}).`);
    return null;
  }
  const envelope = checked.data as unknown as EventEnvelope;
  if (envelope.runId !== runId) throw corrupt(runId, lineNo, `foreign run identity ${JSON.stringify(envelope.runId)}.`);
  return envelope;
}

/** File-backed log factory at `runs/<id>/events.jsonl` (PRD §9.4). */
export function createEventLog(runId: string, options: EventLogOptions = {}): FileEventLog {
  return new FileEventLog(runId, options);
}

/** Open helper: awaits disk reload so history is complete before first use. */
export async function openEventLog(runId: string, options: EventLogOptions = {}): Promise<FileEventLog> {
  const log = createEventLog(runId, options);
  await log.load();
  return log;
}
