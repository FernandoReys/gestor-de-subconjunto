'use strict';
// Offline authority only covers planning fields and non-approved draft history.
const planKeys=new Set(['history','date','start','end','coffee','coffeeDuration','lunch','lunchDuration','rotation','product','shiftName','extraPosts','organizerIds','manualAssignments','locks','scheduleNotes','confirmedId']);
const canonical=v=>JSON.stringify(v);
function assertDraftOnly(before,after){
 if(!before)throw new Error('Sincronize os dados online antes de iniciar o planejamento offline.');
 if(canonical(before.employees)!==canonical(after.employees))throw new Error('Cadastros de funcionários exigem conexão com o servidor.');
 const protectedPart=config=>Object.fromEntries(Object.entries(config||{}).filter(([key])=>!planKeys.has(key)).sort(([a],[b])=>a.localeCompare(b)));
 if(canonical(protectedPart(before.config))!==canonical(protectedPart(after.config)))throw new Error('FPs, agenda e configurações administrativas exigem conexão.');
 const old=before.config.history||[],next=after.config.history||[];
 for(const h of old){const n=next.find(x=>x.id===h.id);if(!n)throw new Error('Exclusões de histórico exigem conexão.');if(['Aprovada','Pronta','Finalizada','Cancelada','Aguardando aprovação'].includes(h.status)&&canonical(h)!==canonical(n))throw new Error('Revisão e aprovação de escala exigem conexão.');}
 for(const h of next){const previous=old.find(x=>x.id===h.id);if((!previous||canonical(previous)!==canonical(h))&&!['Rascunho','Incompleta'].includes(h.status))throw new Error('Offline permite salvar apenas rascunhos de escala.');}
 return true;
}
module.exports={assertDraftOnly};
