// Interactive .env filler. Prompts (hidden input) for each var in .env.example that has no value in .env.
// Run via `npm run keys`. Needs a real terminal.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";
import readline from "node:readline";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const examplePath = join(root, ".env.example");
const envPath = join(root, ".env");
const args=process.argv.slice(2);
const replace=args.includes('--replace');
const selected=args.filter(arg=>arg!=='--replace');
if(selected.some(arg=>!/^([A-Z][A-Z0-9_]*)$/.test(arg)) || (replace && !selected.length)) {
  console.error('Usage: npm run keys -- [--replace] VARIABLE_NAME ...');
  process.exit(1);
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.log("setup-keys needs an interactive terminal (stdin/stdout is not a TTY). Run `npm run keys` in a terminal, or copy .env.example to .env and edit it by hand.");
  process.exit(0);
}

if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath);
  console.log("Created .env from .env.example");
}
chmodSync(envPath, 0o600);

const KEY_RE = /^([A-Z][A-Z0-9_]*)=(.*)$/;

// Parse the example: for each var, its default and the nearby comments (where-to-get-it).
const vars = [];
let ctx = [];
let lastWasVar = false;
for (const line of readFileSync(examplePath, "utf8").split("\n")) {
  if (line.trim() === "") { ctx = []; lastWasVar = false; continue; }
  const m = line.match(KEY_RE);
  if (m) {
    vars.push({ name: m[1], def: m[2].trim(), help: [...ctx] });
    lastWasVar = true;
  } else if (line.startsWith("#")) {
    if (lastWasVar) { ctx = []; lastWasVar = false; }
    if (!line.startsWith("# ---")) ctx.push(line.replace(/^#\s?/, ""));
  }
}
if(selected.some(name=>!vars.some(v=>v.name===name))) {
  console.error('Unknown variable name. Use a name from .env.example.');
  process.exit(1);
}

const envLines = () => readFileSync(envPath, "utf8").split("\n");
function currentValue(name) {
  for (const l of envLines()) {
    const m = l.match(KEY_RE);
    if (m && m[1] === name) return m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return "";
}

function writeValue(name, value) {
  const quoted = /^[A-Za-z0-9_\-./:@+=,]*$/.test(value) ? value : JSON.stringify(value);
  let found = false;
  const lines = envLines().map((l) => {
    const m = l.match(KEY_RE);
    if (m && m[1] === name) { found = true; return `${name}=${quoted}`; }
    return l;
  });
  if (!found) {
    if (lines[lines.length - 1] === "") lines.pop();
    lines.push(`${name}=${quoted}`, "");
  }
  const tmp = `${envPath}.tmp-${process.pid}`;
  writeFileSync(tmp, lines.join("\n"), { mode: 0o600 });
  renameSync(tmp, envPath); // atomic
  chmodSync(envPath, 0o600);
}

// Vars that ship with a default are non-secret config: keep the default, make sure it's present.
for (const v of vars) {
  if (v.def && !currentValue(v.name)) writeValue(v.name, v.def);
}

const todo = vars.filter((v) => (!selected.length||selected.includes(v.name)) && (replace || (!v.def&&!currentValue(v.name))));
if (todo.length === 0) {
  console.log("Every var already has a value. Run `npm run check`.");
  process.exit(0);
}

const secretRe = /KEY|SECRET|TOKEN/;
const muted = new Writable({ write(_c, _e, cb) { cb(); } });

function ask(v) {
  const hidden = secretRe.test(v.name);
  return new Promise((resolve) => {
    process.stdout.write(`${hidden ? "(input hidden) " : ""}${v.name} [Enter to skip]: `);
    const rl = readline.createInterface({ input: process.stdin, output: hidden ? muted : process.stdout, terminal: true });
    let done = false;
    const finish = (val) => { if (done) return; done = true; rl.close(); if (hidden) process.stdout.write("\n"); resolve(val); };
    rl.once("line", (l) => finish(l.trim()));
    rl.once("SIGINT", () => finish(null));
    rl.once("close", () => finish(null));
  });
}

console.log(`${todo.length} var(s) ${replace?'selected for replacement':'without a value'}. Press Enter to keep the current value. Ctrl+C stops (progress is saved).\n`);
let saved = 0;
for (const v of todo) {
  console.log(`--- ${v.name}`);
  for (const h of v.help) console.log(`    ${h}`);
  const val = await ask(v);
  if (val === null) { console.log("\nStopped."); break; }
  if (val) { writeValue(v.name, val); saved++; console.log("    saved"); }
  else console.log("    skipped");
}

console.log(`\nSaved ${saved} value(s) to .env (mode 600). Next: run \`npm run check\`.`);
process.exit(0);
