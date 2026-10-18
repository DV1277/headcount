// Cognition Devin API v3 (service-user key, prefix cog_).
import { env, request, requireEnv } from "./_http.mjs";

const url = () => `https://api.devin.ai/v3/organizations/${encodeURIComponent(env("DEVIN_ORG_ID"))}/sessions`;
const auth = () => ({ Authorization: `Bearer ${env("DEVIN_API_KEY")}` });

export const isConfigured = () => Boolean(env("DEVIN_API_KEY") && env("DEVIN_ORG_ID"));

export async function ping() {
  requireEnv("DEVIN_API_KEY", "DEVIN_ORG_ID");
  const data = await request(url(), { headers: auth() });
  const list = Array.isArray(data) ? data : data?.sessions ?? data?.items;
  return { ok: true, detail: Array.isArray(list) ? `${list.length} sessions listed` : "sessions endpoint ok" };
}

export async function createSession(prompt, opts = {}) {
  requireEnv("DEVIN_API_KEY", "DEVIN_ORG_ID");
  return request(url(), { method: "POST", headers: auth(), json: { prompt, ...opts } });
}

export async function sendMessage(sessionId, message) {
  requireEnv("DEVIN_API_KEY", "DEVIN_ORG_ID");
  return request(`${url()}/${encodeURIComponent(sessionId)}/messages`, { method: "POST", headers: auth(), json: { message } });
}
