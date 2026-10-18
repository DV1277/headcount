import {afterEach,describe,expect,it,vi} from 'vitest';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();});
describe('read-only health probes',()=>{
  it('runs offline in mock mode without requiring credentials',async()=>{
    vi.stubEnv('HC_MAYOR','mock');vi.stubEnv('HC_WORKERS','mock');
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const {readHealth}=await import('./health');
    expect(await readHealth()).toMatchObject({ok:true,mode:'mock',stepfun:'mock',creao:'mock',missing:[]});
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects an app-scoped key without forwarding it to the developer API',async()=>{
    vi.stubEnv('CREAO_API_MODE','account');
    vi.stubEnv('HC_MAYOR','mock');vi.stubEnv('HC_WORKERS','creao');vi.stubEnv('CREAO_API_KEY','capi_test');
    for(const role of ['SCOUT','MAKER','HERALD'])vi.stubEnv(`CREAO_${role}_AGENT_ID`,role.toLowerCase());
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const {readHealth}=await import('./health');
    expect(await readHealth()).toMatchObject({ok:false,creao:'down',configuration:[expect.stringContaining('cr_sk_')]});
    expect(fetch).not.toHaveBeenCalled();
  });
  it('checks all saved agents, only uses GET, and caches concurrent requests',async()=>{
    vi.stubEnv('CREAO_API_MODE','account');
    vi.stubEnv('HC_MAYOR','stepfun');vi.stubEnv('HC_WORKERS','creao');vi.stubEnv('CREAO_API_KEY','cr_sk_test');vi.stubEnv('STEPFUN_API_KEY','test');
    for(const role of ['SCOUT','MAKER','HERALD'])vi.stubEnv(`CREAO_${role}_AGENT_ID`,role.toLowerCase());
    const fetch=vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith('/models')?{data:[{id:'step-5-preview'}]}:{id:'saved'}),{status:200}));vi.stubGlobal('fetch',fetch);
    const {readHealth}=await import('./health');
    const values=await Promise.all([readHealth(),readHealth()]);
    expect(values[0]).toMatchObject({ok:true,mode:'live',stepfun:'ok',creao:'ok'});
    expect(fetch).toHaveBeenCalledTimes(4);
    await readHealth();expect(fetch).toHaveBeenCalledTimes(4);
    for(const [,options] of fetch.mock.calls as unknown as [string,RequestInit][])expect(options.method??'GET').toBe('GET');
  });
  it('supports the preferred app path with a shared trigger key and independent app IDs',async()=>{
    vi.stubEnv('CREAO_API_MODE','app');vi.stubEnv('HC_MAYOR','mock');vi.stubEnv('HC_WORKERS','creao');vi.stubEnv('CREAO_API_KEY','capi_test');
    for(const role of ['SCOUT','MAKER','HERALD'])vi.stubEnv(`CREAO_${role}_APP_ID`,role.toLowerCase());
    const fetch=vi.fn(async()=>new Response(JSON.stringify({runs:[]}),{status:200}));vi.stubGlobal('fetch',fetch);
    const {readHealth}=await import('./health');
    expect(await readHealth()).toMatchObject({ok:true,creao:'ok',missing:[]});
    expect(fetch).toHaveBeenCalledTimes(3);
    for(const [url] of fetch.mock.calls as unknown as [string][])expect(url).toMatch(/^https:\/\/agent\.creao\.ai\/api\/v1\/apps\/(scout|maker|herald)\/runs/);
  });
});
