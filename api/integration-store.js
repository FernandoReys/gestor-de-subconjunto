'use strict';
const {neon}=require('@neondatabase/serverless');
const db=()=>{if(process.env.DESKTOP_SYNC_ENABLED!=='1'||!process.env.DESKTOP_DATABASE_URL)throw new Error('Banco de teste indisponível.');return neon(process.env.DESKTOP_DATABASE_URL);};
async function audit(user,service,action,status,entityId=null){const sql=db();await sql`INSERT INTO gestor_integration_audit(owner_id,service,action,status,entity_id) VALUES(${user.id||user.username},${service},${action},${status},${entityId})`;}
async function budget(user){const sql=db(),owner=user.id||user.username;
 const rows=await sql`WITH keys(owner,cap) AS (VALUES (${owner},100),('global',500),(${owner+'|minute|'+Math.floor(Date.now()/60000)},10)), changed AS (INSERT INTO gestor_ai_budget(owner_id,day,count) SELECT owner,CURRENT_DATE,1 FROM keys ON CONFLICT(owner_id,day) DO UPDATE SET count=gestor_ai_budget.count+1 RETURNING owner_id,count) SELECT bool_and(changed.count<=keys.cap) AS allowed FROM changed JOIN keys ON keys.owner=changed.owner_id`;return rows[0].allowed;}

async function consult(user,args){
 if(!args||!['employees','fps','agenda','schedule'].includes(args.category))throw new Error('Consulta inválida.');
 const sql=db(),rows=await sql`SELECT revision,state FROM desktop_workspace WHERE id=1`;const state=rows[0]?.state;if(!state)throw new Error('Dados indisponíveis.');
 const employees=state.employees||[],config=state.config||{};
 if(args.category==='employees')return {revision:rows[0].revision,employees:employees.map(x=>({name:x.name,role:x.role,active:x.active,present:x.present,allowed:x.allowed})).slice(0,150),notice:'Não inclui motivos de ausência, saúde, matrícula ou observações.'};
 if(args.category==='fps')return {fps:(config.fps||[]).map(x=>({fp:x.fp,name:x.name,variation:x.variation,market:x.market,active:x.active,stations:x.stations})).slice(0,100)};
 if(args.category==='agenda'){
  const from=args.from||new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),to=args.to||from;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<from||Date.parse(to)-Date.parse(from)>31*86400000)throw new Error('Consulte no máximo 31 dias.');
  return {from,to,items:(config.productionAgenda||[]).filter(x=>x.date>=from&&x.date<=to).slice(0,100).map(x=>({date:x.date,start:x.start,end:x.end,shift:x.shift,productCode:x.productCode,fp:x.snapshot?.fp,product:x.snapshot?.name,status:x.status,quantity:x.quantity}))};
 }
 const fp=config.fps?.find(x=>x.id===config.product&&x.status!=='Arquivada');if(!fp)return {errors:['Selecione uma FP ativa antes de verificar a escala.']};const plan=require('../src/client/scheduler').generate({...config,fpStations:fp.stations},employees);
 return {date:config.date,complete:plan.complete,errors:plan.errors,warnings:plan.warnings,gaps:plan.gaps,positions:plan.positions?.map(x=>({id:x.id,name:x.name})),notice:'Diagnóstico recalculado no servidor; não altera a escala. Dados locais ainda não sincronizados não estão incluídos.'};
}
module.exports={db,audit,budget,consult};
