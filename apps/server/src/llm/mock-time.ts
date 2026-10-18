// Shared mock timing (A-01/HC-F-046): realistic delays divided by HC_MOCK_SPEED, abort-aware.
// Used by the mock Mayor and the mock workers so both stay deterministic and cancellable.

/** HC_MOCK_SPEED from the environment, at call time. Non-finite/non-positive values fall back to 1. */
export function mockSpeed(): number {
  const raw = Number(process.env.HC_MOCK_SPEED);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/** Divide a real-time delay by HC_MOCK_SPEED, floored at 0. */
export function mockDelay(baseMs: number): number {
  return Math.max(baseMs / mockSpeed(), 0);
}

/** Abort-aware sleep: resolves early when the signal aborts, never rejects. */
export function mockDelayMs(baseMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const ms = mockDelay(baseMs);
    if (ms === 0) return resolve();
    if (signal?.aborted) return resolve();
    const startedAt = Date.now();
    const tick = setInterval(() => {
      if (signal?.aborted || Date.now() - startedAt >= ms) {
        clearInterval(tick);
        resolve();
      }
    }, Math.max(Math.min(ms / 8, 50), 4));
  });
}

/** Abort-aware sleep over an ALREADY-scaled duration (callers like the mock worker build
 * schedules in scaled milliseconds; mockDelayMs would divide them a second time). */
export function sleepScaled(scaledMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const ms = Math.max(scaledMs, 0);
    if (ms === 0) return resolve();
    if (signal?.aborted) return resolve();
    const startedAt = Date.now();
    const tick = setInterval(() => {
      if (signal?.aborted || Date.now() - startedAt >= ms) {
        clearInterval(tick);
        resolve();
      }
    }, Math.max(Math.min(ms / 8, 50), 4));
  });
}

/** True once elapsed >= ms (abort-aware timing without timers). */
export function mockElapsed(since: number, baseMs: number, signal?: AbortSignal): boolean {
  return signal?.aborted === true || Date.now() - since >= mockDelay(baseMs);
}
