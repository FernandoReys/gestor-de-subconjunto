'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../src/domain/dashboard.ts');
test('dashboard uses Sao Paulo date and never labels a selected FP as scheduled production',()=>{
 assert.equal(D.saoPauloDate(new Date('2026-10-19T01:00:00Z')),'2026-10-18');
 const m=D.dashboard({employees:[],config:{product:'selected-only',fps:[{id:'selected-only',fp:'FP1'}]}},'2026-10-19');
 assert.equal(m.todayPrograms.length,0);assert.equal(m.coverage,null);assert.equal(m.schedules.approved,0);assert.equal(m.weekly.reduce((n,x)=>n+x.count,0),0);
});
test('dashboard filters real programs, reports missing FP and scale and preserves legacy status meaning',()=>{
 const p={id:'p',date:'2026-10-19',start:'14:00',end:'22:00',shift:'B',fpId:'missing',status:'Planejada',productCode:'P1',snapshot:{name:'P1',fp:'FP1',stations:[{id:'20',requiredCount:2}]}};
 const h={id:'h',date:'2026-10-19',shift:'A',fpId:'other',status:'Pronta',createdAt:'2026-10-19',snapshot:{positions:[],rows:[]}};
 const m=D.dashboard({employees:[{id:'e',name:'A',present:true,role:'Operador'},{id:'a',name:'B',present:false}],config:{productionAgenda:[p,{...p,id:'cancelled',status:'Cancelada'}],history:[h]}},'2026-10-19','today');
 assert.equal(m.todayPrograms.length,1);assert.equal(m.programs.length,2);assert.equal(m.programs[0].people,2);assert.equal(m.alerts.length,2);assert.equal(m.schedules.approved,0);assert.equal(m.schedules.legacyConfirmed,1);assert.equal(m.availability.absent,1);
});
test('dashboard detects assignment conflicts and absence from actual work intervals',()=>{
 const history=['a','b'].map((id,i)=>({id,date:'2026-10-19',shift:String(i),fpId:id,fp:id,status:'Aguardando aprovação',createdAt:'2026-10-19',snapshot:{positions:[{id:'20'}],rows:[{kind:'work',start:840,end:960,assign:['e']}]}}));
 const m=D.dashboard({employees:[{id:'e',name:'A',present:false}],config:{history}},'2026-10-19');
 assert.ok(m.alerts.some(x=>x.key.startsWith('collision')));assert.equal(m.alerts.filter(x=>x.key.startsWith('absence')).length,2);
});
