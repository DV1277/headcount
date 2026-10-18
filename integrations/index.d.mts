export type PingResult={ok:boolean;detail:string};
export type Message={role:string;content?:string|null;tool_calls?:unknown[]};
export type UsageRaw={tokensIn:number;tokensOut:number;cachedIn?:number};
export type ChatRawResult={message:Message;usage:UsageRaw;raw:Record<string,unknown>;fallbackToJsonObject:boolean};
export type ChatOptions={
  json?:boolean|{name?:string;schema?:Record<string,unknown>;json_schema?:{name?:string;schema:Record<string,unknown>};strict?:boolean};
  tools?:unknown[];timeoutMs?:number;signal?:AbortSignal;retries?:number;reasoningEffort?:'low'|'medium'|'high';[k:string]:unknown;
};
export declare const stepfun: {
  isConfigured():boolean;ping():Promise<PingResult>;
  chat(messages:Message[],options?:ChatOptions):Promise<Message>;
  chatRaw(messages:Message[],options?:ChatOptions):Promise<ChatRawResult>;
};
export declare const creao: {
  isConfigured():boolean;ping():Promise<PingResult>;
  createRun(agentId:string,input:unknown,options?:{webhookUrl?:string}):Promise<Record<string,unknown>>;
  getRun(runId:string):Promise<Record<string,unknown>>;
  waitForRun(runId:string,options?:{intervalMs?:number;timeoutMs?:number;onTick?:(run:Record<string,unknown>)=>void;signal?:AbortSignal}):Promise<Record<string,unknown>>;
  createRealtimeRun(agentId:string,input:unknown,options?:{signal?:AbortSignal}):Promise<Response>;
  createAppRun(inputs:unknown):Promise<Record<string,unknown>>;getAppRun(runId:string):Promise<Record<string,unknown>>;
  waitForAppRun(runId:string,options?:{intervalMs?:number;timeoutMs?:number;onTick?:(run:Record<string,unknown>)=>void;signal?:AbortSignal}):Promise<Record<string,unknown>>;
  createAppRunWith(appId:string,key:string,inputs:unknown,options?:{signal?:AbortSignal}):Promise<Record<string,unknown>>;
  getAppRunWith(appId:string,key:string,runId:string,options?:{signal?:AbortSignal}):Promise<Record<string,unknown>>;
  waitForAppRunWith(appId:string,key:string,runId:string,options?:{intervalMs?:number;timeoutMs?:number;onTick?:(run:Record<string,unknown>)=>void;signal?:AbortSignal}):Promise<Record<string,unknown>>;
};
export declare const browserUse: {isConfigured():boolean;ping():Promise<PingResult>;startBrowser(options?:Record<string,unknown>):Promise<Record<string,unknown>>;stopBrowser(sessionId:string):Promise<unknown>};
export declare const devin: {isConfigured():boolean;ping():Promise<PingResult>;createSession(prompt:string,options?:Record<string,unknown>):Promise<Record<string,unknown>>;sendMessage(sessionId:string,message:string):Promise<unknown>};
export declare const elevenlabs: {isConfigured():boolean;ping():Promise<PingResult>;tts(text:string,options?:Record<string,unknown>):Promise<ArrayBuffer>};
