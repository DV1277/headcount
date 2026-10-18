// Typed StepFun adapter (A-02): thin, strict wrapper over integrations/stepfun.mjs.
// Retries, json_schema->json_object fallback and body hygiene live in the .mjs client;
// here we add the typed surface, deadlines and usage accounting used by the Mayor.
import { stepfun } from '../../../../integrations/index.mjs';
import type { Usage } from '../mayor';

export type Completion = { message: { role: string; content: string }; usage: Usage };
export type JsonFormat = { name: string; schema: Record<string, unknown>; strict?: boolean };
export type ChatOptions = {
  json?: boolean | JsonFormat;
  timeoutMs?: number;
  signal?: AbortSignal;
  retries?: number;
  reasoningEffort?: 'low' | 'medium';
  maxTokens?: number;
  temperature?: number;
};

export const PLAN_TIMEOUT_MS = 60_000;
export const CALL_TIMEOUT_MS = 60_000;
export const SAY_TIMEOUT_MS = 30_000;

export function addUsage(...parts: (Usage | undefined)[]): Usage {
  const out: Usage = { tokensIn: 0, tokensOut: 0 };
  let cached = 0;
  for (const p of parts) {
    if (!p) continue;
    out.tokensIn += p.tokensIn ?? 0;
    out.tokensOut += p.tokensOut ?? 0;
    cached += p.cachedIn ?? 0;
  }
  if (cached > 0) out.cachedIn = cached;
  return out;
}

/** chatRaw always returns a message + usage; content is never null on schema calls (mayor guards this). */
export async function chatRaw(messages: { role: string; content: string }[], opts: ChatOptions = {}): Promise<Completion> {
  const { maxTokens, temperature, ...rest } = opts;
  const payload: Record<string, unknown> = { ...rest };
  if (maxTokens !== undefined) payload.max_tokens = maxTokens;
  if (temperature !== undefined) payload.temperature = temperature;
  const res = await stepfun.chatRaw(messages, { retries: 2, ...payload });
  const content = typeof res.message?.content === 'string' ? res.message.content : JSON.stringify(res.message?.content ?? '');
  const cachedIn = res.usage?.cachedIn;
  const base = { tokensIn: res.usage?.tokensIn ?? 0, tokensOut: res.usage?.tokensOut ?? 0 };
  return { message: { role: String(res.message?.role ?? 'assistant'), content }, usage: cachedIn ? { ...base, cachedIn } : base };
}

/** Text call for human-facing lines; callers cap and vet the result. */
export async function chatText(messages: { role: string; content: string }[], opts: ChatOptions = {}): Promise<string> {
  const { message } = await chatRaw(messages, opts);
  return message.content;
}
