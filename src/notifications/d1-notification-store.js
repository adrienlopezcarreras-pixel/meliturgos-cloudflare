import { DomainError, requireValue } from '../core/contracts.js';

function changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function parseRecord(value, code) {
  try {
    const parsed = JSON.parse(value || '');
    requireValue(parsed && typeof parsed === 'object' && !Array.isArray(parsed), code, 500);
    return parsed;
  } catch (error) {
    if (error?.code === code) throw error;
    throw new DomainError(code, 500);
  }
}

export function createD1NotificationStore(db) {
  requireValue(db && typeof db.prepare === 'function', 'NOTIFICATION_D1_REQUIRED', 500);
  let ready = null;

  async function init() {
    if (!ready) {
      ready = Promise.all([
        db.prepare(`CREATE TABLE IF NOT EXISTS notification_subscriptions (
          id TEXT PRIMARY KEY,
          record_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`).run(),
        db.prepare(`CREATE TABLE IF NOT EXISTS notification_deliveries (
          idempotency_key TEXT PRIMARY KEY,
          record_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`).run(),
      ]);
    }
    await ready;
  }

  return Object.freeze({
    async putSubscription(row) {
      await init();
      await db.prepare(`INSERT INTO notification_subscriptions(id,record_json,updated_at)
        VALUES(?,?,?)
        ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json,updated_at=excluded.updated_at`)
        .bind(row.id, JSON.stringify(row), String(row.updatedAt || new Date().toISOString()))
        .run();
      return structuredClone(row);
    },

    async deleteSubscription(id) {
      await init();
      const result = await db.prepare('DELETE FROM notification_subscriptions WHERE id=?').bind(id).run();
      return changes(result) === 1;
    },

    async listSubscriptions() {
      await init();
      const result = await db.prepare('SELECT record_json FROM notification_subscriptions ORDER BY id ASC').all();
      return (result?.results || []).map(row => parseRecord(row.record_json, 'NOTIFICATION_SUBSCRIPTION_CORRUPT'));
    },

    async claimDelivery(key, row) {
      await init();
      const result = await db.prepare(`INSERT OR IGNORE INTO notification_deliveries(
        idempotency_key,record_json,updated_at
      ) VALUES(?,?,?)`)
        .bind(key, JSON.stringify(row), String(row.startedAt || new Date().toISOString()))
        .run();
      return changes(result) === 1;
    },

    async getDelivery(key) {
      await init();
      const row = await db.prepare('SELECT record_json FROM notification_deliveries WHERE idempotency_key=?')
        .bind(key)
        .first();
      return row ? parseRecord(row.record_json, 'NOTIFICATION_DELIVERY_CORRUPT') : null;
    },

    async putDelivery(key, row) {
      await init();
      await db.prepare(`INSERT INTO notification_deliveries(idempotency_key,record_json,updated_at)
        VALUES(?,?,?)
        ON CONFLICT(idempotency_key) DO UPDATE SET
          record_json=excluded.record_json,
          updated_at=excluded.updated_at`)
        .bind(key, JSON.stringify(row), String(row.completedAt || row.startedAt || new Date().toISOString()))
        .run();
      return structuredClone(row);
    },
  });
}
