'use strict';
const crypto=require('node:crypto'),identity=require('./identity'),{authorize}=require('./auth-core');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método inválido.'});
 const user=await authorize(req,res);if(!user)return;if(!identity.enabled()||user.role!=='Administrador')return res.status(403).json({error:'Acesso administrativo necessário.'});
 try{const sql=identity.db();if(req.method==='GET'){const rows=await sql`SELECT id,username,full_name,role,active,created_at,updated_at FROM gestor_users ORDER BY username LIMIT 100`;return res.status(200).json({users:rows.map(identity.publicUser)});}
 const body=typeof req.body==='string'?JSON.parse(req.body):req.body;const {action}=body||{};
 if(!['create','update','reset'].includes(action)||action!=='create'&&!/^[0-9a-f-]{36}$/i.test(body.id))return res.status(400).json({error:'Operação inválida.'});
 if(action!=='reset'&&(!['Administrador','Líder','Assistente'].includes(body.role)||typeof body.fullName!=='string'||!body.fullName.trim()||body.fullName.length>100||action==='update'&&typeof body.active!=='boolean'))return res.status(400).json({error:'Revise nome, perfil e situação.'});
 if(action==='create'&&(typeof body.username!=='string'||!/^[a-z0-9_.-]{3,60}$/.test(body.username)))return res.status(400).json({error:'Usuário: 3 a 60 letras minúsculas, números, ponto, hífen ou sublinhado.'});
 const token=action==='reset'?crypto.randomBytes(32).toString('base64url'):null,hash=action==='create'?await identity.hash(body.password):token?crypto.createHash('sha256').update(token).digest('hex'):null;
 const rows=await sql`SELECT gestor_manage_user(${user.id}::uuid,${user.version},${body.id||crypto.randomUUID()}::uuid,${action},${body.username||null},${body.fullName?.trim()||null},${body.role||null},${body.active!==false},${hash}) AS result`;
 const result=rows[0].result;if(result.forbidden)return res.status(403).json({error:'Permissão alterada. Entre novamente.'});return res.status(200).json({...result,...(token?{resetCode:token,expiresInMinutes:20}:{})});
 }catch(error){return res.status(400).json({error:error.message?.startsWith('A senha')?error.message:'Operação recusada. Confira os dados, nomes duplicados e a preservação de um administrador ativo.'});}
};
