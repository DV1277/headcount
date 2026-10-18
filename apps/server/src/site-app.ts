import express,{type ErrorRequestHandler} from 'express';
import {createSitesRouter} from './sites';

export function createSitesApp() {
  const app=express();
  app.disable('x-powered-by');
  app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');next();});
  app.use('/sites',createSitesRouter());
  app.use((_req,res)=>res.status(404).json({error:{code:'not_found',message:'Only published landing pages are served here.'}}));
  const handleError:ErrorRequestHandler=(error,_req,res,_next)=>{
    if(res.headersSent){res.end();return;}
    res.status(error instanceof URIError?404:500).json({error:{code:error instanceof URIError?'not_found':'internal',message:'The landing page is unavailable.'}});
  };
  app.use(handleError);
  return app;
}
