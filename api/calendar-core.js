'use strict';
const A=require('../src/client/agenda.js');
class CalendarConflict extends Error {}
// Compare only the fields owned by the Gestor; Google may append offsets and other metadata.
function normalized(event){return JSON.stringify({summary:event.summary,description:event.description,start:event.start?{dateTime:event.start.dateTime?.slice(0,19),timeZone:event.start.timeZone||'America/Sao_Paulo'}:null,end:event.end?{dateTime:event.end.dateTime?.slice(0,19),timeZone:event.end.timeZone||'America/Sao_Paulo'}:null,status:event.status||'confirmed',visibility:event.visibility||'default',private:{gestorAgendaId:event.extendedProperties?.private?.gestorAgendaId,gestorUpdatedAt:event.extendedProperties?.private?.gestorUpdatedAt}});}
async function publishEvent(entry,receipt,call){
 const eventId=receipt.event_id,desired=A.googleEvent(entry),path='/events/'+encodeURIComponent(eventId);
 const current=await call('GET',path);
 if(current.status===200){
  const event=current.data;
  if(event.extendedProperties?.private?.gestorAgendaId!==entry.id)throw new CalendarConflict('O evento do Google não pertence a esta programação. Nenhum dado foi alterado.');
  if(normalized(event)===normalized(desired))return event;
  if(!receipt.etag||event.etag!==receipt.etag)throw new CalendarConflict('O evento foi alterado diretamente no Google. Revise-o antes de substituir; o Gestor preservou as duas versões.');
  const updated=await call('PUT',path,desired,{'If-Match':event.etag});
  if(updated.status===412)throw new CalendarConflict('O evento mudou durante o envio. Nenhuma substituição foi forçada.');
  if(updated.status!==200)throw new Error('Google recusou a atualização do evento.');
  return updated.data;
 }
 if(current.status!==404&&current.status!==410)throw new Error('Não foi possível consultar o evento no Google.');
 if(receipt.etag)throw new CalendarConflict('O evento foi removido no Google. O Gestor não o recriou automaticamente.');
 if(entry.status==='Cancelada')return {id:eventId,etag:null};
 const created=await call('POST','/events',{id:eventId,...desired});
 if(created.status===409)throw new CalendarConflict('O evento já existe. Tente novamente para reconciliar o envio sem duplicação.');
 if(created.status!==200&&created.status!==201)throw new Error('Google recusou a criação do evento.');
 return created.data;
}
module.exports={publishEvent,CalendarConflict,normalized};
