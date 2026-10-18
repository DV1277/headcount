// CREAO agents (Scout / Maker / Herald).
// Notes: runs take MINUTES (design for async); the app path has NO token streaming;
// every run spends credits; keys stay server-side only.
import { env, request, requireEnv } from "./_http.mjs";

const base = () => (env("CREAO_BASE_URL") || "https://developer.creao.ai/v1").replace(/\/+$/, "");
const auth = () => ({ Authorization: `Bearer ${env("CREAO_API_KEY")}` });
const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export const isConfigured = () => Boolean(env("CREAO_API_KEY"));

export async function ping() {
  requireEnv("CREAO_API_KEY");
  await request(`${base()}/runs`, { headers: auth() });
  return { ok: true, detail: "runs endpoint reachable" };
}

/** Start a run on a saved agent. Returns 202 body: {run_id, status, agent_id, conversation_id}. */
export async function createRun(agentId, input, { webhookUrl } = {}) {
  requireEnv("CREAO_API_KEY");
  const body = { agent_id: agentId, input };
  if (webhookUrl) body.webhook_url = webhookUrl;
  return request(`${base()}/runs`, { method: "POST", headers: auth(), json: body });
}

export async function getRun(runId) {
  requireEnv("CREAO_API_KEY");
  return request(`${base()}/runs/${encodeURIComponent(runId)}`, { headers: auth() });
}

/** Poll until completed | failed | cancelled. onTick(run) fires after every poll. */
export async function waitForRun(runId, { intervalMs = 5000, timeoutMs = 15 * 60_000, onTick, signal } = {}) {
  return poll(() => getRun(runId), runId, { intervalMs, timeoutMs, onTick, signal });
}

/**
 * Realtime run on a saved agent (developer path). Returns the raw Response; the body is an
 * NDJSON stream. The caller must consume it and is responsible for aborting via `signal`
 * (there is no server-side cancel endpoint). Long-lived: no internal timeout.
 */
export async function createRealtimeRun(agentId, input, { signal } = {}) {
  requireEnv("CREAO_API_KEY");
  return request(`${base()}/realtime/runs`, {
    method: "POST",
    headers: auth(),
    json: { agent_id: agentId, input },
    parse: "response",
    timeoutMs: 0,
    signal,
  });
}

// ---- App-scoped path (per-agent capi_ key) ----
const appBase = () => `https://agent.creao.ai/api/v1/apps/${encodeURIComponent(env("CREAO_APP_ID"))}/runs`;
const appAuth = () => ({ Authorization: `Bearer ${env("CREAO_APP_KEY")}` });

export async function createAppRun(inputs) {
  requireEnv("CREAO_APP_KEY", "CREAO_APP_ID");
  return request(appBase(), { method: "POST", headers: appAuth(), json: { inputs } });
}

export async function getAppRun(runId) {
  requireEnv("CREAO_APP_KEY", "CREAO_APP_ID");
  return request(`${appBase()}/${encodeURIComponent(runId)}`, { headers: appAuth() });
}

export async function waitForAppRun(runId, { intervalMs = 5000, timeoutMs = 15 * 60_000, onTick } = {}) {
  return poll(() => getAppRun(runId), runId, { intervalMs, timeoutMs, onTick });
}

async function poll(fetchRun, runId, { intervalMs, timeoutMs, onTick }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const run = await fetchRun();
    onTick?.(run);
    if (TERMINAL.has(run?.status)) return run;
    if (Date.now() + intervalMs > deadline) throw new Error(`CREAO run ${runId} timed out after ${timeoutMs}ms (last status: ${run?.status})`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
