'use strict';
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Método inválido.'});
 const oauth=require('./google-oauth-core');if(!oauth.configured())return res.status(503).json({error:'OAuth Google ainda não configurado no servidor.'});
 let result='failed';try{result=await oauth.callback(req);}catch{console.warn('google_oauth_callback_failed');}
 res.setHeader('Set-Cookie','gestor_google_nonce=; HttpOnly; Secure; SameSite=Lax; Path=/api/google-callback.js; Max-Age=0');res.setHeader('Location',oauth.settings().origin+'/?google='+result+'#agenda');res.statusCode=303;res.end();
};
