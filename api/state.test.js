'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const calls = [];
function sql(strings, ...values) {
  const query = { text: strings.join('?'), values };
  calls.push(query);
  if (query.text.startsWith('SELECT config')) return Promise.resolve([]);
  if (query.text.startsWith('SELECT * FROM employees')) return Promise.resolve([]);
  return query;
}
sql.transaction = async queries => { assert.equal(queries.length, 3); return []; };
const originalLoad = Module._load;
Module._load = function (id, ...rest) {
  if (id === '@neondatabase/serverless') return { neon: () => sql };
  return originalLoad.call(this, id, ...rest);
};
const handler = require('./state');
Module._load = originalLoad;

async function request(method, body) {
  const response = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
  await handler({ method, body }, response);
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

test('SQL API persists employee sector and availability in one transaction', async () => {
  calls.length = 0;
  const employee = { id: 'd73c2b93-3cbc-4efb-927a-abbf8579efab', name: 'Ana Souza', sector: 'Sala de máquinas', present: false, allowed: ['20', '30'], fixed: '', initial: '20' };
  const response = await request('PUT', { config: { start: '14:00' }, generated: false, employees: [employee] });
  assert.equal(response.statusCode, 200);
  assert.equal(response.data.saved, true);
  assert.match(calls[2].values[0], /"sector":"Sala de máquinas"/);
  assert.match(calls[2].values[0], /"present":false/);
});
