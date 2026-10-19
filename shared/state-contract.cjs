'use strict';
function validateState(body,strict=false) {
  if (!body || typeof body !== 'object' || !body.config || typeof body.config !== 'object' || Array.isArray(body.config) || !Array.isArray(body.employees) || body.employees.length > 100 || Buffer.byteLength(JSON.stringify(body)) > 2_000_000) throw new Error('Estado inválido ou muito grande.');
  for (const collection of [body.employees, body.config.fps || [], body.config.history || []]) {
    if (!Array.isArray(collection) || new Set(collection.map(x => x?.id)).size !== collection.length || collection.some(x => !x || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x.id))) throw new Error('Identificadores inválidos ou duplicados.');
  }
  if ((body.config.fps || []).length > 50 || (body.config.history || []).length > 100) throw new Error('Limite do catálogo ou histórico excedido.');
  require('../src/client/agenda.js').validate(body.config.productionAgenda||[]);
  if(strict){
    const stations=new Set(['20','30','40','50','60','70']);
    for(const p of body.employees){if(typeof p.name!=='string'||!p.name.trim()||p.name.length>100||!['Operador','Assistente'].includes(p.role||'Operador')||typeof p.active!=='boolean'||typeof p.present!=='boolean'||!Array.isArray(p.allowed)||p.allowed.some(x=>!stations.has(x))||p.fixed&&!stations.has(p.fixed)||p.restrictions&&(!Array.isArray(p.restrictions)||p.restrictions.length>6))throw new Error('Cadastro de funcionário inválido.');}
    for(const p of body.config.fps||[]){if(!['Nacional','Internacional'].includes(p.market)||['name','fp','revision','variation'].some(k=>typeof p[k]!=='string'||!p[k].trim()||p[k].length>120)||!Array.isArray(p.stations)||!p.stations.length||p.stations.some(x=>!stations.has(x.id)||!Number.isInteger(x.requiredCount)||x.requiredCount<1||x.requiredCount>4)||p.stations.reduce((n,x)=>n+x.requiredCount,0)>10)throw new Error('FP inválida ou linha acima de dez posições.');}
    for(const h of body.config.history||[]){if(!['Rascunho','Incompleta','Pronta','Finalizada','Cancelada','Aguardando aprovação','Aprovada'].includes(h.status)||!/^\d{4}-\d{2}-\d{2}$/.test(h.date)||!Array.isArray(h.snapshot?.rows)||h.snapshot.rows.length>100||!Array.isArray(h.snapshot.positions)||h.snapshot.positions.length>10)throw new Error('Histórico inválido.');}
  }
  return body;
}
module.exports = { validateState };
