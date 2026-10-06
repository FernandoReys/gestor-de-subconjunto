'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const crypto = require('node:crypto');
const auth = require('./auth-core');
process.env.AUTH_SESSION_SECRET = 'test-secret-with-at-least-thirty-two-characters';
process.env.PILOT_ADMIN_PASSWORD_HASH = `${crypto.randomBytes(16).toString('hex')}$${crypto.randomBytes(64).toString('hex')}`;

const calls = [];
function sql(strings, ...values) {
  const query = { text: strings.join('?'), values };
  calls.push(query);
  if (query.text.startsWith('SELECT config')) return Promise.resolve([]);
  if (query.text.startsWith('SELECT * FROM employees')) return Promise.resolve([]);
  if (query.text.startsWith('SELECT employee_id')) return Promise.resolve([]);
  if (query.text.startsWith('SELECT * FROM fps')) return Promise.resolve([]);
  if (query.text.startsWith('SELECT * FROM fp_stations')) return Promise.resolve([]);
  if (query.text.startsWith('SELECT * FROM schedules')) return Promise.resolve([]);
  return query;
}
sql.transaction = async queries => { assert.equal(queries.length, 17); return []; };
const originalLoad = Module._load;
Module._load = function (id, ...rest) {
  if (id === '@neondatabase/serverless') return { neon: () => sql };
  return originalLoad.call(this, id, ...rest);
};
const handler = require('./state');
Module._load = originalLoad;

async function request(method, body) {
  const response = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
  await handler({ method, body, headers:{host:'localhost:3000',origin:'http://localhost:3000',cookie:auth.cookieOptions({headers:{}}).split(';')[0]} }, response);
  return response;
}

test('SQL API starts empty and rejects invalid sector', async () => {
  process.env.DATABASE_URL = 'postgresql://example.invalid/test';
  const empty = await request('GET');
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(empty.data.employees, []);
  assert.equal(empty.headers['Cache-Control'], 'no-store');
  const bad = await request('PUT', { config: {}, employees: [{ id: 'd73c2b93-3cbc-4efb-927a-abbf8579efab', name: 'Ana', sector: 'Outro', allowed: ['20'] }] });
  assert.equal(bad.statusCode, 400);
});

test('SQL API persists employee sector, role and availability in one transaction', async () => {
  calls.length = 0;
  const employee = { id: 'd73c2b93-3cbc-4efb-927a-abbf8579efab', name: 'Ana Souza', sector: 'Sala de máquinas', role: 'Assistente', present: false, allowed: ['20', '30'], fixed: '', initial: '20' };
  const response = await request('PUT', { config: { start: '14:00' }, generated: false, employees: [employee] });
  assert.equal(response.statusCode, 200);
  assert.equal(response.data.saved, true);
  assert.match(calls[5].values[0], /"sector":"Sala de máquinas"/);
  assert.match(calls[5].values[0], /"present":false/);
  assert.match(calls[5].values[0], /"role":"Assistente"/);
});

test('SQL API rejects duplicate extra assignments and invalid organizers', async () => {
  const id='d73c2b93-3cbc-4efb-927a-abbf8579efab';
  const employee={id,name:'Ana',sector:'Subconjunto',role:'Operador',present:true,allowed:['20']};
  const config={extraPosts:[{id:'80',name:'Apoio',employeeId:id},{id:'90',name:'Embalagem',employeeId:id}]};
  assert.equal((await request('PUT',{config,employees:[employee]})).statusCode,400);
  assert.equal((await request('PUT',{config:{organizerIds:[id]},employees:[employee]})).statusCode,400);
});
