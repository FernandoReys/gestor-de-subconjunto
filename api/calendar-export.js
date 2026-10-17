'use strict';
const {neon}=require('@neondatabase/serverless');
const {randomUUID,createHash}=require('node:crypto');
const {authorize}=require('./auth-core');
const {publishEvent,CalendarConflict}=require('./calendar-core');
const scopes=['https://www.googleapis.com/auth/calendar.events'];
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método inválido.'});
 const user=authorize(req,res);if(!user)return;if(user.role!=='Administrador')return res.status(403).json({error:'Acesso não permitido.'});
 const connector=process.env.GOOGLE_CALENDAR_CONNECTOR,calendarId=process.env.GOOGLE_CALENDAR_ID;
 const configured=Boolean(process.env.DESKTOP_SYNC_ENABLED==='1'&&process.env.DESKTOP_DATABASE_URL&&connector&&calendarId&&process.env.APP_ORIGIN);
 if(!configured)return res.status(req.method==='GET'?200:503).json({configured:false,items:[],error:'Google Agenda ainda não configurado. Registre o aplicativo OAuth Google, vincule o conector e selecione o calendário no servidor.'});
 const sql=neon(process.env.DESKTOP_DATABASE_URL);const author=user.username;
 try{
  if(req.method==='GET'){const rows=await sql`SELECT entry_id,updated_at,conflict FROM desktop_calendar_exports WHERE author_id=${author} AND calendar_id=${calendarId}`;return res.status(200).json({configured:true,items:rows});}
  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({error:'Dados inválidos.'});}
  const sdk=await import('@vercel/connect');const params={subject:{type:'user',id:author},scopes};
  if(body?.action==='authorize'){
   const origin=new URL(process.env.APP_ORIGIN);if(origin.protocol!=='https:')throw new Error('Origem inválida');
   const auth=await sdk.startAuthorization(connector,params,{callbackUrl:origin.origin+'/#agenda'});
   return res.status(200).json({url:auth.url});
  }
  if(!['publish','review','resolve'].includes(body?.action)||!/^[0-9a-f-]{36}$/i.test(body.entryId)||typeof body.expectedUpdatedAt!=='string')return res.status(400).json({error:'Programação inválida.'});
  const workspace=await sql`SELECT state FROM desktop_workspace WHERE id=1`;
  const entry=workspace[0]?.state?.config?.productionAgenda?.find(x=>x.id===body.entryId);
  if(!entry||!entry.googleRequested||entry.updatedAt!==body.expectedUpdatedAt)return res.status(409).json({error:'A programação mudou ou o envio não foi autorizado. Sincronize o Gestor antes de enviar.'});
  require('../src/client/agenda.js').validate([entry]);
  let token;try{token=await sdk.getToken(connector,params);}catch{return res.status(401).json({googleAuthorizationRequired:true,error:'Conecte sua conta Google pelo botão Conectar Google Agenda.'});}
  const eventId='gestor'+createHash('sha256').update(author+'|'+calendarId+'|'+entry.id).digest('hex');
  await sql`INSERT INTO desktop_calendar_exports(author_id,calendar_id,entry_id,event_id) VALUES(${author},${calendarId},${entry.id}::uuid,${eventId}) ON CONFLICT DO NOTHING`;
  const lease=randomUUID();
  const rows=await sql`UPDATE desktop_calendar_exports SET lease_id=${lease}::uuid,lease_until=now()+interval '60 seconds' WHERE author_id=${author} AND calendar_id=${calendarId} AND entry_id=${entry.id}::uuid AND (lease_until IS NULL OR lease_until<now()) RETURNING *`;
  if(!rows.length)return res.status(409).json({error:'Outro envio deste item está em andamento. Aguarde e tente novamente.'});
  try{
   const base='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendarId);
   const call=async(method,path,data,headers={})=>{const r=await fetch(base+path+'?sendUpdates=none',{method,signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json().catch(()=>({}))};};
   if(body.action==='review'||body.action==='resolve'){
    const current=await call('GET','/events/'+encodeURIComponent(eventId));
    if(current.status!==200||current.data.extendedProperties?.private?.gestorAgendaId!==entry.id)return res.status(409).json({error:'O evento foi removido ou não pertence à programação. Revise diretamente no Google; nenhum evento foi recriado.'});
    if(body.action==='review')return res.status(200).json({remote:{summary:current.data.summary,description:current.data.description,start:current.data.start,end:current.data.end,status:current.data.status},etag:current.data.etag,local:require('../src/client/agenda.js').googleEvent(entry)});
    if(body.reviewedEtag!==current.data.etag)return res.status(409).json({error:'O evento mudou desde a revisão. Abra as versões novamente.'});
    rows[0].etag=body.reviewedEtag;
   }
   const result=await publishEvent(entry,rows[0],call);
   await sql`UPDATE desktop_calendar_exports SET etag=${result.etag||null},updated_at=${entry.updatedAt},conflict=false WHERE author_id=${author} AND calendar_id=${calendarId} AND entry_id=${entry.id}::uuid AND lease_id=${lease}::uuid`;
   return res.status(200).json({saved:true,entryId:entry.id,updatedAt:entry.updatedAt});
  }catch(error){if(error instanceof CalendarConflict){await sql`UPDATE desktop_calendar_exports SET conflict=true WHERE author_id=${author} AND calendar_id=${calendarId} AND entry_id=${entry.id}::uuid AND lease_id=${lease}::uuid`;return res.status(409).json({conflict:true,error:error.message});}throw error;}
  finally{await sql`UPDATE desktop_calendar_exports SET lease_until=NULL,lease_id=NULL WHERE author_id=${author} AND calendar_id=${calendarId} AND entry_id=${entry.id}::uuid AND lease_id=${lease}::uuid`;}
 }catch{return res.status(503).json({error:'Google Agenda indisponível. Seus dados continuam salvos no Gestor. Verifique o conector, a API Google e a migração 004.'});}
};
