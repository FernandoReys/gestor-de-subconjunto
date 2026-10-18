const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../src/client/scheduler');
const withRelief=()=>[...S.sampleEmployees(),...Array.from({length:6},(_,i)=>({id:'relief-'+i,name:'Suplente '+i,active:true,present:true,noGlue:false,allowed:S.stations.map(s=>s.id),fixed:'',initial:''}))];
function verifyPlan(plan,people){
 assert.deepEqual(plan.errors,[]);
 let previous=Array(6).fill(null),runs=Array(6).fill(0);
 const histories=Object.fromEntries(people.map(p=>[p.id,new Set()]));
 let cursor=S.minutes(plan.config.start),effective=0;
 for(const row of plan.rows){
  assert.equal(row.start,cursor);assert.ok(row.end>row.start);cursor=row.end;
  if(row.kind==='break'){assert.ok(row.assign.every(x=>x===null));continue;}
  effective+=row.end-row.start;
  const assigned=row.assign.filter(Boolean);assert.equal(new Set(assigned).size,assigned.length,'Uma pessoa não pode ocupar dois postos');
  row.assign.forEach((id,j)=>{
   if(id){const p=people.find(p=>p.id===id);assert.ok(S.eligible(p,S.stations[j]),'Pessoa não elegível');
    if(id!==previous[j])assert.ok(!histories[id].has(j),'Retorno a posto proibido');histories[id].add(j);
   }
   if(id!==previous[j])runs[j]=0;
   if(id)runs[j]+=row.end-row.start;
   if(S.stations[j].limit)assert.ok(runs[j]<=S.stations[j].limit,'Limite de permanência excedido');
  });previous=row.assign;
 }
 assert.equal(cursor,S.minutes(plan.config.end));assert.equal(effective,plan.workMinutes);
}
test('Exemplo de seis pessoas: preserva Maria, os intervalos e evidencia impossibilidade',()=>{
 const people=S.sampleEmployees(),r=S.generate(S.defaults(),people);verifyPlan(r,people);assert.equal(r.workMinutes,426);assert.ok(r.gaps.length);assert.equal(r.complete,false);assert.match(r.warnings.join(' '),/pelo menos 8 pessoas/);
 assert.deepEqual(r.rows.filter(x=>x.kind==='break').map(x=>[S.clock(x.start),S.clock(x.end)]),[['16:00','16:15'],['18:10','18:43']]);
 assert.ok(r.rows.filter(x=>x.kind==='work').every(row=>row.assign[1]===null||row.assign[1]==='demo-6'));
 assert.equal(r.totals['demo-6'],120);
});
test('Equipe habilitada gera cobertura completa sem repetição',()=>{const p=withRelief().map(x=>({...x,noGlue:false,fixed:'',allowed:S.stations.map(s=>s.id)})),r=S.generate(S.defaults(),p);verifyPlan(r,p);assert.equal(r.complete,true);assert.equal(r.gaps.length,0);});
test('Ausência e fixação incompatível não são contornadas',()=>{const p=S.sampleEmployees();p[0].present=false;p[1].fixed='40';const r=S.generate(S.defaults(),p);verifyPlan(r,p);assert.ok(r.warnings.some(w=>w.includes('fixação')));assert.ok(r.rows.every(x=>!x.assign.includes(p[0].id)));assert.ok(r.gaps.length);});
test('Funcionário sem cola não ocupa outro posto mesmo com cadastro inconsistente',()=>{const p=withRelief();p[0].noGlue=true;p[0].fixed='20';const r=S.generate(S.defaults(),p);verifyPlan(r,p);assert.ok(r.warnings.some(w=>w.includes('não está permitido')));assert.ok(r.rows.every(x=>!x.assign.includes(p[0].id)));});
test('Horários inválidos ou sobrepostos bloqueiam geração',()=>{for(const c of [{end:'13:00'},{coffee:'18:00',coffeeDuration:30},{lunchDuration:150},{start:'x'}])assert.ok(S.generate({...S.defaults(),...c},S.sampleEmployees()).errors.length);});
test('Modo a cada duas horas é verificável sem apagar o tempo nas pausas',()=>{const p=withRelief(),r=S.generate({...S.defaults(),rotation:'everyTwoHours'},p);verifyPlan(r,p);assert.ok(r.rows.some(x=>x.start===975&&x.kind==='work'));});
test('Assistente não entra no rodízio; posto adicional troca a cada duas horas',()=>{
 const people=withRelief();people[0].role='Assistente';const extra=people[1];
 const config={...S.defaults(),extraPosts:[{id:'80',name:'Apoio',employeeId:extra.id}]};
 const result=S.generate(config,people);
 assert.deepEqual(result.errors,[]);
 assert.ok(result.rows.every(row=>!row.assign.includes(people[0].id)));
 assert.equal(result.positions.at(-1).id,'80');
 assert.equal(result.rows[0].assign.at(-1),extra.id);
 assert.ok(result.rows.some(row=>row.kind==='work'&&row.assign.at(-1)!==extra.id));
 const preckoff=S.generatePreckoff(config,people);
 assert.ok(preckoff.eligible.every(id=>id!==people[0].id&&id!==extra.id));
});
test('FP com duas pessoas no preckoff exige ambas as posições e não repete operador ao mesmo tempo',()=>{
 const people=[...withRelief(),...Array.from({length:5},(_,i)=>({id:'extra-'+i,name:'Extra '+i,role:'Operador',active:true,present:true,allowed:S.stations.map(s=>s.id),fixed:'',initial:''}))];
 const config={...S.defaults(),fpStations:S.stations.map(s=>({id:s.id,requiredCount:s.id==='40'?2:1}))};
 const plan=S.generate(config,people);
 assert.equal(plan.positions.length,7);
 assert.deepEqual(plan.errors,[]);
 for(const row of plan.rows.filter(r=>r.kind==='work'))assert.equal(new Set(row.assign.filter(Boolean)).size,row.assign.filter(Boolean).length);
});
test('Fixação respeita habilidades e expira ao atingir o limite de permanência',()=>{
 const people=withRelief(),id=people[0].id,config={...S.defaults(),locks:{'30-1':id}};
 const plan=S.generate(config,people);
 assert.deepEqual(plan.errors,[]);
 assert.ok(plan.rows.filter(r=>r.kind==='work').every(r=>r.assign[1]===id||r.assign[1]===null));
 assert.ok(plan.gaps.some(g=>g.station==='30-1'));
 let minutes=0;for(const row of plan.rows)if(row.kind==='work'&&row.assign[1]===id)minutes+=row.end-row.start;assert.equal(minutes,120);
 people[0].present=false;
 assert.match(S.generate(config,people).errors.join(' '),/ausente/);
 people[0].present=true;people[0].restrictions=[{stationId:'30',reason:'Restrição temporária'}];
 assert.match(S.generate(config,people).errors.join(' '),/sem habilitação/);
});
test('FP acima de dez posições é recusada antes de montar a escala',()=>{
 const config={...S.defaults(),fpStations:S.stations.map(s=>({id:s.id,requiredCount:2}))};
 const people=Array.from({length:20},(_,i)=>({id:`p-${i}`,name:`Pessoa ${i}`,role:'Operador',active:true,present:true,allowed:S.stations.map(s=>s.id),fixed:'',initial:''}));
 const plan=S.generate(config,people);
 assert.match(plan.errors.join(' '),/10 posições/);assert.equal(plan.rows.length,0);
 for(const row of plan.rows.filter(r=>r.kind==='work'))assert.equal(new Set(row.assign.filter(Boolean)).size,row.assign.filter(Boolean).length);
});

