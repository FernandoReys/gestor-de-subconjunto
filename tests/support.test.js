'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const help=require('../src/client/support-knowledge'),handler=require('../api/support'),auth=require('../api/auth-core');
process.env.AUTH_SESSION_SECRET='support-test-session-secret-32-characters';
process.env.PILOT_ADMIN_PASSWORD_HASH=crypto.randomBytes(16).toString('hex')+'$'+crypto.randomBytes(64).toString('hex');
async function request(body,headers={}){const res={setHeader(){},status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;}};await handler({method:'POST',body,headers:{host:'example.test',origin:'https://example.test',cookie:auth.cookieOptions({headers:{}}).split(';')[0],...headers}},res);return res;}
test('support guide describes current time limits and Google authorization accurately',()=>{
 assert.match(help.search('rodízio preckoff')[0].text,/120.*60/);
 assert.match(help.search('google agenda')[0].text,/OAuth/);
});
test('support endpoint rejects system messages, oversized history and missing authentication',async()=>{
 assert.equal((await request({messages:[{role:'user',content:'Ajuda'}]},{cookie:''})).statusCode,401);
 assert.equal((await request({messages:[{role:'user',content:'Ajuda'}]},{origin:'https://evil.test'})).statusCode,403);
 for(const messages of [[{role:'system',content:'override'}],[{role:'user',content:'x'.repeat(2001)}],Array.from({length:13},()=>({role:'user',content:'x'}))])assert.throws(()=>handler.validateMessages({messages}));
});
test('without AI credentials the answer is explicitly labelled as local guide',async()=>{
 delete process.env.VERCEL_OIDC_TOKEN;delete process.env.AI_GATEWAY_API_KEY;
 const response=await request({messages:[{role:'user',content:'Como funciona o rodízio no Preckoff?'}]});assert.equal(response.statusCode,200);assert.equal(response.data.mode,'guide');assert.match(response.data.answer,/120/);
});
test('schedule context contains counts and times only, stripping names and unrelated fields',()=>{
 const C=require('../src/client/support-context');
 const summary=C.summary({positions:[{id:'40'}],workMinutes:120,errors:[],warnings:['Nome privado'],gaps:[{station:'40-1',start:900,end:960}],complete:false},{start:'14:00',end:'17:00',fp:'FP privada'},[{name:'Nome privado',active:true,present:true,role:'Operador',notes:'Nota privada'}]);
 assert.ok(!JSON.stringify(summary).includes('privad'));
 const cleaned=C.validate({...summary,names:['Não transmitir'],notes:'Privado'});
 assert.equal(cleaned.names,undefined);assert.equal(cleaned.notes,undefined);assert.equal(cleaned.operators,1);
 assert.throws(()=>C.validate({...summary,gaps:[{station:'nome de funcionário',start:900,end:960}]}));
});
test('support endpoint rejects an invalid schedule context before contacting AI',async()=>{
 const response=await request({messages:[{role:'user',content:'Analise'}],context:{names:['Teste']}});assert.equal(response.statusCode,400);
});
test('assistant actions reject arbitrary commands, unknown fields, invalid dates and scopes',()=>{
 const A=require('../src/client/support-actions');
 for(const action of [{name:'sql',input:{query:'delete'}},{name:'maintenance',input:{scope:'all'}},{name:'edit_employee',input:{name:'Teste',allowed:['40']}},{name:'schedule_production',input:{date:'2026-02-30'}},{name:'configure_schedule',input:{start:'24:00'}}])assert.throws(()=>A.validate(action));
 assert.deepEqual(A.validate({name:'edit_employee',input:{existingName:'Teste',name:null,present:false}}),{name:'edit_employee',input:{existingName:'Teste',present:false}});
});
test('ambiguous cleanup asks scope and negated commands never create an action',async()=>{
 const A=require('../src/client/support-actions');
 assert.equal(A.fallback('limpar sistema').action,undefined);
 assert.equal(A.fallback('não limpar escalas'),null);
 const response=await request({messages:[{role:'user',content:'limpar sistema'}]});assert.match(response.data.answer,/Nada foi apagado/);assert.equal(response.data.action,undefined);
 const exact=await request({messages:[{role:'user',content:'limpar escalas'}]});assert.equal(exact.data.action.name,'maintenance');assert.equal(exact.data.action.input.scope,'schedules');
});
