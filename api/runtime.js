'use strict';
const {authorize}=require('./auth-core');
module.exports=(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Método inválido.'});
 if(!authorize(req,res))return;
 return res.status(200).json({version:'2.2.1',sharedWorkspace:process.env.DESKTOP_SYNC_ENABLED==='1'&&Boolean(process.env.DESKTOP_DATABASE_URL),aiConfigured:Boolean(process.env.VERCEL_OIDC_TOKEN||process.env.AI_GATEWAY_API_KEY)});
};
