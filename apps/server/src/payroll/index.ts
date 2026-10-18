import type { AgentId, TownEvent } from '@hc/contracts';

export type TickUsage = { credits?: number; tokensIn?: number; tokensOut?: number; cachedIn?: number; usd?: number };

/** Securely parse one numeric environment variable; falls back to the default. */
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export type SpendRates = {
  creoCreditUsd: number;
  stepUsdPerMIn: number;
  stepUsdPerMOut: number;
  stepUsdPerMCached: number;
};

/** §8.9 rates, read live so tests can stub the environment. */
export function spendRates(): SpendRates {
  return {
    creoCreditUsd: envNumber('CREAO_CREDIT_USD', 0.10),
    stepUsdPerMIn: envNumber('STEPFUN_USD_PER_M_IN', 1.00),
    stepUsdPerMOut: envNumber('STEPFUN_USD_PER_M_OUT', 2.70),
    stepUsdPerMCached: envNumber('STEPFUN_USD_PER_M_CACHED', 0.10),
  };
}

/**
 * CREAO spend converts from credits; StepFun spend converts from token counts
 * (§12.5). `cachedIn` is a subset of `tokensIn` (the prompt prefix served from
 * the cache), so uncached input is charged at the full input rate and only the
 * cached portion at the cheaper cached rate — never both (no double charge).
 */
export function estimateUsd(usage: TickUsage): number {
  const rates = spendRates();
  if (usage.credits !== undefined && usage.credits !== null) return round6(clamp0(usage.credits) * rates.creoCreditUsd);
  const tokensIn = clamp0(usage.tokensIn ?? 0);
  const tokensOut = clamp0(usage.tokensOut ?? 0);
  const cachedIn = Math.min(clamp0(usage.cachedIn ?? 0), tokensIn);
  const usd = ((tokensIn - cachedIn) * rates.stepUsdPerMIn
    + cachedIn * rates.stepUsdPerMCached
    + tokensOut * rates.stepUsdPerMOut) / 1_000_000;
  return round6(usd);
}

const clamp0 = (value: number): number => Number.isFinite(value) ? Math.max(value, 0) : 0;

/** Normalize a usage report; mock workers and zero reports produce zero spend. */
export function normalizeUsage(usage: TickUsage): Required<Pick<TickUsage, 'usd'>> & Pick<TickUsage, 'credits' | 'tokensIn' | 'tokensOut'> {
  return {
    ...(usage.credits !== undefined && usage.credits !== null ? { credits: clamp0(usage.credits) } : {}),
    ...(usage.tokensIn !== undefined ? { tokensIn: clamp0(Math.floor(usage.tokensIn)) } : {}),
    ...(usage.tokensOut !== undefined ? { tokensOut: clamp0(Math.floor(usage.tokensOut)) } : {}),
    usd: usage.usd !== undefined ? clamp0(usage.usd) : estimateUsd(usage),
  };
}

const round6 = (value: number): number => Number(value.toFixed(6));

/**
 * O3 S-06 payroll ledger. One `payroll.tick` event per agent usage report; the
 * USD estimate comes from §12.5 rates via `estimateUsd`; CREAO USD stays "est."
 * until Q-001 resolves. Fields are normalized so the emitted event always
 * satisfies the `payroll.tick` contract (nonnegative numbers).
 */
export function payrollTick(agent: AgentId, usage: TickUsage): TownEvent {
  const normalized = normalizeUsage(usage);
  const event: TownEvent = {
    type: 'payroll.tick',
    data: {
      agent,
      ...normalized,
    },
  };
  return event;
}
