import {it,expect} from 'vitest';
import {mkdtemp,mkdir,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {REPO_ROOT} from './paths';

it('exports a complete recording, refuses overwrite, and leaves no partial export when a payload is missing',async()=>{
  const source=await mkdtemp(join(tmpdir(),'hc-record-check-'));
  const name=`record-check-${randomUUID()}`;
  const incomplete=`${name}-incomplete`;
  const fixtureRoot=join(REPO_ROOT,'fixtures','runs');
  const runId='run_golden_boba';
  const run=join(source,runId);
  const execute=(target:string)=>spawnSync(process.execPath,['--import','tsx','scripts/record.ts',runId,target],{cwd:REPO_ROOT,env:{...process.env,HC_RUNS_DIR:source},encoding:'utf8'});
  try {
    await mkdir(join(run,'artifacts'),{recursive:true});await mkdir(join(run,'site'));
    const original=await readFile(join(fixtureRoot,'golden-boba.jsonl'),'utf8');
    await writeFile(join(run,'events.jsonl'),original);
    const artifacts=JSON.parse(await readFile(join(fixtureRoot,'golden-boba.artifacts.json'),'utf8'));
    for(const [id,artifact] of Object.entries(artifacts))await writeFile(join(run,'artifacts',`${id}.json`),JSON.stringify(artifact));
    await writeFile(join(run,'site','index.html'),await readFile(join(fixtureRoot,'golden-boba.site.html'),'utf8'));
    const first=execute(name);expect(first.status,first.stderr).toBe(0);
    expect(await readFile(join(fixtureRoot,`${name}.jsonl`),'utf8')).toBe(original);
    const saved=await readFile(join(fixtureRoot,`${name}.artifacts.json`),'utf8');
    const repeated=execute(name);expect(repeated.status).toBe(1);expect(repeated.stderr).toContain('already exists');
    expect(await readFile(join(fixtureRoot,`${name}.artifacts.json`),'utf8')).toBe(saved);
    await rm(join(run,'artifacts',`${Object.keys(artifacts)[0]}.json`));
    const missing=execute(incomplete);expect(missing.status).toBe(1);expect(missing.stderr).toContain('missing artifact');
    await expect(access(join(fixtureRoot,`${incomplete}.jsonl`))).rejects.toMatchObject({code:'ENOENT'});
  }finally{
    await rm(source,{recursive:true,force:true});
    for(const target of [name,incomplete])for(const extension of ['jsonl','artifacts.json','site.html'])await rm(join(fixtureRoot,`${target}.${extension}`),{force:true});
  }
},15_000);
