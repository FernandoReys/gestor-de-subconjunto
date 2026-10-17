'use strict';
const Database = require('better-sqlite3');
const { randomUUID } = require('node:crypto');
class Store {
  constructor(file) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    const version = this.db.pragma('user_version', { simple: true });
    if (version > 1) throw new Error('Banco criado por uma versão mais nova. Não é seguro abri-lo.');
    this.db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, base INTEGER NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS backups (id TEXT PRIMARY KEY, reason TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
      PRAGMA user_version = 1;`);
    if (!this.get('device')) this.set('device', randomUUID());
  }
  get(key) { const row = this.db.prepare('SELECT value FROM meta WHERE key=?').get(key); return row ? JSON.parse(row.value) : null; }
  set(key, value) { this.db.prepare('INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  revision() { return this.get('revision') || 0; }
  head() { return this.db.prepare('SELECT * FROM outbox LIMIT 1').get(); }
  archive(reason, body) { this.db.prepare('INSERT INTO backups VALUES (?,?,?,?)').run(randomUUID(), reason, JSON.stringify(body), new Date().toISOString()); }
  enqueue(body) { this.db.prepare('INSERT INTO outbox VALUES (?,?,?,?)').run(randomUUID(), this.revision(), JSON.stringify(body), new Date().toISOString()); }
  save(body) {
    this.db.transaction(() => {
      this.set('state', body);
      if (!this.head() && !this.get('conflict')) this.enqueue(body);
    })();
  }
  acknowledge(id, revision) {
    this.db.transaction(() => {
      const head = this.head();
      if (!head || head.id !== id) throw new Error('Resposta fora de ordem.');
      this.db.prepare('DELETE FROM outbox WHERE id=?').run(id);
      this.set('revision', revision);
      if (JSON.stringify(this.get('state')) !== head.body) this.enqueue(this.get('state'));
    })();
  }
  receive(remote) {
    this.db.transaction(() => {
      if (remote.revision <= this.revision()) return;
      if (!this.get('state') && !this.head()) {
        this.set('state', remote.state); this.set('revision', remote.revision);
      } else {
        // Whole-workspace CAS: never replace an open planner behind the operator's back.
        this.set('conflict', remote);
      }
    })();
  }
  resolve(choice, revision) {
    this.db.transaction(() => {
      const remote = this.get('conflict');
      if (!remote || remote.revision !== revision || !['local', 'remote'].includes(choice)) throw new Error('Revise novamente as versões.');
      this.archive('resolução: versão local', this.get('state'));
      this.archive('resolução: versão remota', remote);
      this.db.prepare('DELETE FROM outbox').run();
      this.set('revision', remote.revision);
      this.set('conflict', null);
      if (choice === 'remote') this.set('state', remote.state);
      else this.enqueue(this.get('state'));
    })();
  }
  status() { return { pending: Number(!!this.head()), conflict: this.get('conflict'), revision: this.revision(), lastSync: this.get('lastSync') }; }
  async backup(file) { await this.db.backup(file); }
  close() { this.db.close(); }
}
module.exports = { Store };
