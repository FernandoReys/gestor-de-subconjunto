'use strict';
const test = require('node:test');
const crypto=require('node:crypto');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../desktop/store.cjs');
const { Sync } = require('../desktop/sync.cjs');
const state = name => ({ config: { note: name }, employees: [], generated: false });
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gestor-'));
  const store = new Store(path.join(dir, 'test.sqlite'));
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return store;
}
test('offline writes and immutable outbox survive restart and backup', async t => {
  const store = fixture(t), file = store.db.name;
  store.save(state('A')); const head = store.head(); store.save(state('B'));
  assert.equal(store.head().body, head.body);
  store.close(); store.db = new (require('better-sqlite3'))(file);
  assert.deepEqual(store.get('state'), state('B')); assert.equal(store.head().id, head.id);
  const backup = file + '.backup'; await store.backup(backup);
  const other = new Store(backup); assert.deepEqual(other.get('state'), state('B')); other.close();
  store.acknowledge(head.id, 1);
  assert.equal(store.head().base, 1); assert.deepEqual(JSON.parse(store.head().body), state('B'));
});
test('lost response retries same operation; no double application', async t => {
  const store = fixture(t); store.save(state('A'));
  const receipts = new Map(); let applies = 0, fail = true;
  const sync = new Sync(store, async (method, body) => {
    if (method === 'GET') return { revision: applies };
    if (!receipts.has(body.id)) receipts.set(body.id, { revision: ++applies });
    if (fail) { fail = false; throw new Error('response lost'); }
    return receipts.get(body.id);
  });
  const id = store.head().id;
  await sync.run(); assert.equal(store.head().id, id); assert.equal(sync.status().connection, 'offline');
  await sync.run(); assert.equal(applies, 1); assert.equal(store.head(), undefined); assert.equal(store.revision(), 1);
});
test('edits while sending stay queued at acknowledged revision', async t => {
  const store = fixture(t); store.save(state('A'));
  const sync = new Sync(store, async () => { store.save(state('B')); return { revision: 1 }; });
  await sync.run(); assert.equal(store.head().base, 1); assert.deepEqual(JSON.parse(store.head().body), state('B'));
});
test('conflict never overwrites local data and resolution archives both versions', async t => {
  const store = fixture(t); store.save(state('A'));
  const sync = new Sync(store, async () => ({ conflict: true, revision: 2, state: state('REMOTE') }));
  await sync.run(); assert.deepEqual(store.get('state'), state('A')); assert.ok(store.get('conflict'));
  store.save(state('LATEST')); assert.throws(() => store.resolve('remote', 1));
  store.resolve('local', 2); assert.equal(store.head().base, 2); assert.deepEqual(JSON.parse(store.head().body), state('LATEST'));
  assert.equal(store.db.prepare('SELECT count(*) n FROM backups').get().n, 2);
});
test('remote revision requires explicit approval when a planner is open', t => {
  const store = fixture(t); store.save(state('A')); store.acknowledge(store.head().id, 1);
  store.receive({ revision: 2, state: state('B') }); assert.deepEqual(store.get('state'), state('A'));
  store.resolve('remote', 2); assert.deepEqual(store.get('state'), state('B')); assert.equal(store.head(), undefined);
});
test('expired session preserves pending data and does not report success', async t => {
  const store = fixture(t); store.save(state('A'));
  const sync = new Sync(store, async () => { const error = new Error('expired'); error.status = 401; throw error; });
  await sync.run(); assert.ok(store.head()); assert.equal(sync.status().connection, 'expired'); assert.equal(store.get('lastSync'), null);
});
test('server validation excludes cleartext, embedded credentials and URL paths', () => {
  const { validateServer } = require('../desktop/config.cjs');
  for (const value of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'file:///test']) assert.throws(() => validateServer(value));
  assert.equal(validateServer('https://example.com/'), 'https://example.com');
});

test('offline policy permits drafts and refuses administrative data or approvals',()=>{
 const {assertDraftOnly}=require('../shared/offline-policy.cjs');const before={employees:[],config:{fps:[],history:[]}};
 assert.equal(assertDraftOnly(before,{employees:[],config:{fps:[],date:'2026-10-19',history:[{id:'draft',status:'Rascunho'}]}}),true);
 assert.throws(()=>assertDraftOnly(before,{employees:[{name:'new'}],config:before.config}));
 assert.throws(()=>assertDraftOnly(before,{employees:[],config:{fps:[],history:[{id:'a',status:'Aprovada'}]}}));
});
test('encrypted local storage migrates existing values and keeps outbox readable only with the codec',async()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'gestor-encryption-')),'data.sqlite');
 const first=new Store(file);first.save({employees:[{name:'Private employee marker'}],config:{}});first.close();
 const key=crypto.randomBytes(32);const codec={encrypt(text){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');},decrypt(text){const bytes=Buffer.from(text,'base64'),cipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString();}};
 const secured=new Store(file,codec);assert.equal(secured.get('state').employees[0].name,'Private employee marker');assert.ok(secured.head().body.includes('Private employee marker'));secured.close();
 assert.equal(fs.readFileSync(file).includes(Buffer.from('Private employee marker')),false);assert.throws(()=>new Store(file));
 const again=new Store(file,codec);assert.equal(again.get('state').employees.length,1);again.close();
});
