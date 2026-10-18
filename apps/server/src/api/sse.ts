/**
 * O3 — `GET /api/runs/:id/events` (§8.7, HC-F-180): Server-Sent Events with a
 * race-free history/live handoff.
 *
 * Ordering: the run's subscriber is registered first (`manager.subscribe`
 * contract), events pushed during the await are buffered, the history
 * snapshot is written once the subscription resolves, and only then is the
 * live queue flushed — in order, one frame per event. Every frame carries its
 * full prefix (`id:`/`event:`/`data:`) in a single write, so no event can hit
 * the wire before its prefix. Backpressure pauses the flush; the 15 s
 * heartbeat keeps proxies from closing idle streams. Disconnect (including
 * during the subscribe await) unsubscribes and clears the heartbeat.
 */
import type { Request, Response } from 'express';
import type { EventEnvelope } from '@hc/contracts';
import type { RunManager } from '../runtime/manager';

/** §8.7: heartbeat comment every 15 s. */
export const SSE_HEARTBEAT_MS = 15_000;

/**
 * Nonnegative-integer cursor parser. `undefined` = not provided, `null` =
 * provided but invalid, number = cursor (bounded to a safe integer).
 * An empty or non-scalar value counts as absent/invalid respectively.
 */
export function parseCursor(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') return null;
  return /^\d{1,15}$/.test(value) ? Number(value) : null;
}

type Frame = (envelope: EventEnvelope) => void;

/**
 * Stream the run's events to `res`. Throws only before SSE headers are sent
 * (e.g. unknown run) so the router can answer with its normal JSON error.
 */
export async function streamEvents(
  req: Request,
  res: Response,
  manager: RunManager,
  runId: string,
  heartbeatMs: number = SSE_HEARTBEAT_MS,
): Promise<void> {
  const headerCursor = parseCursor(req.get('last-event-id'));
  const queryCursor = parseCursor(req.query.from);
  if (headerCursor === null || queryCursor === null) {
    res.status(400).json({ error: { code: 'bad_cursor', message: 'Query from and Last-Event-ID must be nonnegative integers.' } });
    return;
  }
  const from = headerCursor ?? queryCursor ?? 0;

  const live: EventEnvelope[] = [];
  let started = false;
  let paused = false;
  let closed = false;
  let closeSubscription: () => void = () => undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    if (heartbeat) { clearInterval(heartbeat); heartbeat = undefined; }
    live.length = 0;
    closeSubscription();
  };
  // Swallow socket errors (client aborts) — cleanup handles the rest.
  res.on('error', () => undefined);
  req.on('error', () => undefined);
  req.once('close', cleanup);
  res.once('close', cleanup);

  const subscription = await manager.subscribe(runId, (envelope): void => {
    if (closed) return;
    live.push(envelope);
    flush();
  }, from);
  if (closed) { subscription.close(); return; } // disconnect during the await
  closeSubscription = subscription.close;

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.flushHeaders();

  // History first. Purely synchronous, so no listener callback can interleave.
  for (const envelope of subscription.history) {
    if (closed) return;
    res.write(frame(envelope)); // history is bounded; backpressure tolerated
  }

  // Then everything buffered while the subscription opened, then live.
  started = true;
  flush();

  heartbeat = setInterval(() => {
    if (closed) return;
    res.write(`: hb ${Date.now()}\n\n`);
  }, heartbeatMs);

  function frame(envelope: EventEnvelope): string {
    return `id: ${envelope.seq}\nevent: town\ndata: ${JSON.stringify(envelope)}\n\n`;
  }

  function flush(): void {
    if (paused || closed || !started) return;
    while (live.length > 0) {
      const envelope = live.shift() as EventEnvelope;
      if (!res.write(frame(envelope))) {
        paused = true;
        res.once('drain', () => { paused = false; flush(); });
        break;
      }
    }
  }
}
