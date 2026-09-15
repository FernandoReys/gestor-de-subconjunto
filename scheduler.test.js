const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('./scheduler');
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
 for(const row of r.rows.filter(x=>x.kind==='work'))assert.equal(row.assign[1],'demo-6');
});
test('Suplentes geram cobertura completa com restrições e sem repetição',()=>{const p=withRelief(),r=S.generate(S.defaults(),p);verifyPlan(r,p);assert.equal(r.complete,true);assert.equal(r.gaps.length,0);});
test('Ausência e fixação incompatível não são contornadas',()=>{const p=S.sampleEmployees();p[0].present=false;p[1].fixed='40';const r=S.generate(S.defaults(),p);verifyPlan(r,p);assert.ok(r.warnings.some(w=>w.includes('fixação')));assert.ok(r.rows.every(x=>!x.assign.includes(p[0].id)));assert.ok(r.gaps.length);});
test('Funcionário sem cola não ocupa outro posto mesmo com cadastro inconsistente',()=>{const p=withRelief();p[0].noGlue=true;p[0].fixed='20';const r=S.generate(S.defaults(),p);verifyPlan(r,p);assert.ok(r.warnings.some(w=>w.includes('não está permitido')));assert.ok(r.rows.every(x=>!x.assign.includes(p[0].id)));});
test('Horários inválidos ou sobrepostos bloqueiam geração',()=>{for(const c of [{end:'13:00'},{coffee:'18:00',coffeeDuration:30},{lunchDuration:150},{start:'x'}])assert.ok(S.generate({...S.defaults(),...c},S.sampleEmployees()).errors.length);});
test('Modo a cada duas horas é verificável sem apagar o tempo nas pausas',()=>{const p=withRelief(),r=S.generate({...S.defaults(),rotation:'everyTwoHours'},p);verifyPlan(r,p);assert.ok(r.rows.some(x=>x.start===975&&x.kind==='work'));});
