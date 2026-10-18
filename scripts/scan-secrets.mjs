import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const root=new URL('..',import.meta.url).pathname;
const excluded=new Set(['.git','.recall','.claude','.impeccable','node_modules','dist','runs']);
const patterns=[/\b(?:cr_sk_|capi_|cog_)[a-zA-Z0-9_-]{20,}/,/\bsk-[a-zA-Z0-9_-]{24,}/, /(?:API_KEY|SECRET|ACCESS_TOKEN)\s*=\s*["']?[a-zA-Z0-9_-]{20,}/];
let violations=0;
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
  if(excluded.has(entry.name)||entry.name.startsWith('.env')&&entry.name!=='.env.example')continue;
  const path=join(dir,entry.name);
  if(entry.isDirectory()){walk(path);continue;}
  if(!/\.(?:[cm]?[jt]sx?|jsonl?|md|html|css|sh|example)$/.test(entry.name))continue;
  const lines=readFileSync(path,'utf8').split('\n');
  for(let index=0;index<lines.length;index++)if(patterns.some(pattern=>pattern.test(lines[index]))){console.error(`Possible secret: ${relative(root,path)}:${index+1} (value withheld)`);violations++;}
}}
walk(root);
if(violations)process.exitCode=1;else console.log('Secret scan passed: no credential patterns in publishable source files.');
