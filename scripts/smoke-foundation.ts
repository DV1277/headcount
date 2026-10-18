import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { ArtifactSchema, EventEnvelopeSchema } from '@hc/contracts';
import { checkInvariants, initialState, reduce } from '@hc/engine';
for(const name of ['golden-boba','failure-retry','redirect']){
  const root=new URL(`../fixtures/runs/${name}`,import.meta.url);
  const events=readFileSync(`${root.pathname}.jsonl`,'utf8').trim().split('\n').map(line=>EventEnvelopeSchema.parse(JSON.parse(line)));
  const values=JSON.parse(readFileSync(`${root.pathname}.artifacts.json`,'utf8')) as Record<string,unknown>;
  const artifacts=Object.fromEntries(Object.entries(values).map(([id,value])=>[id,ArtifactSchema.parse(value)]));
  const created=new Set<string>();
  for(const event of events){
    if(event.type==='artifact.created'){
      const artifact=artifacts[event.data.artifact.id];
      if(!artifact)throw new Error(`${name}: missing artifact payload ${event.data.artifact.id}`);
      const {payload:_,...meta}=artifact;
      if(!isDeepStrictEqual(meta,event.data.artifact))throw new Error(`${name}: artifact metadata differs from its event log: ${artifact.id}`);
      created.add(artifact.id);
    }
    if('artifactId' in event.data&&!created.has(event.data.artifactId))throw new Error(`${name}: artifact reference before creation at seq ${event.seq}`);
  }
  for(const [id,artifact] of Object.entries(artifacts)){
    if(id!==artifact.id||artifact.runId!==events[0]?.runId||!created.has(id))throw new Error(`${name}: orphaned or mismatched artifact payload ${id}`);
  }
  const issues=checkInvariants(events);if(issues.length)throw new Error(`${name}: ${issues.join('; ')}`);
  const final=events.reduce(reduce,initialState());
  console.log(`${name}: ${events.length} valid events · ${Object.keys(artifacts).length} artifacts · ${final.status} · seq ${final.lastSeq}`);
}
console.log('G-1/G0 foundation smoke passed. Live execution is not part of this check.');
