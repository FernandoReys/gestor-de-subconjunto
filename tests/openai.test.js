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
test('official SDK sends Responses HTTPS request and parses genuine SSE wire format',async()=>{
 const OpenAI=require('openai');let called=false;
 const response={id:'resp_test',object:'response',created_at:1,status:'completed',model:'gpt-6-luna',output:[{id:'msg_test',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Bom dia, em que posso ajudar?',annotations:[]}]}]};
 const client=new OpenAI({apiKey:'test-only-not-real',maxRetries:0,fetch:async(url,options)=>{
  called=true;assert.equal(String(url),'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.stream,true);assert.equal(body.store,false);
  const events=[{type:'response.created',response:{...response,status:'in_progress',output:[]},sequence_number:0},{type:'response.output_item.added',output_index:0,item:{...response.output[0],status:'in_progress',content:[]},sequence_number:1},{type:'response.content_part.added',output_index:0,content_index:0,item_id:'msg_test',part:{type:'output_text',text:'',annotations:[]},sequence_number:2},{type:'response.output_text.delta',output_index:0,content_index:0,item_id:'msg_test',delta:'Bom dia, em que posso ajudar?',sequence_number:3},{type:'response.completed',response,sequence_number:4}];
  return new Response(events.map(e=>'event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
 }});const chunks=[];const result=await respond({client,messages:[{role:'user',content:'Oi, bom dia'}],instructions:'rules',consult:()=>assert.fail(),emit:e=>chunks.push(e)});assert.ok(called);assert.equal(result.answer,'Bom dia, em que posso ajudar?');assert.equal(chunks[0].text,result.answer);
});
