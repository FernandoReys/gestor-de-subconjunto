'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
test('real PostgreSQL migration, CAS, idempotency, audit and deletions', async () => {
  const db = new PGlite();
  try {
    const migration = fs.readFileSync('db/migrations/003_desktop_sync.sql', 'utf8');
    await db.exec(migration); await db.exec(migration);
    const device = randomUUID(), operation = randomUUID();
    const a = { config: {}, employees: [{ id: randomUUID(), name: 'A' }] };
    const push = async (id, base, state, user = 'fernando') => (await db.query('SELECT desktop_push($1::uuid,$2::integer,$3::jsonb,$4::text,$5::uuid,now()) AS result', [id, base, JSON.stringify(state), user, device])).rows[0].result;
    assert.equal((await push(operation, 0, a)).revision, 1);
    assert.equal((await push(operation, 0, a)).duplicate, true);
    await assert.rejects(push(operation, 0, { config: {}, employees: [] }));
    const conflict = await push(randomUUID(), 0, { config: {}, employees: [] });
    assert.equal(conflict.conflict, true); assert.deepEqual(conflict.state, a);
    assert.equal((await push(randomUUID(), 1, { config: {}, employees: [] })).revision, 2);
    const audit = (await db.query('SELECT * FROM desktop_changes ORDER BY revision')).rows;
    assert.equal(audit.length, 2); assert.equal(audit[0].state.employees.length, 1); assert.equal(audit[1].state.employees.length, 0);
    assert.equal(audit[0].author_id, 'fernando');
    const concurrent = await Promise.all([push(randomUUID(), 2, a), push(randomUUID(), 2, a)]);
    assert.equal(concurrent.filter(x => x.conflict).length, 1);
  } finally { await db.close(); }
});
