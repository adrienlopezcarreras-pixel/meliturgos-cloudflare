import { migrate } from '../persistence/migrations.js';

export class D1BridgeRepository {
  constructor(db, { memoryState = null } = {}) {
    this.db = db;
    this.ready = null;
    this.memoryState = memoryState ?? { row: null };
  }

  async init() {
    if (this.db) {
      if (!this.ready) this.ready = migrate(this.db);
      await this.ready;
    }
  }

  async heartbeat(status = 'ONLINE', metadata = {}) {
    await this.init();
    const t = Date.now();
    if (!this.db) {
      this.memoryState.row = { bridge_id: 'primary', last_seen: t, status, metadata };
      return this.memoryState.row;
    }
    await this.db.prepare(
      "INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES('primary',?,?,?) ON CONFLICT(bridge_id) DO UPDATE SET last_seen=excluded.last_seen,status=excluded.status,metadata_json=excluded.metadata_json"
    ).bind(t, status, JSON.stringify(metadata)).run();
    return { bridge_id: 'primary', last_seen: t, status };
  }

  async status() {
    await this.init();
    const row = this.db
      ? await this.db.prepare("SELECT * FROM dev_bridge_state WHERE bridge_id='primary'").first()
      : this.memoryState.row;
    if (!row) return { online: false, last_seen: null, status: 'OFFLINE' };
    return {
      online: Date.now() - Number(row.last_seen) < 60000,
      last_seen: Number(row.last_seen),
      status: row.status,
    };
  }
}
