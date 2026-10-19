'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),fs=require('node:fs'),crypto=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
let database;
const original=Module._load;Module._load=function(id,...args){if(id==='@neondatabase/serverless')return {neon:()=>{const sql=async(strings,...values)=>{const text=strings.reduce((s,x,i)=>s+(i?'$'+i:'')+x,'');return (await database.query(text,values)).rows;};sql.transaction=queries=>Promise.all(queries);return sql;}};return original.call(this,id,...args);};
const identity=require('../api/identity'),auth=require('../api/auth'),core=require('../api/auth-core'),users=require('../api/users'),audit=require('../api/audit'),sync=require('../api/desktop-sync'),approvals=require('../api/approvals');Module._load=original;
async function call(handler,method,body,cookie='',url='/api/test.js',ip='127.0.0.1'){const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};await handler({method,body,url,headers:{host:'example.test',origin:'https://example.test',cookie,'x-forwarded-for':ip}},res);return res;}
test('individual login, direct API permissions, session revocation and one-use password recovery',async()=>{
 database=new PGlite();process.env.AUTH_USERS_ENABLED='1';process.env.DESKTOP_SYNC_ENABLED='1';process.env.DESKTOP_DATABASE_URL='postgres://test-only';process.env.AUTH_SESSION_SECRET='identity-tests-only-session-secret-longer-than-32';process.env.PILOT_ADMIN_PASSWORD_HASH=await identity.hash('ephemeral-test-admin-password');
 try{
  for(const file of ['003_desktop_sync.sql','005_identity_audit.sql'])await database.exec(fs.readFileSync('db/migrations/'+file,'utf8'));
  const login=await call(auth,'POST',{username:'fernando',password:'ephemeral-test-admin-password'});assert.equal(login.statusCode,200);const adminCookie=login.headers['Set-Cookie'].split(';')[0];
  const S=require('../src/client/scheduler'),config=S.defaults(),fp={id:crypto.randomUUID(),name:'Isolated FP',fp:'FP TEST',market:'Nacional',variation:'Test',revision:'01',status:'Ativa',stations:S.stations.map(s=>({...s,requiredCount:1}))};config.fps=[fp];config.product=fp.id;
  const people=Array.from({length:10},(_,i)=>({id:crypto.randomUUID(),name:'Test '+i,role:'Operador',active:true,present:true,allowed:S.stations.map(s=>s.id),fixed:'',initial:''})),organizer={id:crypto.randomUUID(),name:'Organizer test',role:'Assistente',active:true,present:true,allowed:S.stations.map(s=>s.id)};people.push(organizer);config.organizerIds=[organizer.id];
  const plan=S.generate({...config,fpStations:fp.stations},people);assert.equal(plan.complete,true);plan.organizers=[{id:organizer.id,name:organizer.name}];const entry={id:crypto.randomUUID(),date:config.date,shift:config.shiftName,fpId:fp.id,status:'Aguardando aprovação',snapshot:plan};config.history=[entry];
  const saved=await call(sync,'POST',{id:crypto.randomUUID(),deviceId:crypto.randomUUID(),baseRevision:0,createdAt:new Date().toISOString(),state:{config,employees:people,generated:true}},adminCookie);assert.equal(saved.statusCode,200);
  const reviewed=await call(approvals,'POST',{id:entry.id,action:'approve',revision:saved.data.revision,operationId:crypto.randomUUID(),deviceId:crypto.randomUUID()},adminCookie);assert.equal(reviewed.statusCode,200,JSON.stringify(reviewed.data));assert.equal(reviewed.data.state.config.history[0].status,'Aprovada');
  const made=await call(users,'POST',{action:'create',username:'assistant',fullName:'Test Assistant',role:'Assistente',password:'ephemeral-assistant-password'},adminCookie);assert.equal(made.statusCode,200);
  const assistantLogin=await call(auth,'POST',{username:'assistant',password:'ephemeral-assistant-password'},'','/api/auth.js','127.0.0.2');const cookie=assistantLogin.headers['Set-Cookie'].split(';')[0];
  assert.equal((await call(users,'GET',null,cookie)).statusCode,403);assert.equal((await call(audit,'GET',null,cookie)).statusCode,403);assert.equal((await call(approvals,'POST',{},cookie)).statusCode,403);
  assert.equal((await call(sync,'GET',null,cookie,'/api/desktop-sync.js?cursor=0')).statusCode,200);
  const data=await call(users,'GET',null,adminCookie);assert.ok(!JSON.stringify(data.data).includes('password_hash'));
  const reset=await call(users,'POST',{action:'reset',id:made.data.id},adminCookie);assert.equal(reset.statusCode,200);
  const changed=await call(auth,'POST',{action:'reset',username:'assistant',code:reset.data.resetCode,password:'changed-assistant-test-password'},'','/api/auth.js','127.0.0.3');assert.equal(changed.statusCode,200);
  assert.equal((await call(auth,'GET',null,cookie)).statusCode,401);assert.equal((await call(auth,'POST',{action:'reset',username:'assistant',code:reset.data.resetCode,password:'changed-assistant-test-password'},'','/api/auth.js','127.0.0.4')).statusCode,400);
  const auditRows=(await call(audit,'GET',null,adminCookie)).data.items;assert.ok(auditRows.length>=4);assert.ok(!JSON.stringify(auditRows).includes('password_hash'));assert.ok(!JSON.stringify(auditRows).includes(reset.data.resetCode));
  assert.equal((await call(users,'POST',{action:'update',id:login.data.id,fullName:'Admin',role:'Assistente',active:true},adminCookie)).statusCode,400,'last administrator cannot be removed');
 }finally{await database.close();for(const key of ['AUTH_USERS_ENABLED','DESKTOP_SYNC_ENABLED','DESKTOP_DATABASE_URL'])delete process.env[key];}
});
