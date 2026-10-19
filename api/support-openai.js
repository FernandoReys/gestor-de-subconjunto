'use strict';
const OpenAI=require('openai');
const actions=require('../src/client/support-actions');
function tools(){
 const proposals=actions.tools(x=>x,x=>x);
 return [...Object.entries(proposals).map(([name,t])=>({type:'function',name,description:t.description,parameters:t.inputSchema,strict:true})),{type:'function',name:'consult_production',description:'Consultar dados reais autorizados do servidor: equipe disponível/ausente, FPs, agenda e conflitos de escala. Somente leitura.',strict:true,parameters:{type:'object',properties:{category:{type:'string',enum:['employees','fps','agenda','schedule']},from:{type:['string','null']},to:{type:['string','null']}},required:['category','from','to'],additionalProperties:false}}];
}
function failure(error){const status=Number(error.status||error.statusCode)||0;return error.code==='insufficient_quota'?'credits':status===401||status===403?'authentication':status===429?'rate_limit':error.name==='APIConnectionTimeoutError'||error.name==='TimeoutError'?'timeout':'unavailable';}
async function respond({messages,instructions,consult,emit,client}){
 client=client||new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:25000});
 const input=messages.map(x=>({...x})),deadline=AbortSignal.timeout(28000);
 for(let round=0;round<3;round++){
  const options={model:process.env.OPENAI_MODEL||'gpt-6-luna',input,instructions,tools:tools(),parallel_tool_calls:false,store:false,include:['reasoning.encrypted_content'],max_output_tokens:1500,reasoning:{effort:'low'}};
  let result;
  if(emit){const stream=client.responses.stream(options,{signal:deadline});stream.on('response.output_text.delta',event=>emit({type:'delta',text:event.delta}));result=await stream.finalResponse();}
  else result=await client.responses.create(options,{signal:deadline});
  if(result.status!=='completed')throw new Error('Incomplete response');
  const calls=result.output.filter(x=>x.type==='function_call');
  if(calls.length>1)throw new Error('Multiple actions rejected');
  if(!calls.length){if(!result.output_text?.trim())throw new Error('Empty response');return {answer:result.output_text};}
  const call=calls[0],args=JSON.parse(call.arguments);
  if(call.name!=='consult_production')return {answer:'Preparei uma proposta. Confira a prévia e confirme antes de salvar. Nenhuma alteração foi executada.',action:actions.validate({name:call.name,input:args})};
  const data=await consult(args);input.push(...result.output,{type:'function_call_output',call_id:call.call_id,output:JSON.stringify(data)});
 }
 throw new Error('Tool budget exceeded');
}
module.exports={respond,tools,failure};
