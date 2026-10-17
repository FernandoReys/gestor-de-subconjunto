'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const A=require('../src/client/agenda');
const {validateState}=require('../shared/state-contract.cjs');
const {publishEvent,CalendarConflict}=require('../api/calendar-core');
const entry=(overrides={})=>({id:randomUUID(),fpId:randomUUID(),date:'2026-10-19',start:'14:00',end:'21:54',shift:'Turno A',productCode:'TEST-001',quantity:100,status:'Planejada',notes:'Somente teste',snapshot:{name:'Produto de teste',fp:'FP-TESTE',revision:'01',variation:'Variação de teste',market:'Nacional'},updatedAt:'2026-10-17T22:00:00.000Z',googleRequested:false,...overrides});
test('calendar week starts on Monday and handles month/year boundaries',()=>{
 assert.deepEqual(A.week('2026-10-18'),['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']);
 assert.equal(A.addDays('2026-12-31',1),'2027-01-01');assert.equal(A.dateValid('2026-02-30'),false);assert.equal(A.dateValid('2026-99-99'),false);
});
test('agenda validates ids, codes, statuses and bounds at shared persistence boundary',()=>{
 const x=entry();assert.equal(A.validate([x]).length,1);
 for(const bad of [{date:'2026-02-30'},{start:'25:00'},{end:'14:00'},{quantity:-1},{productCode:''},{status:'X'},{googleRequested:'yes'}])assert.throws(()=>A.validate([{...x,...bad}]));
 assert.throws(()=>A.validate([x,x]));assert.throws(()=>validateState({config:{productionAgenda:[{...x,quantity:1.5}]},employees:[]}));
});
test('line overlap detection includes overnight and ignores cancelled schedules',()=>{
 const a=entry({start:'22:00',end:'06:00'}),b=entry({date:'2026-10-20',start:'05:30',end:'08:00'});
 assert.equal(A.overlap([a],b).id,a.id);assert.equal(A.overlap([{...a,status:'Cancelada'}],b),null);
 assert.equal(A.overlap([a],{...b,start:'06:00'}),null);
});
test('Google payload preserves variation, code, FP snapshot and Sao Paulo midnight rollover',()=>{
 const e=A.googleEvent(entry({start:'22:00',end:'06:00'}));assert.equal(e.start.timeZone,'America/Sao_Paulo');assert.equal(e.end.dateTime,'2026-10-20T06:00:00');assert.match(e.description,/TEST-001/);assert.match(e.description,/FP-TESTE/);assert.equal(e.attendees,undefined);assert.equal(e.visibility,'private');
});
test('Google initial insert uses deterministic id; retry recognizes existing exact data',async()=>{
 const e=entry(),desired=A.googleEvent(e),receipt={event_id:'gestor0123'};let count=0;
 const created=await publishEvent(e,receipt,async(method,path,body)=>{if(method==='GET')return {status:404};count++;assert.equal(body.id,receipt.event_id);return {status:201,data:{...desired,id:body.id,etag:'v1'}};});
 assert.equal(count,1);
 await publishEvent(e,receipt,async(method)=>{assert.equal(method,'GET');return {status:200,data:created};});assert.equal(count,1);
});
test('Google remote edits and concurrent writes are never silently overwritten',async()=>{
 const e=entry(),old={...A.googleEvent(e),summary:'Editado no Google',etag:'remote'};
 await assert.rejects(publishEvent(e,{event_id:'gestor0123',etag:'old'},async()=>({status:200,data:old})),CalendarConflict);
 let writes=0;
 await assert.rejects(publishEvent(e,{event_id:'gestor0123',etag:'remote'},async(method,_path,_body,headers)=>{if(method==='GET')return{status:200,data:old};writes++;assert.equal(headers['If-Match'],'remote');return{status:412};}),CalendarConflict);assert.equal(writes,1);
});
test('Google deletions require review and cancellation of never-exported entry is a no-op',async()=>{
 const e=entry();await assert.rejects(publishEvent(e,{event_id:'gestor0123',etag:'old'},async()=>({status:404})),CalendarConflict);
 let calls=0;await publishEvent({...e,status:'Cancelada'},{event_id:'gestor0123'},async()=>{calls++;return{status:404};});assert.equal(calls,1);
});
test('offline Google export stays queued in persisted agenda and retries from another instance',async()=>{
 const {Store}=require('../desktop/store.cjs'),{CalendarSync}=require('../desktop/calendar-sync.cjs');
 const store=new Store(':memory:');try{
 const e=entry({googleRequested:true});store.save({config:{productionAgenda:[e]},employees:[]});store.acknowledge(store.head().id,1);
 const offline=new CalendarSync(store,async()=>{throw new Error('offline');});await offline.run();assert.equal(store.get('state').config.productionAgenda[0].googleRequested,true);assert.match(offline.error,/offline/);
 let sent=0;const resumed=new CalendarSync(store,async(_path,method,body)=>{if(method==='POST'){sent++;assert.equal(body.entryId,e.id);return{response:{ok:true},data:{saved:true}};}return{response:{ok:true},data:{configured:true,items:[]}};});await resumed.run();assert.equal(sent,1);assert.equal(resumed.error,'');
 }finally{store.close();}
});
