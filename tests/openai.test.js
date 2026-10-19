'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{respond,failure,tools}=require('../api/support-openai');
test('official Responses adapter uses server credentials, bounded calls and conversation context',async()=>{
 let params;const result=await respond({client:{responses:{create:async p=>{params=p;return {status:'completed',output:[],output_text:'Bom dia!'};}}},messages:[{role:'user',content:'Oi, bom dia'}],instructions:'Rules',consult:()=>assert.fail()});assert.equal(result.answer,'Bom dia!');assert.equal(params.store,false);assert.equal(params.max_output_tokens,1500);assert.equal(params.input[0].content,'Oi, bom dia');assert.ok(!JSON.stringify(params).includes('apiKey'));
});
test('server consultation feeds real tool result back and proposals never execute mutations',async()=>{
 let rounds=0,reads=0;const client={responses:{create:async p=>{if(rounds++===0)return {status:'completed',output:[{type:'function_call',name:'consult_production',call_id:'a',arguments:JSON.stringify({category:'agenda',from:'2026-10-19',to:'2026-10-25'})}]};assert.match(JSON.stringify(p.input),/FP-REAL/);return {status:'completed',output:[{type:'function_call',name:'configure_schedule',arguments:'{"date":"2026-10-20","fp":"FP-REAL"}'}]};}}};const result=await respond({client,messages:[{role:'user',content:'Prepare amanhã'}],instructions:'rules',consult:async()=>{reads++;return {fp:'FP-REAL'};}});assert.equal(reads,1);assert.equal(result.action.name,'configure_schedule');assert.match(result.answer,/Nenhuma alteração/);
});
test('invalid or arbitrary tool calls and incomplete responses fail closed',async()=>{
 for(const output of [[{type:'function_call',name:'shell',arguments:'{}'}],[{type:'function_call',name:'maintenance',arguments:'{"scope":"everything"}'}]])await assert.rejects(respond({client:{responses:{create:async()=>({status:'completed',output})}},messages:[],instructions:'',consult:()=>assert.fail()}));
 assert.equal(failure({status:401}),'authentication');assert.equal(failure({status:429,code:'insufficient_quota'}),'credits');assert.equal(failure({status:429}),'rate_limit');assert.equal(failure({name:'APIConnectionTimeoutError'}),'timeout');assert.equal(failure({status:503}),'unavailable');assert.ok(tools().every(x=>x.strict));
});
