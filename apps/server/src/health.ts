import type { HealthResponse } from '@hc/contracts';
import { env, missingCredentials } from './env';

type Health = HealthResponse & {missing:string[]; configuration:string[]};
let cached:{at:number;value:Health}|undefined;
let pending:Promise<Health>|undefined;

async function available(url:string,key:string,validate:(body:unknown)=>boolean):Promise<boolean> {
  try {
    const response=await fetch(url,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(5000),redirect:'error'});
    return response.ok && validate(await response.json());
  } catch {return false;}
}

/** Read-only authentication probes. This endpoint never starts an agent or completion. */
export async function readHealth():Promise<Health> {
  if(cached && Date.now()-cached.at<30_000)return cached.value;
  if(pending)return pending;
  pending=(async()=>{
    const missing=missingCredentials(),configuration:string[]=[];
    const key=process.env.CREAO_API_KEY?.trim()??'';
    if(env.HC_MODE!=='demo' && env.HC_WORKERS==='creao') {
      if(env.CREAO_API_MODE==='account' && key && !key.startsWith('cr_sk_'))configuration.push('Account mode requires a cr_sk_ key. Use app mode for agent.creao.ai keys.');
      if(env.CREAO_API_MODE==='app')for(const role of ['SCOUT','MAKER','HERALD']) {
        const appKey=process.env[`CREAO_${role}_APP_KEY`]?.trim()||process.env.CREAO_APP_KEY?.trim()||key;
        if(appKey&&!appKey.startsWith('capi_'))configuration.push(`CREAO_${role}_APP_KEY must be a capi_ app-trigger key.`);
      }
    }
    const isMock=env.HC_MAYOR==='mock' && env.HC_WORKERS==='mock';
    const mode=env.HC_MODE==='demo'?'demo':isMock?'mock':'live';
    const [stepfun,creao]=await Promise.all([
      env.HC_MODE==='demo'||env.HC_MAYOR==='mock' ? Promise.resolve('mock' as const) :
        !process.env.STEPFUN_API_KEY?.trim()?Promise.resolve('down' as const):
        available(`${(process.env.STEPFUN_BASE_URL||'https://api.stepfun.ai/v1').replace(/\/+$/,'')}/models`,process.env.STEPFUN_API_KEY.trim(),body=>{
          const data=(body as {data?:{id?:string}[]})?.data;
          return Array.isArray(data)&&data.some(item=>item.id==='step-5-preview');
        }).then(ok=>ok?'ok' as const:'down' as const),
      env.HC_MODE==='demo'||env.HC_WORKERS==='mock' ? Promise.resolve('mock' as const) : env.CREAO_API_MODE==='app' ?
        missing.some(name=>name.startsWith('CREAO_'))||configuration.length>0?Promise.resolve('down' as const):
        Promise.all(['SCOUT','MAKER','HERALD'].map(role=>available(`https://agent.creao.ai/api/v1/apps/${encodeURIComponent(process.env[`CREAO_${role}_APP_ID`]!.trim())}/runs?limit=1`,process.env[`CREAO_${role}_APP_KEY`]?.trim()||process.env.CREAO_APP_KEY?.trim()||key,body=>Array.isArray((body as {runs?:unknown})?.runs))))
          .then(results=>results.every(Boolean)?'ok' as const:'down' as const) :
        !key.startsWith('cr_sk_')||missing.some(name=>name.startsWith('CREAO_'))?Promise.resolve('down' as const):
        Promise.all(['SCOUT','MAKER','HERALD'].map(role=>available(`${(process.env.CREAO_BASE_URL||'https://developer.creao.ai/v1').replace(/\/+$/,'')}/agents/${encodeURIComponent(process.env[`CREAO_${role}_AGENT_ID`]!.trim())}`,key,()=>true)))
          .then(results=>results.every(Boolean)?'ok' as const:'down' as const),
    ]);
    const value:Health={ok:stepfun!=='down'&&creao!=='down'&&missing.length===0&&configuration.length===0,mode,stepfun,creao,publicBaseUrl:env.PUBLIC_BASE_URL||null,missing,configuration};
    cached={at:Date.now(),value};
    return value;
  })();
  try{return await pending;}finally{pending=undefined;}
}
