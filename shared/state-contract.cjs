'use strict';
function validateState(body) {
  if (!body || typeof body !== 'object' || !body.config || typeof body.config !== 'object' || Array.isArray(body.config) || !Array.isArray(body.employees) || body.employees.length > 100 || Buffer.byteLength(JSON.stringify(body)) > 2_000_000) throw new Error('Estado inválido ou muito grande.');
  for (const collection of [body.employees, body.config.fps || [], body.config.history || []]) {
    if (!Array.isArray(collection) || new Set(collection.map(x => x?.id)).size !== collection.length || collection.some(x => !x || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x.id))) throw new Error('Identificadores inválidos ou duplicados.');
  }
  if ((body.config.fps || []).length > 50 || (body.config.history || []).length > 100) throw new Error('Limite do catálogo ou histórico excedido.');
  require('../src/client/agenda.js').validate(body.config.productionAgenda||[]);
  return body;
}
module.exports = { validateState };
