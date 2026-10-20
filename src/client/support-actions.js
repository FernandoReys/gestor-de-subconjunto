/* Shared allowlist: model output is data, never executable JavaScript or SQL. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.GestorSupportActions=api;})(typeof window==='object'?window:this,function(){
 'use strict';
 const definitions={
  open_page:{description:'Abrir uma página do Gestor.',fields:{page:['overview','agenda','schedule','employees','fp','history','settings','support']}},
  prepare_schedule:{description:'Calcular prévia: fixos permanecem durante todo o período; rodízio de 120 minutos e Preckoff de 60 minutos; aplicação exige revisão.',fields:{}},
  diagnose_system:{description:'Verificar estado local de salvamento, conflitos e pendências. Não altera código.',fields:{}},
  edit_employee:{description:'Abrir cadastro para criar ou editar funcionário por nome exato. Não invente permissões, restrições ou disponibilidade. A pessoa revisa e salva.',fields:{existingName:'text',name:'text',role:['Operador','Assistente'],present:'boolean',sector:'text'}},
  edit_fp:{description:'Abrir formulário de FP para criar ou editar pelo código exato. Não inventar especificações técnicas. Usuário revisa postos e salva.',fields:{existingCode:'text',fp:'text',name:'text',market:['Nacional','Internacional'],revision:'text',variation:'text',product:'text'}},
  schedule_production:{description:'Preencher programação de produção para revisão e salvamento. FP deve existir. Data YYYY-MM-DD, hora HH:MM. Nunca confirma envio ao Google.',fields:{fp:'text',date:'date',start:'time',end:'time',productCode:'text',quantity:'number'}},
  configure_schedule:{description:'Propor FP, data e horário da montagem atual; usuário confirma antes de substituir configuração e calcular prévia.',fields:{fp:'text',date:'date',start:'time',end:'time'}},
  maintenance:{description:'Abrir confirmação digitada da limpeza escolhida. Para limpar sistema/tudo pergunte qual categoria; jamais escolher escopo por conta própria.',fields:{scope:['schedules','employees','unused_fps','settings']}}
 };
 function validate(action){
  if(!action||typeof action!=='object'||!Object.hasOwn(definitions,action.name))throw new Error('Ação não permitida.');
  const input=action.input;if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Parâmetros inválidos.');
  const fields=definitions[action.name].fields,clean={};
  for(const [key,value]of Object.entries(input)){
   if(!Object.hasOwn(fields,key))throw new Error('Campo não permitido: '+key);
   if(value===null)continue;
   const type=fields[key];let valid=Array.isArray(type)?type.includes(value):type==='boolean'?typeof value==='boolean':type==='number'?Number.isInteger(value)&&value>=0&&value<=10000000:typeof value==='string'&&value.length<=120&&value.trim().length>0;
   if(valid&&type==='date')valid=/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
   if(valid&&type==='time')valid=/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
   if(!valid)throw new Error('Valor inválido: '+key);clean[key]=value;
  }
  if(action.name==='open_page'&&!clean.page||action.name==='maintenance'&&!clean.scope)throw new Error('Informe o destino da ação.');
  if(['edit_employee','edit_fp','schedule_production','configure_schedule'].includes(action.name)&&!Object.keys(clean).length)throw new Error('Informe os dados da ação.');
  return {name:action.name,input:clean};
 }
 function tools(tool,jsonSchema){return Object.fromEntries(Object.entries(definitions).map(([name,def])=>[name,tool({description:def.description,inputSchema:jsonSchema({type:'object',properties:Object.fromEntries(Object.entries(def.fields).map(([key,type])=>[key,Array.isArray(type)?{type:['string','null'],enum:[...type,null]}:{type:[type==='boolean'?'boolean':type==='number'?'integer':'string','null'],...(type==='text'?{maxLength:120}:{})}])),additionalProperties:false,required:Object.keys(def.fields)})})]));}
 // Exact commands only; free-form intent belongs to the language model.
 function fallback(question){
  const q=question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[.!?]+$/,'').trim();
  if(/^(limpar|apagar|resetar) (o )?(sistema|tudo)$/.test(q))return {answer:'O que você quer limpar: escalas, funcionários ou FPs não utilizadas? Nada foi apagado. Cada opção mostra o impacto e exige confirmação digitada.'};
  const commands={'montar escala':['prepare_schedule',{}],'preparar escala':['prepare_schedule',{}],'verificar sistema':['diagnose_system',{}],'limpar escalas':['maintenance',{scope:'schedules'}],'limpar funcionarios':['maintenance',{scope:'employees'}],'limpar fps nao utilizadas':['maintenance',{scope:'unused_fps'}],'abrir agenda':['open_page',{page:'agenda'}]};
  const match=commands[q];return match?{answer:'Comando reconhecido pelo Gestor. Revise a ação abaixo.',action:{name:match[0],input:match[1]}}:null;
 }
 return {validate,tools,fallback,definitions};
});
