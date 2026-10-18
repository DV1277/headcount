import { z } from 'zod';
export const env=z.object({
  HC_PORT:z.coerce.number().int().min(1).max(65535).default(8787),HC_SITES_PORT:z.coerce.number().int().min(1).max(65535).default(8788),
  HC_MODE:z.enum(['live','demo']).default('live'),HC_MAYOR:z.enum(['stepfun','mock']).default('stepfun'),HC_WORKERS:z.enum(['creao','mock']).default('creao'),
  HC_MOCK_SPEED:z.coerce.number().positive().default(1),HC_TASK_TIMEOUT_MS:z.coerce.number().positive().default(360000),
  PUBLIC_BASE_URL:z.string().default(''),STEPFUN_MODEL:z.literal('step-5-preview').default('step-5-preview'),
  CREAO_API_MODE:z.enum(['app','account']).default('app'),
  HC_RUNS_DIR:z.string().default(''),
}).parse(process.env);
export function missingCredentials():string[] {
  if(env.HC_MODE==='demo')return [];
  const required:string[]=[];
  if(env.HC_MAYOR==='stepfun')required.push('STEPFUN_API_KEY');
  if(env.HC_WORKERS==='creao') {
    if(env.CREAO_API_MODE==='app')for(const role of ['SCOUT','MAKER','HERALD']) {
      required.push(`CREAO_${role}_APP_ID`);
      if(!process.env.CREAO_APP_KEY?.trim()&&!process.env.CREAO_API_KEY?.trim())required.push(`CREAO_${role}_APP_KEY`);
    }
    else required.push('CREAO_API_KEY','CREAO_SCOUT_AGENT_ID','CREAO_MAKER_AGENT_ID','CREAO_HERALD_AGENT_ID');
  }
  return required.filter(name=>!process.env[name]?.trim());
}
