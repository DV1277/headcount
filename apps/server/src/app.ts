import express, {type Router, type ErrorRequestHandler} from 'express';
import {apiRouter} from './api';
import {env} from './env';
import {readHealth} from './health';

/** Local control API. Public landing pages use a separate app and listener. */
export function createControlApp(router:Router=apiRouter) {
  const app=express();
  app.disable('x-powered-by');
  const origins=new Set([5173,4173,env.HC_PORT].flatMap(port=>[`http://127.0.0.1:${port}`,`http://localhost:${port}`]));
  app.use('/api',(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin=req.get('origin');
      if((origin&&!origins.has(origin))||req.get('sec-fetch-site')==='cross-site') {
        res.status(403).json({error:{code:'origin_denied',message:'Use the local Headcount app to control a run.'}});return;
      }
    }
    next();
  });
  app.use(express.json({limit:'256kb'}));
  app.get('/api/health',(_req,res,next)=>{void readHealth().then(health=>res.json(health)).catch(next);});
  app.use('/api',router);
  app.use((_req,res)=>res.status(404).json({error:{code:'not_found',message:'Route not found.'}}));
  const handleError:ErrorRequestHandler=(error,_req,res,_next)=>{
    if(res.headersSent){res.end();return;}
    const status=error?.type==='entity.too.large'?413:error instanceof SyntaxError?400:500;
    const code=status===413?'body_too_large':status===400?'invalid_json':'internal';
    res.status(status).json({error:{code,message:status===500?'The server could not complete this request.':status===413?'Request body exceeds 256 KB.':'Request body must be valid JSON.'}});
  };
  app.use(handleError);
  return app;
}
