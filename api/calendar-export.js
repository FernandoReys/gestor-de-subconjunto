'use strict';
const {neon}=require('@neondatabase/serverless');
const {randomUUID,createHash}=require('node:crypto');
const {authorize}=require('./auth-core');
const {publishEvent,CalendarConflict}=require('./calendar-core');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método inválido.'});
 const user=await authorize(req,res);if(!user)return;if(user.role!=='Administrador')return res.status(403).json({error:'Acesso não permitido.'});
 const oauth=require('./google-oauth-core');
 const configured=oauth.configured();
 if(!configured)return res.status(req.method==='GET'?200:503).json({configured:false,connected:false,items:[],error:'Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e a URI de callback no servidor.'});
 const sql=neon(process.env.DESKTOP_DATABASE_URL);const author=oauth.owner(user);

 try{
  let connection=await oauth.connection(user);let calendarId=connection?.calendar_id;
  const connected=Boolean(connection&&!oauth.open(connection.tokens,author).disconnected);
  if(req.method==='GET'){const rows=await sql`SELECT entry_id,updated_at,conflict FROM desktop_calendar_exports WHERE author_id=${author} AND calendar_id=${calendarId||''}`;return res.status(200).json({configured:true,connected,calendarReady:Boolean(calendarId),items:rows});}
  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({error:'Dados inválidos.'});}
  if(body?.action==='authorize'){const auth=await oauth.start(req,user);res.setHeader('Set-Cookie',auth.cookie);return res.status(200).json({url:auth.url});}
  if(body?.action==='disconnect'){if(body.confirm!=='DESCONECTAR')return res.status(400).json({error:'Confirme a desconexão.'});await oauth.disconnect(user);return res.status(200).json({disconnected:true});}
  if(!connected)return res.status(401).json({googleAuthorizationRequired:true,error:'Conecte sua conta Google.'});
  if(!calendarId)calendarId=await oauth.createCalendar(user);
  if(!['publish','review','resolve'].includes(body?.action)||!/^[0-9a-f-]{36}$/i.test(body.entryId)||typeof body.expectedUpdatedAt!=='string')return res.status(400).json({error:'Programação inválida.'});
  const workspace=await sql`SELECT state FROM desktop_workspace WHERE id=1`;
  const entry=workspace[0]?.state?.config?.productionAgenda?.find(x=>x.id===body.entryId);
  if(!entry||!entry.googleRequested||entry.updatedAt!==body.expectedUpdatedAt)return res.status(409).json({error:'A programação mudou ou o envio não foi autorizado. Sincronize o Gestor antes de enviar.'});
  require('../src/client/agenda.js').validate([entry]);
  let token;try{token=await oauth.token(user);}catch{return res.status(401).json({googleAuthorizationRequired:true,error:'Conecte sua conta Google pelo botão Conectar Google Agenda.'});}
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
   await require('./integration-store').audit(user,'google',entry.status==='Cancelada'?'cancel':'publish','success',entry.id);
   await sql`UPDATE desktop_calendar_exports SET etag=${result.etag||null},updated_at=${entry.updatedAt},conflict=false WHERE author_id=${author} AND calendar_id=${calendarId} AND entry_id=${entry.id}::uuid AND lease_id=${lease}::uuid`;
   return res.status(200).json({saved:true,entryId:entry.id,updatedAt:entry.updatedAt});
  }catch(error){await require('./integration-store').audit(user,'google','publish',error instanceof CalendarConflict?'conflict':'failure',entry.id);if(error instanceof CalendarConflict){await sql`UPDATE desktop_calendar_exports SET conflict=true WHERE author_id=${author} AND calendar_id=${calendarId} AND entry_id=${entry.id}::uuid AND lease_id=${lease}::uuid`;return res.status(409).json({conflict:true,error:error.message});}throw error;}
  finally{await sql`UPDATE desktop_calendar_exports SET lease_until=NULL,lease_id=NULL WHERE author_id=${author} AND calendar_id=${calendarId} AND entry_id=${entry.id}::uuid AND lease_id=${lease}::uuid`;}
 }catch{return res.status(503).json({error:'Google Agenda indisponível. Seus dados continuam salvos no Gestor. Verifique a autorização Google e as migrações 004 e 006.'});}
};
