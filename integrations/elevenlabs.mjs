// ElevenLabs. Auth header is xi-api-key.
import { HttpError, env, request, requireEnv } from "./_http.mjs";

const API = "https://api.elevenlabs.io/v1";
const auth = () => ({ "xi-api-key": env("ELEVENLABS_API_KEY") });

export const isConfigured = () => Boolean(env("ELEVENLABS_API_KEY"));

export async function ping() {
  requireEnv("ELEVENLABS_API_KEY");
  try {
    const d = await request(`${API}/user/subscription`, { headers: auth() });
    return { ok: true, detail: `tier=${d?.tier ?? "?"}, chars ${d?.character_count ?? "?"}/${d?.character_limit ?? "?"}` };
  } catch (err) {
    if (err instanceof HttpError && err.status === 401 && /permission|scope|user_read|missing/i.test(err.body || "")) {
      return { ok: true, detail: "key valid? missing user_read scope (TTS may still work)" };
    }
    throw err;
  }
}

/** Text to speech. Returns an ArrayBuffer of mp3 audio. */
export async function tts(text, { voiceId = env("ELEVENLABS_VOICE_ID"), modelId = "eleven_multilingual_v2" } = {}) {
  requireEnv("ELEVENLABS_API_KEY");
  if (!voiceId) throw new Error("No voiceId: pass one or set ELEVENLABS_VOICE_ID");
  return request(`${API}/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: { ...auth(), Accept: "audio/mpeg" },
    json: { text, model_id: modelId },
    parse: "arrayBuffer",
    timeoutMs: 60_000,
  });
}
