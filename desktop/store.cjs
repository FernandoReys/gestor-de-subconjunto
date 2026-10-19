'use strict';
const Database = require('better-sqlite3');
const { randomUUID } = require('node:crypto');
class Store {
  constructor(file,codec=null) {
    this.codec=codec;
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    const version = this.db.pragma('user_version', { simple: true });
    if (version > (codec?2:1)) throw new Error('Banco criado por uma versão mais nova. Não é seguro abri-lo.');
    this.db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, base INTEGER NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS backups (id TEXT PRIMARY KEY, reason TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
      `);
    if(codec&&version<2){this.db.transaction(()=>{for(const row of this.db.prepare('SELECT key,value FROM meta').all())this.db.prepare('UPDATE meta SET value=? WHERE key=?').run(this.encodeText(row.value),row.key);for(const table of ['outbox','backups'])for(const row of this.db.prepare('SELECT id,body FROM '+table).all())this.db.prepare('UPDATE '+table+' SET body=? WHERE id=?').run(this.encodeText(row.body),row.id);this.db.pragma('user_version = 2');})();this.db.pragma('wal_checkpoint(TRUNCATE)');this.db.exec('VACUUM');this.db.pragma('wal_checkpoint(TRUNCATE)');}else if(!version)this.db.pragma('user_version = 1');
    if (!this.get('device')) this.set('device', randomUUID());
  }
  encodeText(text){return this.codec?'g2:'+this.codec.encrypt(text):text;}
  decodeText(text){if(!text.startsWith('g2:')){if(this.codec)throw new Error('Conteúdo local sem proteção. Reinicie e revise a migração.');return text;}if(!this.codec)throw new Error('Proteção local do Windows necessária.');return this.codec.decrypt(text.slice(3));}
  get(key) { const row = this.db.prepare('SELECT value FROM meta WHERE key=?').get(key); return row ? JSON.parse(this.decodeText(row.value)) : null; }
  set(key, value) { this.db.prepare('INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, this.encodeText(JSON.stringify(value))); }
  revision() { return this.get('revision') || 0; }
  head() { const row=this.db.prepare('SELECT * FROM outbox LIMIT 1').get();return row?{...row,body:this.decodeText(row.body)}:row; }
  archive(reason, body) { this.db.prepare('INSERT INTO backups VALUES (?,?,?,?)').run(randomUUID(), reason, this.encodeText(JSON.stringify(body)), new Date().toISOString()); }
  enqueue(body) { this.db.prepare('INSERT INTO outbox VALUES (?,?,?,?)').run(randomUUID(), this.revision(), this.encodeText(JSON.stringify(body)), new Date().toISOString()); }
  save(body) {
    this.db.transaction(() => {
      this.set('state', body);
      if (!this.head() && !this.get('conflict')) this.enqueue(body);
    })();
  }
  acknowledge(id, revision,canonical) {
    this.db.transaction(() => {
      const head = this.head();
      if (!head || head.id !== id) throw new Error('Resposta fora de ordem.');
      this.db.prepare('DELETE FROM outbox WHERE id=?').run(id);
      this.set('revision', revision);
      if(canonical){const latest=this.get('state');if(JSON.stringify(latest)===head.body){this.set('state',canonical);head.body=JSON.stringify(canonical);}else{for(const remote of canonical.config?.history||[]){const item=latest.config?.history?.find(x=>x.id===remote.id);if(item)for(const key of ['createdBy','submittedBy','submittedAt','approvedBy','approvedAt'])if(remote[key]!==undefined)item[key]=remote[key];}this.set('state',latest);}}
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
