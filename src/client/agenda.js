(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GestorAgenda=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const statuses=['Planejada','Confirmada','Concluída','Cancelada'];
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 function dateValid(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
 function addDays(s,n){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
 function week(s){const d=new Date(s+'T12:00:00Z'),monday=addDays(s,-((d.getUTCDay()+6)%7));return Array.from({length:7},(_,i)=>addDays(monday,i));}
 const clock=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
 const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
 function validate(items){
  if(!Array.isArray(items)||items.length>500||new Set(items.map(x=>x?.id)).size!==items.length)throw new Error('A agenda aceita até 500 programações com identificadores únicos.');
  for(const e of items){if(!e||!uuid.test(e.id)||!uuid.test(e.fpId)||!dateValid(e.date)||!clock(e.start)||!clock(e.end)||e.start===e.end||!text(e.shift,40)||!text(e.productCode,120)||!statuses.includes(e.status)||!e.snapshot||['name','fp','revision','variation','market'].some(k=>!text(e.snapshot[k],120))||!Number.isInteger(e.quantity)||e.quantity<0||e.quantity>10000000||typeof e.notes!=='string'||e.notes.length>1000||typeof e.updatedAt!=='string'||!Number.isFinite(Date.parse(e.updatedAt))||typeof e.googleRequested!=='boolean')throw new Error('Revise data, horário, produto, código, FP e quantidade da programação.');}
  for(const e of items)if(overlap(items,e))throw new Error('Existe sobreposição de produções na mesma linha.');
  return items;
 }
 function interval(e){const start=Date.parse(e.date+'T'+e.start+':00Z'),end=Date.parse((e.end<e.start?addDays(e.date,1):e.date)+'T'+e.end+':00Z');return [start,end];}
 function overlap(items,e){if(e.status==='Cancelada')return null;const [s,t]=interval(e);return items.find(x=>{if(x.id===e.id||x.status==='Cancelada')return false;const[a,b]=interval(x);return s<b&&a<t;})||null;}
 function googleEvent(e){
  validate([e]);const p=e.snapshot;
  return {summary:`Produção · ${e.productCode} · ${p.name}`,description:[`Produto: ${p.name}`,`Destino: ${p.market}`,`Variação: ${p.variation}`,`Código: ${e.productCode}`,`FP: ${p.fp} · revisão ${p.revision}`,`Turno: ${e.shift}`,`Quantidade prevista: ${e.quantity||'Não informada'}`,`Situação: ${e.status}`,e.notes?`Observações: ${e.notes}`:''].filter(Boolean).join('\n'),start:{dateTime:e.date+'T'+e.start+':00',timeZone:'America/Sao_Paulo'},end:{dateTime:(e.end<e.start?addDays(e.date,1):e.date)+'T'+e.end+':00',timeZone:'America/Sao_Paulo'},status:e.status==='Cancelada'?'cancelled':'confirmed',visibility:'private',extendedProperties:{private:{gestorAgendaId:e.id,gestorUpdatedAt:e.updatedAt}}};
 }
 return {statuses,dateValid,addDays,week,validate,overlap,googleEvent};
});
