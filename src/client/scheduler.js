(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GestorSchedule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const stations = [
    { id:'20', name:'BSD', description:'Coletor · início do subconjunto', limit:120 },
    { id:'30', name:'Clampe', description:'Posto permitido a pessoas com restrição sem cola', limit:120 },
    { id:'40', name:'Preckoff', description:'Rodízio a cada 60 minutos trabalhados', limit:60 },
    { id:'50', name:'Y', description:'Etapa intermediária do subconjunto', limit:120 },
    { id:'60', name:'Agulha', description:'Etapa anterior à contagem', limit:120 },
    { id:'70', name:'Contagem', description:'Rodízio a cada 120 minutos trabalhados', limit:120 }
  ];
  function minutes(value) {
    if (!/^\d{2}:\d{2}$/.test(value || '')) return NaN;
    const [h,m] = value.split(':').map(Number);
    return h < 24 && m < 60 ? h*60+m : NaN;
  }
  function clock(value) {return `${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;}
  function duration(value) {return `${Math.floor(value/60)}h${String(value%60).padStart(2,'0')}`;}
  function shift(config) {
    const start=minutes(config.start), end=minutes(config.end);
    const breaks=[{name:'Café',start:minutes(config.coffee),duration:Number(config.coffeeDuration)}, {name:'Almoço',start:minutes(config.lunch),duration:Number(config.lunchDuration)}];
    const errors=[];
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) errors.push('Informe entrada e saída válidas no mesmo dia; a saída deve ser posterior à entrada.');
    for(const b of breaks){b.end=b.start+b.duration;if(!Number.isFinite(b.start)||!Number.isInteger(b.duration)||b.duration<1||b.duration>120||b.start<start||b.end>end) errors.push(`${b.name}: confira o horário e a duração dentro do turno.`);}
    if(breaks[0].end>breaks[1].start) errors.push('O café deve terminar antes do almoço, sem sobrepor os intervalos.');
    return {start,end,breaks,errors,workMinutes:end-start-breaks.reduce((n,b)=>n+b.duration,0)};
  }
  function defaults() {
    return { date:new Date().toLocaleDateString('en-CA'),start:'14:00',end:'21:54',coffee:'16:00',coffeeDuration:15,lunch:'18:10',lunchDuration:33,rotation:'everyTwoHours',product:'',shiftName:'Turno A',extraPosts:[],organizerIds:[],fps:[],sectors:['Subconjunto','Linha de Bolsas','Linha de bolsa','Sala de máquinas','Embalagem final','Outros'],shifts:[{id:'00000000-0000-4000-8000-000000000001',name:'Turno A',start:'14:00',end:'21:54'}] };
  }
  function sampleEmployees() {
    const names=['Fernando','Rodrigo','Ricardo','Rogerio','Mario','Maria'];
    const initial=['20','40','50','60','70','30'];
    return names.map((name,i)=>({id:`demo-${i+1}`,name,active:true,present:true,noGlue:i===5,allowed:i===5?['30']:stations.map(s=>s.id),fixed:i===5?'30':'',initial:initial[i],supportPreckoff:false,supportNeedle:false}));
  }
  function eligible(person,station,date=new Date().toLocaleDateString('en-CA')) {
    // Adhesive exposure has not been validated from a real FP. Restricted
    // demo employees may only use the explicitly permitted clampe post.
    if(station.additional)return person.active&&person.present&&(person.role||'Operador')==='Operador'&&!person.noGlue&&!person.fixed;
    const restricted=(person.restrictions||[]).some(r=>r.stationId===station.id && (!r.expiresOn || r.expiresOn>=date));
    return person.active && person.present && (person.role||'Operador')==='Operador' && person.allowed.includes(station.id) && !restricted && (!person.noGlue || station.id==='30') && (!person.fixed || person.fixed===station.id);
  }
  function slots(config) {
    const configured=Array.isArray(config.fpStations)&&config.fpStations.length?config.fpStations:stations.map(s=>({id:s.id,requiredCount:1}));
    return configured.flatMap(item=>{
      const station=stations.find(s=>s.id===item.id);
      if(!station)return [];
      const count=Number(item.requiredCount);
      if(!Number.isInteger(count)||count<1||count>4)return [];
      return Array.from({length:count},(_,i)=>({...station,slot:i+1,key:`${station.id}-${i+1}`}));
    });
  }
  function extraSlots(config){return (Array.isArray(config.extraPosts)?config.extraPosts:[]).flatMap(p=>Array.from({length:Number(p.requiredCount)||1},(_,i)=>({id:p.id,key:`${p.id}-${i+1}`,name:p.name,slot:i+1,notes:p.notes||'',employeeId:p.employeeIds?.[i]||(!i?p.employeeId:'')||''})));}
  function generate(config, employees) {
    const time=shift(config), errors=[...time.errors];
    const positions=[...slots(config),...extraSlots(config).map(p=>({...p,additional:true,limit:120}))];
    if(!positions.length||positions.length>10)errors.push('A linha aceita entre 1 e 10 posições, incluindo postos adicionais.');
    const locks=config.locks||{};
    if(Object.keys(locks).some(key=>!positions.some(s=>s.key===key))||new Set(Object.values(locks)).size!==Object.values(locks).length)errors.push('Há fixações inválidas ou repetidas.');
    config={...config,manualAssignments:{...Object.fromEntries(extraSlots(config).filter(p=>p.employeeId).map(p=>[p.key,p.employeeId])),...(config.manualAssignments||{})}};
    const initialAssignments=Object.entries(config.manualAssignments||{}).filter(([,id])=>id);
    if(new Set(initialAssignments.map(([,id])=>id)).size!==initialAssignments.length)errors.push('O mesmo operador foi selecionado em duas posições iniciais.');
    const extras=extraSlots(config);
    const people=employees.filter(p=>p.active&&p.present&&(p.role||'Operador')==='Operador');
    if(people.length>20) errors.push('Esta simulação aceita até 20 pessoas presentes por vez.');
    if(!people.length) errors.push('Selecione pelo menos uma pessoa presente.');
    if(new Set(people.map(p=>p.id)).size!==people.length) errors.push('Há identificadores de funcionários duplicados.');
    for(const s of positions)if(locks[s.key]&&!people.some(p=>p.id===locks[s.key]&&eligible(p,s,config.date)))errors.push(`Posto ${s.id}: operador fixado ausente ou sem habilitação.`);
    for(const [key,id] of initialAssignments){const s=positions.find(x=>x.key===key);if(!s||!people.some(p=>p.id===id&&eligible(p,s,config.date)))errors.push(`Posto ${s?.id||key}: operador inicial ausente ou sem habilitação.`);}
    // Bind every fixed operator to one position for the entire shift.
    const fixedAssignments={...locks};
    for(const p of people.filter(p=>p.fixed)){
      const existing=Object.entries(fixedAssignments).find(([,id])=>id===p.id);
      if(existing)continue;
      const target=positions.find(s=>s.id===p.fixed&&!fixedAssignments[s.key]);
      if(!target){errors.push(`${p.name}: não há vaga para a fixação no posto ${p.fixed}.`);continue;}
      if(!eligible(p,target,config.date)){errors.push(`${p.name}: posto fixo não está permitido pela restrição.`);continue;}
      fixedAssignments[target.key]=p.id;
    }
    for(const [key,id] of initialAssignments)if((fixedAssignments[key]&&fixedAssignments[key]!==id)||Object.entries(fixedAssignments).some(([other,person])=>other!==key&&person===id))errors.push('Operador inicial entra em conflito com uma fixação.');
    if(errors.length) return {errors,rows:[],gaps:[],warnings:[],workMinutes:0};
    const warnings=[];
    const rotatingPreckoff=positions.filter(s=>s.id==='40'&&!fixedAssignments[s.key]);
    const preckoffEligible=people.filter(p=>!Object.values(fixedAssignments).includes(p.id)&&eligible(p,stations[2],config.date)).length;
    const needed=Math.ceil(time.workMinutes/60)*rotatingPreckoff.length;
    if(preckoffEligible<needed) warnings.push(`Preckoff precisa de pelo menos ${needed} pessoas diferentes para ${duration(time.workMinutes)} efetivas sem retorno ao posto; há ${preckoffEligible} elegíveis. É necessário rever a equipe.`);

    let current=Array(positions.length).fill(null), continuous=Array(positions.length).fill(0), worked=0,lastGeneral=0;
    const visited=people.map(()=>new Set()),total=people.map(()=>0),rows=[];
    let lastKey='', lastRow;
    function choose(due,general) {
      const candidates=positions.map((s,j)=>{
        const fixedId=fixedAssignments[s.key];
        return people.map((p,i)=>({p,i})).filter(({p,i})=>{
          if(fixedId&&p.id!==fixedId)return false;
          if(worked===0&&config.manualAssignments?.[s.key]&&p.id!==config.manualAssignments[s.key])return false;
          if(Object.entries(fixedAssignments).some(([key,id])=>key!==s.key&&id===p.id))return false;
          if(!eligible(p,s,config.date)) return false;
          if(fixedId)return true;
          if(current[j]!==null&&!due[j])return i===current[j];
          if(i===current[j])return false;
          return !visited[i].has(s.id);
        }).map(({p,i})=>({i,score:1000000 + (s.id!=='40'&&visited[i].has('40')?5000:0) + (current[j]===i?3000:0) + (p.fixed||locks[s.key]===p.id?10000:0) + (worked===0&&(config.manualAssignments?.[s.key]===p.id||p.initial===s.id)?1500:0) - total[i] - i*.01}));
      });
      // Track occupied positions instead of used people: at most 2^12 states.
      const size=1<<positions.length,choices=[],byPerson=people.map((_,i)=>[]);
      candidates.forEach((list,j)=>list.forEach(c=>byPerson[c.i].push({j,score:c.score})));
      let scores=new Float64Array(size).fill(-Infinity);scores[0]=0;
      for(const options of byPerson){
        const next=scores.slice(),trace=new Int16Array(size).fill(-1);
        for(let mask=0;mask<size;mask++)if(scores[mask]!==-Infinity){
          for(const {j,score} of options){const bit=1<<j;if(mask&bit)continue;const target=mask|bit,value=scores[mask]+score;if(value>next[target]){next[target]=value;trace[target]=j;}}
        }
        choices.push(trace);scores=next;
      }
      let best=0;for(let mask=1;mask<size;mask++)if(scores[mask]>scores[best])best=mask;
      const assign=Array(positions.length).fill(null);
      for(let i=people.length-1;i>=0;i--){const j=choices[i][best];if(j>=0){assign[j]=i;best^=1<<j;}}
      return assign;
    }
    for(let t=time.start;t<time.end;t++){
      const pause=time.breaks.find(b=>t>=b.start&&t<b.end);
      let reason='Continuidade';
      if(!pause){
        const general=false; // Each position has its own 120/60 effective-minute clock.
        const due=positions.map((s,j)=>current[j]!==null&&!fixedAssignments[s.key]&&s.limit!==null&&continuous[j]>=s.limit);
        if(t===time.start||general||due.some(Boolean)){
          const next=choose(due,general);
          reason=t===time.start?'Início do turno':general?'Rodízio geral':due.map((d,j)=>d?positions[j].name:'').filter(Boolean).join(' + ');
          for(let j=0;j<positions.length;j++){
            if(next[j]!==current[j])continuous[j]=0;
            if(next[j]!==null)visited[next[j]].add(positions[j].id);
          }
          current=next;
          if(general)lastGeneral=worked;
        } else if(t===time.breaks[0].end)reason='Retorno do café';
      }
      const assign=pause?Array(positions.length).fill(null):current.map(i=>i===null?null:people[i].id);
      const key=JSON.stringify([pause?.name||'',assign]);
      if(key!==lastKey){lastRow={start:t,end:t+1,kind:pause?'break':'work',label:pause?pause.name:reason,assign};rows.push(lastRow);lastKey=key;}
      else lastRow.end=t+1;
      if(!pause){worked++;for(let j=0;j<positions.length;j++)if(current[j]!==null){continuous[j]++;total[current[j]]++;}}
    }
    const gaps=[];
    for(const [j,s] of positions.entries()){
      let open=null;
      for(const row of rows){
        if(row.kind==='work'&&!row.assign[j]){
          if(open&&open.end===row.start)open.end=row.end;
          else {open={station:s.key,start:row.start,end:row.end};gaps.push(open);}
        }else open=null;
      }
    }
    return {errors:[],warnings,rows,gaps,positions,workMinutes:time.workMinutes,people:people.map(p=>p.id),totals:Object.fromEntries(people.map((p,i)=>[p.id,total[i]])),complete:gaps.length===0&&warnings.length===0,config:JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(config).filter(([key])=>!['history','productionAgenda','fps','sectors','shifts'].includes(key))))),employees:JSON.parse(JSON.stringify(employees))};
  }
  function generatePreckoff(config, employees) {
    const reserved=new Set(extraSlots(config).map(p=>p.employeeId).filter(Boolean));
    const positions=slots(config).filter(s=>s.id==='40');
    for(const [key,id] of Object.entries(config.locks||{}))if(!positions.some(s=>s.key===key))reserved.add(id);
    const people=employees.filter(p=>!reserved.has(p.id)).sort((a,b)=>(Number(b.supportPreckoff)-Number(a.supportPreckoff))||(a.initial==='40'?-1:0)-(b.initial==='40'?-1:0)||a.name.localeCompare(b.name,'pt-BR'));
    const select=values=>Object.fromEntries(Object.entries(values||{}).filter(([key])=>positions.some(s=>s.key===key)));
    const plan=generate({...config,fpStations:[{id:'40',requiredCount:positions.length||1}],extraPosts:[],locks:select(config.locks),manualAssignments:select(config.manualAssignments)},people.filter(p=>!p.fixed||p.fixed==='40'));
    if(plan.errors.length)return {errors:plan.errors,entries:[],warnings:[],workMinutes:0};
    const entries=[],active=[];
    for(const row of plan.rows){if(row.kind==='break')continue;for(const [j,id] of row.assign.entries()){
      if(!active[j]||active[j].personId!==id){active[j]={slot:entries.length+1,position:plan.positions[j].key,personId:id,minutes:0,fragments:[]};entries.push(active[j]);}
      active[j].minutes+=row.end-row.start;active[j].fragments.push({start:row.start,end:row.end});
    }}
    return {errors:[],warnings:plan.warnings,entries,workMinutes:plan.workMinutes,eligible:people.filter(p=>eligible(p,stations[2],config.date)).map(p=>p.id),config:plan.config,employees:plan.employees};
  }

  return {stations,slots,extraSlots,minutes,clock,duration,shift,defaults,sampleEmployees,eligible,generate,generatePreckoff};
});
