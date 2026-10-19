export interface Person {id:string; name:string; active?:boolean; present?:boolean; role?:string}
export interface Position {id:string; name?:string; slot?:number; requiredCount?:number}
export interface Row {kind:string;start:number;end:number;assign:(string|null)[]}
export interface Plan {positions:Position[];rows:Row[];gaps?:unknown[];warnings?:string[];errors?:string[];complete?:boolean;config?:{start?:string;end?:string};employees?:Person[]}
export interface History {id:string;date:string;shift:string;fpId:string;status:string;createdAt:string;updatedAt?:string;snapshot:Plan;product?:string;fp?:string}
export interface Program {id:string;date:string;start:string;end:string;shift:string;fpId:string;status:string;productCode:string;snapshot:{name:string;fp:string;stations:Position[]}}
export interface FP {id:string;fp:string;status?:string}
export interface Workspace {employees:Person[];config:{history?:History[];productionAgenda?:Program[];fps?:FP[]};plan?:Plan|null;rowIndex?:number}
export interface Alert {key:string;text:string;route:string;tone:'danger'|'warning'}
export type Period='today'|'week'|'month';
export function saoPauloDate(now=new Date()):string {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const value=(type:string)=>parts.find(x=>x.type===type)?.value||'';return `${value('year')}-${value('month')}-${value('day')}`;}
export function addDays(date:string,n:number):string {const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function week(date:string):string[]{const day=new Date(date+'T12:00:00Z').getUTCDay();return Array.from({length:7},(_,i)=>addDays(date,i-((day+6)%7)));}
function inPeriod(date:string,today:string,period:Period):boolean{return period==='today'?date===today:period==='month'?date.slice(0,7)===today.slice(0,7):week(today).includes(date);}
const approved=(s:string)=>s==='Aprovada';
const pending=(s:string)=>['Rascunho','Incompleta','Aguardando aprovação'].includes(s);
export function dashboard(data:Workspace,today=saoPauloDate(),period:Period='week'){
 const people=data.employees.filter(x=>x.active!==false),history=data.config.history||[],agenda=data.config.productionAgenda||[],fps=data.config.fps||[],live=agenda.filter(x=>x.status!=='Cancelada');
 const row=data.plan?.rows[Math.min(data.rowIndex||0,Math.max(0,data.plan.rows.length-1))];
 const rowIsWork=row?.kind==='work';
 const coverage=data.plan&&rowIsWork?{filled:row.assign.filter(Boolean).length,total:data.plan.positions.length,empty:Math.max(0,data.plan.positions.length-row.assign.filter(Boolean).length)}:null;
 const alerts:Alert[]=[];
 const latestHistory=history.filter(x=>x.status!=='Cancelada'&&x.status!=='Finalizada').filter((x,i,all)=>!all.some((y,j)=>j!==i&&y.date===x.date&&y.shift===x.shift&&y.fpId===x.fpId&&String(y.updatedAt||y.createdAt)>String(x.updatedAt||x.createdAt)));
 const match=(p:Program)=>latestHistory.find(h=>h.date===p.date&&h.fpId===p.fpId&&h.shift===p.shift&&(!h.snapshot.config?.start||h.snapshot.config.start===p.start));
 for(const p of live.filter(x=>x.date>=today)){
  if(!fps.some(f=>f.id===p.fpId&&f.status!=='Arquivada'))alerts.push({key:'fp-'+p.id,text:`${p.productCode} em ${p.date}: FP ausente ou arquivada.`,route:'agenda',tone:'danger'});
  if(!match(p))alerts.push({key:'program-'+p.id,text:`${p.productCode} em ${p.date}: produção sem escala registrada.`,route:'agenda',tone:'warning'});
 }
 for(const h of latestHistory.filter(x=>x.date>=today)){
  if(h.status==='Aguardando aprovação')alerts.push({key:'approval-'+h.id,text:`${h.fp||'FP'} em ${h.date}: escala aguardando aprovação.`,route:'history',tone:'warning'});
  const assigned=new Set(h.snapshot.rows.flatMap(r=>r.kind==='work'?r.assign.filter((id):id is string=>!!id):[]));
  const unavailable=data.employees.filter(x=>assigned.has(x.id)&&(x.active===false||!x.present));
  if(unavailable.length)alerts.push({key:'absence-'+h.id,text:`${h.fp||'FP'} em ${h.date}: ${unavailable.length} pessoa(s) atualmente ausente(s) ou inativa(s) na escala. Revise a disponibilidade para essa data.`,route:'history',tone:'danger'});
 }
 for(let i=0;i<latestHistory.length;i++)for(let j=i+1;j<latestHistory.length;j++){
  const a=latestHistory[i]!,b=latestHistory[j]!;if(a.date!==b.date||a.date<today)continue;
  const overlaps=a.snapshot.rows.some(ra=>ra.kind==='work'&&b.snapshot.rows.some(rb=>rb.kind==='work'&&ra.start<rb.end&&rb.start<ra.end&&ra.assign.some(id=>!!id&&rb.assign.includes(id))));
  if(overlaps)alerts.push({key:'collision-'+a.id+'-'+b.id,text:`${a.date}: pessoa alocada em escalas simultâneas (${a.fp||'FP'} / ${b.fp||'FP'}).`,route:'history',tone:'danger'});
 }
 if(coverage?.empty)alerts.push({key:'coverage',text:`Montagem em visualização: ${coverage.empty} posição(ões) sem cobertura.`,route:'schedule',tone:'danger'});
 if(data.plan?.warnings?.length)alerts.push({key:'warnings',text:`Montagem atual: ${data.plan.warnings.length} aviso(s) para revisar.`,route:'schedule',tone:'warning'});
 const programs=agenda.filter(p=>inPeriod(p.date,today,period)).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)).map(p=>({...p,people:p.snapshot.stations.reduce((n,s)=>n+(s.requiredCount||1),0),schedule:match(p)?.status||'Sem escala'}));
 return {today,period,availability:{available:people.filter(x=>x.present).length,absent:people.filter(x=>!x.present).length,operators:people.filter(x=>x.present&&x.role!=='Assistente').length,assistants:people.filter(x=>x.present&&x.role==='Assistente').length},todayPrograms:live.filter(x=>x.date===today),schedules:{total:history.length,approved:history.filter(x=>approved(x.status)).length,pending:history.filter(x=>pending(x.status)).length,legacyConfirmed:history.filter(x=>['Pronta','Finalizada'].includes(x.status)).length},coverage,break:row?.kind==='break',weekly:week(today).map(date=>({date,count:live.filter(x=>x.date===date).length})),distribution:data.plan?data.plan.positions.map((p,i)=>({id:p.id,name:p.name||p.id,slot:p.slot||1,assigned:rowIsWork?!!row.assign[i]:null})):[],programs,alerts};
}
