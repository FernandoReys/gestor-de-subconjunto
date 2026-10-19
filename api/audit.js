'use strict';
const identity=require('./identity'),{authorize}=require('./auth-core');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Método inválido.'});const user=await authorize(req,res);if(!user)return;
 if(!identity.enabled()||!['Administrador','Líder'].includes(user.role))return res.status(403).json({error:'Sem permissão para consultar auditoria.'});
 const q=new URL(req.url,'https://localhost').searchParams,cursor=q.get('before')||'9223372036854775807',actor=q.get('actor')||'',module=q.get('module')||'',action=q.get('action')||'',from=q.get('from')||'1970-01-01',to=q.get('to')||'2099-12-31';
 if(!/^\d{1,19}$/.test(cursor)||actor&&!/^[0-9a-f-]{36}$/i.test(actor)||![from,to].every(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x)))||module.length>30||action.length>30)return res.status(400).json({error:'Filtros inválidos.'});
 try{const sql=identity.db();const rows=await sql`SELECT a.id::text,a.actor_id,u.username,a.action,a.module,a.entity_id,a.before_data,a.after_data,a.source,a.status,a.created_at FROM gestor_audit a LEFT JOIN gestor_users u ON u.id=a.actor_id WHERE a.id<${cursor}::bigint AND a.created_at>=${from}::date AND a.created_at<${to}::date+interval '1 day' AND (${actor}='' OR a.actor_id::text=${actor}) AND (${module}='' OR a.module=${module}) AND (${action}='' OR a.action=${action}) AND (${user.role}='Administrador' OR a.module IN ('history','productionAgenda','workspace')) ORDER BY a.id DESC LIMIT 50`;return res.status(200).json({items:rows,next:rows.length===50?rows.at(-1).id:null});}catch{return res.status(503).json({error:'Auditoria indisponível.'});}
};
