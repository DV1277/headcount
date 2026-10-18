// Browser Use Cloud. Auth header is X-Browser-Use-API-Key (NOT Bearer).
//
// Agent tasks: use the official `browser-use-sdk` v4 rather than raw HTTP; the exact v4 runs
// path is not verified here:
//   import { BrowserUse } from "browser-use-sdk/v4";
//   const client = new BrowserUse({ apiKey });
//   const run = await client.runs.create({ task });
//   const done = await client.runs.waitForCompletion(run.id);
import { env, request, requireEnv } from "./_http.mjs";

const API = "https://api.browser-use.com/api";
const auth = () => ({ "X-Browser-Use-API-Key": env("BROWSER_USE_API_KEY") });

export const isConfigured = () => Boolean(env("BROWSER_USE_API_KEY"));

export async function ping() {
  requireEnv("BROWSER_USE_API_KEY");
  const data = await request(`${API}/v2/billing/account`, { headers: auth() });
  const parts = [];
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      if (/credit|balance|concurrent/i.test(k) && (typeof v === "number" || typeof v === "string")) parts.push(`${k}=${v}`);
    }
  }
  return { ok: true, detail: parts.length ? parts.join(", ") : "account ok" };
}

/** Start a cloud browser. Returns {id, liveUrl, ...}. timeout is in minutes. */
export async function startBrowser({ timeout = 5 } = {}) {
  requireEnv("BROWSER_USE_API_KEY");
  return request(`${API}/v4/browsers`, { method: "POST", headers: auth(), json: { timeout } });
}

export async function stopBrowser(id) {
  requireEnv("BROWSER_USE_API_KEY");
  return request(`${API}/v4/browsers/${encodeURIComponent(id)}`, { method: "PATCH", headers: auth(), json: { action: "stop" } });
}
