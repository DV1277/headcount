import { Router } from 'express';
export const apiRouter=Router();
apiRouter.all('*',(_req,res)=>res.status(501).json({error:{code:'not_implemented',message:'The live runtime is part of G1/G2. Use fixture replay to inspect the G-1/G0 foundation.'}}));
