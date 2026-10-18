export type PingResult={ok:boolean;detail:string};
export type Message={role:string;content?:string|null;tool_calls?:unknown[]};
export declare const stepfun: {
  isConfigured():boolean;ping():Promise<PingResult>;
  chat(messages:Message[],options?:Record<string,unknown>):Promise<Message>;
};
export declare const creao: {
  isConfigured():boolean;ping():Promise<PingResult>;
  createRun(agentId:string,input:unknown,options?:{webhookUrl?:string}):Promise<Record<string,unknown>>;
  getRun(runId:string):Promise<Record<string,unknown>>;
  waitForRun(runId:string,options?:{intervalMs?:number;timeoutMs?:number;onTick?:(run:Record<string,unknown>)=>void}):Promise<Record<string,unknown>>;
  createAppRun(inputs:unknown):Promise<Record<string,unknown>>;getAppRun(runId:string):Promise<Record<string,unknown>>;
  waitForAppRun(runId:string,options?:Record<string,unknown>):Promise<Record<string,unknown>>;
};
export declare const browserUse: {isConfigured():boolean;ping():Promise<PingResult>;startBrowser(options?:Record<string,unknown>):Promise<Record<string,unknown>>;stopBrowser(sessionId:string):Promise<unknown>};
export declare const devin: {isConfigured():boolean;ping():Promise<PingResult>;createSession(prompt:string,options?:Record<string,unknown>):Promise<Record<string,unknown>>;sendMessage(sessionId:string,message:string):Promise<unknown>};
export declare const elevenlabs: {isConfigured():boolean;ping():Promise<PingResult>;tts(text:string,options?:Record<string,unknown>):Promise<ArrayBuffer>};
