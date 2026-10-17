'use strict';
class CalendarSync{
 constructor(store,remote,publish=()=>{}){this.store=store;this.remote=remote;this.publish=publish;this.running=false;this.error='';}
 async run(){if(!(this.store.get('state')?.config?.productionAgenda||[]).some(x=>x.googleRequested))return;if(this.running||this.store.head()||this.store.get('conflict'))return;this.running=true;
  try{const {response,data}=await this.remote('/api/calendar-export.js');if(!response.ok||!data.configured){this.error=data.error||'Google Agenda não configurado.';return;}
   for(const entry of this.store.get('state')?.config?.productionAgenda||[]){if(!entry.googleRequested)continue;const receipt=data.items.find(r=>r.entry_id===entry.id);if(receipt?.conflict||receipt?.updated_at===entry.updatedAt)continue;if(this.store.head()||this.store.get('conflict'))break;
    const sent=await this.remote('/api/calendar-export.js','POST',{action:'publish',entryId:entry.id,expectedUpdatedAt:entry.updatedAt});if(!sent.response.ok){this.error=sent.data.error||'Envio pendente.';return;}
   }this.error='';
  }catch{this.error='Google Agenda offline. Envio preservado para nova tentativa.';}finally{this.running=false;this.publish(this.error);}
 }
}
module.exports={CalendarSync};
