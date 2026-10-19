'use strict';
class Sync {
  constructor(store, request, publish = () => {}) { this.store = store; this.request = request; this.publish = publish; this.running = false; this.failures = 0; this.network = 'offline'; this.error = ''; }
  status() { return { ...this.store.status(), connection: this.network, error: this.error }; }
  async run() {
    if (this.running) return;
    this.running = true; this.network = 'syncing'; this.publish(this.status());
    try {
      const head = this.store.head();
      if (head && !this.store.get('conflict')) {
        const reply = await this.request('POST', { id: head.id, deviceId: this.store.get('device'), baseRevision: head.base, state: JSON.parse(head.body), createdAt: head.created,source:JSON.parse(head.body).source||'windows' });
        if (reply.conflict) { if(reply.revision<=this.store.revision())throw new Error('Banco remoto restaurado ou revisão inválida. Requer revisão administrativa.');this.store.receive(reply); }
        else this.store.acknowledge(head.id, reply.revision,reply.state);
      }
      if (!this.store.head() && !this.store.get('conflict')) {
        const remote = await this.request('GET', null, this.store.revision());
        if (remote.state) this.store.receive(remote);
      }
      this.network = 'online'; this.error = ''; this.failures = 0;
      this.store.set('lastSync', new Date().toISOString());
    } catch (error) { this.network = error.status === 401 ? 'expired' : error.status===403?'denied':'offline'; this.error = error.message; this.failures++;if(error.status===403){try{const remote=await this.request('GET',null,0);if(remote.state)this.store.set('conflict',{...remote,permissionDenied:true});}catch{}} }
    finally { this.running = false; this.publish(this.status()); }
  }
  start() {
    const tick = async () => { await this.run(); this.timer = setTimeout(tick, Math.min(60000, 3000 * 2 ** Math.min(this.failures, 5))); };
    tick();
  }
  stop() { clearTimeout(this.timer); }
}
module.exports = { Sync };
