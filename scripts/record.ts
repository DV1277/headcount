/** Copy one completed run into a new, validated offline recording. Existing files are never overwritten. */
import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {ArtifactSchema,EventEnvelopeSchema,type Artifact,type EventEnvelope} from '@hc/contracts';
import {checkInvariants} from '@hc/engine';

const [runId,name,...extra]=process.argv.slice(2);
const root=fileURLToPath(new URL('..',import.meta.url));
const runs=process.env.HC_RUNS_DIR?.trim()?resolve(process.env.HC_RUNS_DIR.trim()):join(root,'runs');
const created:string[]=[];
try {
  if(extra.length||!runId||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(runId)||!name||!/^[a-z][a-z0-9_-]{0,63}$/.test(name))throw new Error('Usage: npm run record -- <runId> <new-recording-name>');
  const runDir=join(runs,runId);
  const raw=await readFile(join(runDir,'events.jsonl'),'utf8');
  const events:EventEnvelope[]=raw.trim().split(/\r?\n/).filter(Boolean).map(line=>EventEnvelopeSchema.parse(JSON.parse(line)));
  if(!events.length||events[0].type!=='run.created'||events.at(-1)?.type!=='run.completed'||events.some(event=>event.runId!==runId))throw new Error('Recording requires one complete, matching run.');
  const issues=checkInvariants(events);
  if(issues.length)throw new Error(`Invalid event log: ${issues.join('; ')}`);
  const expected=new Map(events.flatMap(event=>event.type==='artifact.created'?[[event.data.artifact.id,event.data.artifact] as const]:[]));
  const artifacts:Record<string,Artifact>={};
  const files=await readdir(join(runDir,'artifacts'));
  for(const file of files.filter(file=>file.endsWith('.json'))) {
    const artifact=ArtifactSchema.parse(JSON.parse(await readFile(join(runDir,'artifacts',file),'utf8')));
    const {payload,...meta}=artifact;
    if(file!==`${artifact.id}.json`||artifact.runId!==runId||!isDeepStrictEqual(meta,expected.get(artifact.id)))throw new Error(`Artifact ${file} does not match the event log.`);
    artifacts[artifact.id]=artifact;
  }
  if(expected.size!==Object.keys(artifacts).length||[...expected.keys()].some(id=>!artifacts[id]))throw new Error('Recording is missing artifact payloads.');
  let html:string|undefined;
  try {html=await readFile(join(runDir,'site','index.html'),'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(Object.values(artifacts).some(artifact=>artifact.kind==='site')&&html===undefined)throw new Error('The site artifact has no published HTML to record.');
  const fixtures=join(root,'fixtures','runs');
  const targets:[string,string][]=[
    [join(fixtures,`${name}.jsonl`),raw.endsWith('\n')?raw:raw+'\n'],
    [join(fixtures,`${name}.artifacts.json`),JSON.stringify(artifacts,null,2)+'\n'],
  ];
  if(html!==undefined)targets.push([join(fixtures,`${name}.site.html`),html]);
  // Check every possible target, including a stale .site.html when this run has no site.
  await mkdir(fixtures,{recursive:true});
  const occupied=new Set(await readdir(fixtures));
  if(['jsonl','artifacts.json','site.html'].some(extension=>occupied.has(`${name}.${extension}`)))throw new Error('This recording name already exists. Choose a new name.');
  for(const [path,contents] of targets){await writeFile(path,contents,{flag:'wx'});created.push(path);}
  console.log(`Recorded ${runId} as ${name}: ${events.length} events, ${Object.keys(artifacts).length} artifacts, site ${html===undefined?'absent':'copied'}.`);
}catch(error){
  await Promise.all(created.map(path=>rm(path)));
  console.error(error instanceof Error?error.message:'Recording failed.');process.exitCode=1;
}
