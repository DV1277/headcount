import { env } from './env';
import {createControlApp} from './app';
import {createSitesApp} from './site-app';
import type {Express} from 'express';
import type {Server} from 'node:http';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export const app=createControlApp();
export const sitesApp=createSitesApp();
function listen(app:Express,port:number):Promise<Server> {
  return new Promise((resolve,reject)=>{
    const server=app.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve(server);});
    server.once('error',reject);
  });
}
export async function startServers():Promise<Server[]> {
  const control=await listen(app,env.HC_PORT);
  try {
    const sites=await listen(sitesApp,env.HC_SITES_PORT);
    console.log(`Headcount: 1 control API · http://127.0.0.1:${env.HC_PORT}`);
    console.log(`Landing pages only · http://127.0.0.1:${env.HC_SITES_PORT}/sites/`);
    return [control,sites];
  }catch(error){control.close();throw error;}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const servers=await startServers();
    const close=()=>{
      for(const server of servers)server.close();
      setTimeout(()=>process.exit(0),3000).unref();
    };
    process.once('SIGINT',close);process.once('SIGTERM',close);
  }catch(error){console.error(`Headcount server could not listen (${(error as NodeJS.ErrnoException).code??'startup error'}).`);process.exitCode=1;}
}
