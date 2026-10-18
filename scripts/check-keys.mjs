// Pings every sponsor API in parallel and prints a status table.
// Run via `npm run check` (loads .env). `--deep` also does one real StepFun chat call.
import { existsSync } from "node:fs";
import * as stepfun from "../integrations/stepfun.mjs";
import * as creao from "../integrations/creao.mjs";
import * as browserUse from "../integrations/browser-use.mjs";
import * as devin from "../integrations/devin.mjs";
import * as elevenlabs from "../integrations/elevenlabs.mjs";

const deep = process.argv.includes("--deep");
const appMode=(process.env.CREAO_API_MODE||'app')==='app';
const appConfig=role=>({id:process.env[`CREAO_${role}_APP_ID`]?.trim(),key:process.env[`CREAO_${role}_APP_KEY`]?.trim()||process.env.CREAO_APP_KEY?.trim()||process.env.CREAO_API_KEY?.trim()});
const appRoles=['SCOUT','MAKER','HERALD'];
const creaoCheck=appMode?{
  isConfigured:()=>appRoles.every(role=>{const {id,key}=appConfig(role);return id&&key?.startsWith('capi_');}),
  ping:async()=>{
    const results=await Promise.all(appRoles.map(async role=>{
      const {id,key}=appConfig(role);
      const response=await fetch(`https://agent.creao.ai/api/v1/apps/${encodeURIComponent(id)}/runs?limit=1`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(5000),redirect:'error'});
      if(!response.ok)throw new Error(`${role} app-trigger authentication failed (HTTP ${response.status}).`);
      const body=await response.json();
      if(!Array.isArray(body?.runs))throw new Error(`${role} app-trigger returned an invalid run list.`);
      return role;
    }));
    return {ok:results.length===3,detail:'three saved app triggers reachable (read-only; no runs started)'};
  },
}:creao;

const services = [
  { name: "StepFun", env: "STEPFUN_API_KEY", mod: stepfun },
  { name: "CREAO", env: appMode?"CREAO_<ROLE>_APP_ID and app-trigger key":"CREAO_API_KEY", mod: creaoCheck },
  { name: "Browser Use", env: "BROWSER_USE_API_KEY", mod: browserUse },
  { name: "Devin", env: "DEVIN_API_KEY, DEVIN_ORG_ID", mod: devin },
  { name: "ElevenLabs", env: "ELEVENLABS_API_KEY", mod: elevenlabs },
];

const OK = "✅ ok";
const MISSING = "⚠️  missing";
const FAILED = "❌ failed";

async function run(s) {
  if (!s.mod.isConfigured()) return { ...s, status: MISSING, detail: `set ${s.env} in .env (npm run keys)` };
  try {
    const r = await s.mod.ping();
    return { ...s, status: r.ok ? OK : FAILED, detail: r.detail ?? "", failed: !r.ok };
  } catch (err) {
    return { ...s, status: FAILED, detail: String(err.message ?? err).slice(0, 200), failed: true };
  }
}

const rows = await Promise.all(services.map(run));

// Paper: desktop app + MCP (project .mcp.json points at its local endpoint, live while a file is open).
const paperApp = existsSync("/Applications/Paper.app");
const paperMcp = await fetch("http://127.0.0.1:29979/mcp", { method: "GET", signal: AbortSignal.timeout(1500) })
  .then(() => true)
  .catch(() => false);
rows.push({
  name: "Paper",
  env: "-",
  status: paperApp ? OK : MISSING,
  detail: !paperApp
    ? "install Paper Desktop"
    : paperMcp
      ? "app installed, MCP live at 127.0.0.1:29979"
      : "app installed; MCP offline (open a file in Paper Desktop)",
});
rows.push({ name: "Workday", env: "-", status: "ℹ️  n/a", detail: "no API — challenge brief in docs/SPONSORS.md" });

const header = ["service", "env", "status", "detail"];
const table = [header, ...rows.map((r) => [r.name, r.env, r.status, r.detail])];
// Emoji widths vary by terminal; pad on the first three columns using string length as a best effort.
const widths = header.map((_, i) => Math.max(...table.map((row) => [...row[i]].length)));
const fmt = (row) => row.map((c, i) => (i === row.length - 1 ? c : c + " ".repeat(widths[i] - [...c].length))).join("  |  ");
console.log(fmt(header));
console.log(widths.slice(0, -1).map((w) => "-".repeat(w)).join("--+--") + "--+--" + "-".repeat(20));
for (const row of table.slice(1)) console.log(fmt(row));

let failed = rows.some((r) => r.failed);

if (deep) {
  console.log("\n--deep: StepFun chat call");
  if (!stepfun.isConfigured()) {
    console.log("  skipped (STEPFUN_API_KEY missing)");
  } else {
    try {
      const msg = await stepfun.chat([{ role: "user", content: "Reply with the single word: ready" }], { max_tokens: 20 });
      console.log(`  reply: ${JSON.stringify(msg.content)}`);
    } catch (err) {
      failed = true;
      console.log(`  ❌ ${String(err.message ?? err).slice(0, 200)}`);
    }
  }
}

process.exit(failed ? 1 : 0);
