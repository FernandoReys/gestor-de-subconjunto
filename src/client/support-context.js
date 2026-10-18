(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GestorSupportContext=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function summary(plan,config,employees){
  return {operators:employees.filter(x=>x.active&&x.present&&(x.role||'Operador')==='Operador').length,assistants:employees.filter(x=>x.active&&x.present&&x.role==='Assistente').length,positions:(plan.positions||[]).map(x=>({station:String(x.id),limit:x.id==='40'?60:120})),start:config.start,end:config.end,workMinutes:Number(plan.workMinutes)||0,errors:(plan.errors||[]).length,warnings:(plan.warnings||[]).length,gaps:(plan.gaps||[]).map(x=>({station:String(x.station),start:x.start,end:x.end})).slice(0,40),complete:!!plan.complete};
 }
 function validate(value){
  if(value===undefined||value===null)return null;
  const integer=(n,max)=>Number.isInteger(n)&&n>=0&&n<=max;
  const clock=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  if(!value||typeof value!=='object'||!integer(value.operators,100)||!integer(value.assistants,100)||!integer(value.workMinutes,1440)||!integer(value.errors,100)||!integer(value.warnings,100)||typeof value.complete!=='boolean'||!clock(value.start)||!clock(value.end)||!Array.isArray(value.positions)||value.positions.length>10||!Array.isArray(value.gaps)||value.gaps.length>40)throw new Error('Resumo da escala inválido.');
  const positions=value.positions.map(p=>{if(!p||!/^\d{1,3}$/.test(p.station)||![60,120].includes(p.limit))throw new Error('Posto inválido.');return {station:p.station,limit:p.limit};});
  const gaps=value.gaps.map(g=>{if(!g||!/^\d{1,3}-[1-4]$/.test(g.station)||!integer(g.start,1440)||!integer(g.end,1440)||g.end<=g.start)throw new Error('Pendência inválida.');return {station:g.station,start:g.start,end:g.end};});
  return {operators:value.operators,assistants:value.assistants,positions,start:value.start,end:value.end,workMinutes:value.workMinutes,errors:value.errors,warnings:value.warnings,gaps,complete:value.complete};
 }
 return {summary,validate};
});
