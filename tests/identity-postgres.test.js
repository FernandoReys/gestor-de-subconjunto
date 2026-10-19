'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),crypto=require('node:crypto');
test('transactional roles prevent payload bypass, audit denied writes, preserve receipts and stamp approvals',async()=>{
 const db=new PGlite();try{
  for(const f of ['003_desktop_sync.sql','005_identity_audit.sql'])await db.exec(fs.readFileSync('db/migrations/'+f,'utf8'));
  await db.exec(fs.readFileSync('db/migrations/005_identity_audit.sql','utf8'));
  const admin=crypto.randomUUID(),leader=crypto.randomUUID(),assistant=crypto.randomUUID(),device=crypto.randomUUID();
  for(const [id,role,username]of [[admin,'Administrador','admin'],[leader,'Líder','leader'],[assistant,'Assistente','assistant']])await db.query('INSERT INTO gestor_users(id,username,full_name,password_hash,role) VALUES($1,$2,$2,$3,$4)',[id,username,'not-a-real-hash',role]);
  const push=async(actor,doc,base,transition='write',target=null,op=crypto.randomUUID())=>(await db.query('SELECT gestor_push($1,$2,$3,$4,0,$5,now(),$6,$7,$8) AS result',[op,base,JSON.stringify(doc),actor,device,'web',transition,target])).rows[0].result;
  const state={employees:[],config:{fps:[],history:[],productionAgenda:[]}};
  assert.equal((await push(admin,state,0)).revision,1);
  assert.equal((await push(assistant,{...state,employees:[{id:crypto.randomUUID(),name:'Should not save'}]},1)).forbidden,true);
  assert.equal((await push(assistant,{...state,config:{...state.config,fps:[{id:'bad'}]}},1)).forbidden,true);
  const id=crypto.randomUUID(),draft=structuredClone(state);draft.config.history=[{id,status:'Aguardando aprovação',snapshot:{complete:true},date:'2026-10-19'}];
  const op=crypto.randomUUID(),saved=await push(assistant,draft,1,'write',null,op);
  assert.equal(saved.revision,2);assert.equal(saved.state.config.history[0].createdBy,assistant);
  assert.equal((await push(assistant,draft,1,'write',null,op)).duplicate,true);
  const approved=structuredClone(saved.state);approved.config.history[0].status='Aprovada';
  assert.equal((await push(assistant,approved,2,'approve',id)).forbidden,true);
  assert.equal((await push(admin,approved,2)).forbidden,true,'normal writes cannot forge approval');
  const result=await push(leader,approved,2,'approve',id);assert.equal(result.revision,3);assert.equal(result.state.config.history[0].approvedBy,leader);
  const tampered=structuredClone(result.state);tampered.config.history[0].snapshot.complete=false;
  assert.equal((await push(leader,tampered,3)).forbidden,true);
  await db.query('UPDATE gestor_users SET active=false WHERE id=$1',[assistant]);assert.equal((await push(assistant,result.state,3)).unauthorized,true);
  const logs=(await db.query('SELECT * FROM gestor_audit')).rows;assert.ok(logs.some(x=>x.status==='denied'));assert.ok(logs.some(x=>x.action==='approve'));assert.ok(!JSON.stringify(logs).includes('Should not save'));
  await assert.rejects(db.query('DELETE FROM gestor_audit'));
 }finally{await db.close();}
});
