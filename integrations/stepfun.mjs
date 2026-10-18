// StepFun Step 5 Preview (the Mayor). OpenAI-compatible API.
import { HttpError, env, request, requireEnv } from "./_http.mjs";

const base = () => (env("STEPFUN_BASE_URL") || "https://api.stepfun.ai/v1").replace(/\/+$/, "");
const model = () => env("STEPFUN_MODEL") || "step-5-preview";
const auth = () => ({ Authorization: `Bearer ${env("STEPFUN_API_KEY")}` });

export const isConfigured = () => Boolean(env("STEPFUN_API_KEY"));

export async function ping() {
  requireEnv("STEPFUN_API_KEY");
  const data = await request(`${base()}/models`, { headers: auth() });
  const ids = (data?.data ?? []).map((m) => m.id);
  const found = ids.includes(model());
  return {
    ok: true,
    detail: found ? `model ${model()} available (${ids.length} models)` : `auth ok, but model ${model()} not in list (${ids.length} models)`,
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Normalize an OpenAI-compatible usage object to {tokensIn, tokensOut, cachedIn?}. */
function normalizeUsage(usage) {
  const u = usage ?? {};
  const details = u.prompt_tokens_details ?? {};
  const cached = u.cached_tokens ?? details.cached_tokens;
  const out = { tokensIn: u.prompt_tokens ?? 0, tokensOut: u.completion_tokens ?? 0 };
  if (Number.isFinite(cached) && cached > 0) out.cachedIn = cached;
  return out;
}

function pickResponseFormats(json) {
  if (json && typeof json === "object") {
    // JSON schema first ({name,schema,strict}); fall back to plain json_object if unsupported.
    const json_schema = json.json_schema?.schema ?? json.schema;
    const name = json.json_schema?.name ?? json.name ?? "payload";
    return [
      { type: "json_schema", json_schema: { name, schema: json_schema, strict: json.strict !== false } },
      { type: "json_object" },
    ];
  }
  return json ? [{ type: "json_object" }] : [null];
}

/**
 * Chat completion with full control. Returns { message, usage, raw, fallbackToJsonObject }.
 * opts:
 *   json: true -> response_format json_object. Or {name,schema} -> json_schema, with a json_object
 *          fallback attempt if the endpoint rejects response_format/json_schema.
 *   tools, timeoutMs (default 60s), signal (external, respected, not part of the request body),
 *   retries (default 2) for 429/5xx with 0.5s/1.5s backoff, reasoningEffort ('low'|'medium'|'high'),
 *   ...anything else merges into the request body (top_p, max_tokens, user, ...).
 */
export async function chatRaw(messages, { json = false, tools, timeoutMs = 60_000, signal, retries = 2, reasoningEffort, ...bodyOpts } = {}) {
  requireEnv("STEPFUN_API_KEY");
  const formats = pickResponseFormats(json);
  let usedFallback = false;
  for (let f = 0; f < formats.length; f++) {
    const schemaAttempt = formats[f]?.type === "json_schema";
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal?.aborted) {
        const err = new Error("aborted before request");
        err.name = "AbortError";
        throw err;
      }
      const body = { model: model(), messages, ...bodyOpts };
      if (formats[f]) body.response_format = formats[f];
      if (tools) body.tools = tools;
      if (reasoningEffort) body.reasoning_effort = reasoningEffort;
      try {
        const data = await request(`${base()}/chat/completions`, {
          method: "POST",
          headers: auth(),
          json: body,
          timeoutMs,
          signal,
        });
        const message = data?.choices?.[0]?.message;
        if (!message) throw new Error("StepFun returned no choices");
        return { message, usage: normalizeUsage(data?.usage), raw: data, fallbackToJsonObject: usedFallback };
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        // context / format rejections (4xx): try the next response_format instead of retrying
        if (schemaAttempt && f + 1 < formats.length && err instanceof HttpError && err.status && err.status < 500 && /response_format|json_schema/i.test(err.message || "")) {
          usedFallback = true;
          break;
        }
        if (attempt < retries && err instanceof HttpError && (err.status === 429 || (err.status >= 500 && err.status < 600))) {
          await wait([500, 1500][attempt] ?? 4000);
          continue;
        }
        throw err;
      }
    }
  }
  throw new Error("StepFun exhausted response formats without a response");
}

/**
 * Chat completion. Returns the parsed choice message ({role, content, tool_calls?}).
 * opts: { json: true } sets response_format json_object; { tools } passes function tools; other opts merge into the body.
 */
export async function chat(messages, opts = {}) {
  const { message } = await chatRaw(messages, opts);
  return message;
}