function flexible(n=10){return Array.from({length:n},(_,i)=>({id:'flex-'+i,name:'Operador '+i,active:true,present:true,allowed:S.stations.map(s=>s.id),fixed:''}));}
test('Cada permanência dura exatamente 120 minutos, Preckoff 60, exceto fim do turno',()=>{
 const plan=S.generate({...S.defaults(),rotation:'afterLunch'},flexible());
 assert.equal(plan.complete,true);const runs=new Map(),previous=new Map();
 for(const row of plan.rows){if(row.kind==='break')continue;for(const [j,id] of row.assign.entries()){
  const key=plan.positions[j].key,prior=previous.get(key),limit=plan.positions[j].id==='40'?60:120;
  if(prior&&prior.id!==id){assert.equal(prior.minutes,limit,'Não pode antecipar troca por causa do Preckoff ou almoço');runs.set(key,prior);}
  previous.set(key,prior?.id===id?{id,minutes:prior.minutes+row.end-row.start}:{id,minutes:row.end-row.start});
 }}
 assert.equal(runs.size,6);for(const r of previous.values())assert.ok(r.minutes>0&&r.minutes<=120);
});
test('Preckoff com duas posições não reutiliza pessoa em outra posição do mesmo processo',()=>{
 const plan=S.generate({...S.defaults(),fpStations:[{id:'20',requiredCount:1},{id:'40',requiredCount:2}]},flexible(20));assert.equal(plan.complete,true);
 const sessions=new Map();let previous=[];for(const row of plan.rows){if(row.kind==='break')continue;for(const[j,id]of row.assign.entries()){if(plan.positions[j].id!=='40'||previous[j]===id)continue;assert.ok(!sessions.has(id),'Não pode retornar ao Preckoff em outra posição');sessions.set(id,true);}previous=row.assign;}
});
test('Equipe insuficiente gera lacuna sem retirar pessoa cedo de outro posto',()=>{
 const plan=S.generate(S.defaults(),flexible(6));assert.ok(plan.gaps.length);
 let previous=null,worked=0;for(const row of plan.rows){if(row.kind==='break')continue;if(worked<120){if(previous)for(const j of [0,1,3,4,5])assert.equal(row.assign[j],previous[j]);}worked+=row.end-row.start;previous=row.assign;}
});
