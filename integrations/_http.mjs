// Shared fetch helper: 15s timeout, uniform errors (status + first 200 chars of body).

export class HttpError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

/** Mask a secret for display: first 6 chars + "…". */
export function mask(value) {
  if (!value) return "";
  return value.slice(0, 6) + "…";
}

export function env(name) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : "";
}

export function requireEnv(...names) {
  const missing = names.filter((n) => !env(n));
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);
}

/**
 * fetch + timeout + error handling.
 * Returns the Response on 2xx. Throws HttpError otherwise (message includes status and body[0:200]).
 * Use `json` to send a JSON body. Use `parse: "json" | "arrayBuffer" | "text" | "response"` to control the return value.
 * An external `signal` is COMBINED with the internal timeout (AbortSignal.any); when only the external
 * signal aborts, the original AbortError is rethrown unchanged so callers can detect user cancellation
 * (`signal.aborted`). `timeoutMs <= 0` disables the internal timeout (long-lived streams must pair it
 * with an external signal or their own watchdog).
 */
export async function request(url, { method = "GET", headers = {}, json, body, timeoutMs = 15_000, parse = "json", signal } = {}) {
  const internal = Number.isFinite(timeoutMs) && timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  const combined = signal && internal ? AbortSignal.any([signal, internal]) : (signal ?? internal);
  const init = { method, headers: { ...headers }, signal: combined };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers["Content-Type"] = "application/json";
  } else if (body !== undefined) {
    init.body = body;
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (signal?.aborted && (err?.name === "AbortError" || err?.name === "TimeoutError" || err?.code?.startsWith?.("UND_ERR"))) {
      throw err;
    }
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new HttpError(`${method} ${url} timed out after ${timeoutMs}ms`);
    }
    throw new HttpError(`${method} ${url} failed: ${err?.cause?.code || err?.message || err}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const snippet = text.slice(0, 200);
    throw new HttpError(`${method} ${url} -> ${res.status}${snippet ? `: ${snippet}` : ""}`, {
      status: res.status,
      body: text,
    });
  }

  switch (parse) {
    case "response":
      return res;
    case "arrayBuffer":
      return res.arrayBuffer();
    case "text":
      return res.text();
    default: {
      const text = await res.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw new HttpError(`${method} ${url} -> ${res.status} but body was not JSON: ${text.slice(0, 200)}`, {
          status: res.status,
          body: text,
        });
      }
    }
  }
}
