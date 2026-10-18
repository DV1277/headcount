import { afterEach, describe, expect, it } from 'vitest';
import { estimateUsd, normalizeUsage, payrollTick, spendRates, type SpendRates } from './index';

const stubRates = (rates: Partial<SpendRates>): void => {
  process.env.CREAO_CREDIT_USD = String(rates.creoCreditUsd ?? 0.10);
  process.env.STEPFUN_USD_PER_M_IN = String(rates.stepUsdPerMIn ?? 1.00);
  process.env.STEPFUN_USD_PER_M_OUT = String(rates.stepUsdPerMOut ?? 2.70);
  process.env.STEPFUN_USD_PER_M_CACHED = String(rates.stepUsdPerMCached ?? 0.10);
};

afterEach(() => {
  delete process.env.CREAO_CREDIT_USD;
  delete process.env.STEPFUN_USD_PER_M_IN;
  delete process.env.STEPFUN_USD_PER_M_OUT;
  delete process.env.STEPFUN_USD_PER_M_CACHED;
});

describe('estimateUsd (§12.5)', () => {
  it('charges cached input exactly once at the cached rate', () => {
    stubRates({});
    // 900k fresh input + 100k cached + 50k output: cached is a subset of input.
    const usd = estimateUsd({ tokensIn: 1_000_000, tokensOut: 50_000, cachedIn: 100_000 });
    expect(usd).toBe(0.9 + 0.01 + 0.135);
  });

  it('equals the uncached price when cachedIn is zero', () => {
    stubRates({ stepUsdPerMIn: 1, stepUsdPerMOut: 2, stepUsdPerMCached: 0.1 });
    const same = estimateUsd({ tokensIn: 500, tokensOut: 20, cachedIn: 0 });
    const plain = estimateUsd({ tokensIn: 500, tokensOut: 20 });
    expect(same).toBe(plain);
  });

  it('clamps cachedIn into [0, tokensIn] so an over-report cannot double-charge', () => {
    stubRates({});
    const clamped = estimateUsd({ tokensIn: 100_000, tokensOut: 0, cachedIn: 1_000_000 });
    // cached portion capped at tokensIn: everything cached, zero fresh input.
    expect(clamped).toBe(0.01);
    const negative = estimateUsd({ tokensIn: 100_000, tokensOut: 0, cachedIn: -50 });
    expect(negative).toBe(0.1);
  });

  it('converts CREAO credits and ignores cached math on the credits path', () => {
    stubRates({ creoCreditUsd: 0.15 });
    expect(estimateUsd({ credits: 12 })).toBe(1.8);
    expect(estimateUsd({ credits: 3, tokensIn: 99e6, cachedIn: 99e6 })).toBe(0.45);
  });

  it('treats a missing or broken report as zero spend, matching mock workers', () => {
    stubRates({});
    expect(estimateUsd({})).toBe(0);
    expect(estimateUsd({ tokensIn: 0, tokensOut: 0, cachedIn: 0 })).toBe(0);
    expect(estimateUsd({ tokensIn: NaN, tokensOut: Infinity, cachedIn: -5 })).toBe(0);
  });
});

describe('normalizeUsage', () => {
  it('floors fractional tokens and clamps negatives', () => {
    expect(normalizeUsage({ tokensIn: 12.5, tokensOut: -3, credits: -1, usd: -0.5 })).toEqual({
      credits: 0, tokensIn: 12, tokensOut: 0, usd: 0,
    });
  });

  it('derives usd from §12.5 rates only when the report omits it', () => {
    stubRates({});
    expect(normalizeUsage({ tokensIn: 1_000_000, tokensOut: 1_000_000 }).usd).toBe(1 + 2.7);
    expect(normalizeUsage({ tokensIn: 5, usd: 0.5 }).usd).toBe(0.5);
  });
});

describe('payrollTick', () => {
  type TickEvent = Extract<ReturnType<typeof payrollTick>, { type: 'payroll.tick' }>;
  const tickEvent = (event: ReturnType<typeof payrollTick>): TickEvent => {
    if (event.type !== 'payroll.tick') throw new Error(`expected payroll.tick, got ${event.type}`);
    return event;
  };

  it('emits a contract-shaped payroll.tick with real usage', () => {
    stubRates({});
    const event = payrollTick('mayor', { tokensIn: 1_000_000, tokensOut: 100_000, cachedIn: 200_000 });
    expect(event).toEqual({
      type: 'payroll.tick',
      data: { agent: 'mayor', tokensIn: 1_000_000, tokensOut: 100_000, usd: 0.8 + 0.02 + 0.27 },
    });
  });

  it('keeps mock reports at zero spend and passes explicit totals through', () => {
    stubRates({});
    expect(tickEvent(payrollTick('scout', {})).data.usd).toBe(0);
    expect(tickEvent(payrollTick('herald', { credits: 7 })).data).toEqual({ agent: 'herald', credits: 7, usd: 0.700000 });
  });

  it('always produces nonnegative fields so envelopes stay schema-valid', () => {
    stubRates({});
    const event = tickEvent(payrollTick('maker', { tokensIn: -100, tokensOut: -1, credits: -2 }));
    expect(event.data.usd).toBe(0);
    const rates = spendRates();
    expect(rates.creoCreditUsd).toBe(0.1);
  });
});
