import { listPersistentWork } from '../capabilities/work-introspection-capabilities.js';
import { D1WorkDagStore } from './d1-work-dag-store.js';

export class D1WorkHistoryReader {
  constructor(db, { storeFactory = (database, id) => new D1WorkDagStore(database, id) } = {}) {
    if (!db) throw Object.assign(new Error('WORK_HISTORY_DB_REQUIRED'), { code: 'WORK_HISTORY_DB_REQUIRED' });
    if (typeof storeFactory !== 'function') throw new Error('WORK_HISTORY_STORE_FACTORY_REQUIRED');
    this.db = db;
    this.storeFactory = storeFactory;
  }

  async list({ limit = 100 } = {}) {
    return listPersistentWork(this.db, {
      limit: Math.max(1, Math.min(100, Math.trunc(Number(limit) || 100))),
    });
  }

  async load(id) {
    const dagId = String(id || '').trim();
    if (!dagId) throw Object.assign(new Error('WORK_HISTORY_ID_REQUIRED'), { code: 'WORK_HISTORY_ID_REQUIRED' });
    const store = this.storeFactory(this.db, dagId);
    if (!store || typeof store.load !== 'function') throw new Error('WORK_HISTORY_STORE_INVALID');
    return store.load();
  }
}
