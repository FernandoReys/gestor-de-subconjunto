'use strict';
const {authorize}=require('./auth-core');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Método inválido.'});
 if(!await authorize(req,res))return;
 return res.status(200).json({securityV2:process.env.AUTH_USERS_ENABLED==='1',version:'2.4.0',sharedWorkspace:process.env.DESKTOP_SYNC_ENABLED==='1'&&Boolean(process.env.DESKTOP_DATABASE_URL),aiConfigured:Boolean(process.env.VERCEL_OIDC_TOKEN||process.env.AI_GATEWAY_API_KEY)});
};
