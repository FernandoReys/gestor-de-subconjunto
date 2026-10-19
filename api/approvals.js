'use strict';
const {isDeepStrictEqual}=require('node:util'),identity=require('./identity'),{authorize}=require('./auth-core'),S=require('../src/client/scheduler');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Método inválido.'});const user=await authorize(req,res);if(!user)return;
 if(!identity.enabled()||!['Administrador','Líder'].includes(user.role))return res.status(403).json({error:'Aprovação ou cancelamento exige Administrador ou Líder.'});
 try{const body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!['approve','cancel'].includes(body?.action)||!Number.isInteger(body.revision)||!['id','operationId','deviceId'].every(k=>/^[0-9a-f-]{36}$/i.test(body[k]||'')))return res.status(400).json({error:'Operação inválida.'});
 const sql=identity.db(),rows=await sql`SELECT revision,state FROM desktop_workspace WHERE id=1`;const current=rows[0];
 if(current.revision!==body.revision)return res.status(409).json({error:'O planejamento mudou. Recarregue antes de revisar.'});
 const state=structuredClone(current.state),entry=state?.config?.history?.find(x=>x.id===body.id);if(!entry)return res.status(404).json({error:'Escala não encontrada.'});
 if(body.action==='approve'){
  const fp=state.config.fps?.find(x=>x.id===entry.fpId&&x.status!=='Arquivada');if(!fp||entry.status!=='Aguardando aprovação')return res.status(409).json({error:'Revise a FP e a situação da escala.'});
  const plan=S.generate({...entry.snapshot.config,fpStations:fp.stations},state.employees);
  const organizers=(entry.snapshot.organizers||[]).filter(x=>state.employees.some(p=>p.id===x.id&&p.role==='Assistente'&&p.active&&p.present));
  if(!plan.complete||!organizers.length|| !isDeepStrictEqual(JSON.parse(JSON.stringify(plan.rows)),entry.snapshot.rows)||!isDeepStrictEqual(JSON.parse(JSON.stringify(plan.positions)),entry.snapshot.positions))return res.status(409).json({error:'Equipe, FP ou distribuição mudou. Monte e envie uma nova proposta antes de aprovar.'});
 }
 entry.status=body.action==='approve'?'Aprovada':'Cancelada';
 const result=(await sql`SELECT gestor_push(${body.operationId}::uuid,${body.revision},${JSON.stringify(state)}::jsonb,${user.id}::uuid,${user.version},${body.deviceId}::uuid,now(),'web',${body.action},${body.id}::uuid) AS result`)[0].result;
 return res.status(result.unauthorized?401:result.forbidden?403:result.conflict?409:200).json(result);
 }catch{return res.status(503).json({error:'Não foi possível concluir a revisão. Recarregue o histórico antes de tentar novamente.'});}
};
