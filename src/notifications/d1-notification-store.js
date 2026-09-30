import { DomainError } from '../core/contracts.js';
import { createNotificationService } from './notification-service.js';

function requiredOwner(value) {
  const owner = String(value || '').trim().slice(0, 220);
  if (!owner) throw new DomainError('NOTIFICATION_OWNER_REQUIRED', 400);
  return owner;
}

function safeJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function subscriptionFromRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    channel: String(row.channel),
    target: safeJson(row.target_json, {}),
    enabled: Number(row.enabled) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function deliveryFromRow(row) {
  if (!row) return null;
  return safeJson(row.payload_json, null);
}

export class D1NotificationStore {
  constructor(db, { owner } = {}) {
    if (!db?.prepare) throw new DomainError('NOTIFICATION_DB_REQUIRED', 503);
    this.db = db;
    this.owner = requiredOwner(owner);
    this.ready = null;
  }

  async ensure() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.db.prepare(`
          CREATE TABLE IF NOT EXISTS notification_subscriptions (
            owner TEXT NOT NULL,
            id TEXT NOT NULL,
            channel TEXT NOT NULL,
            target_json TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(owner, id)
          )
        `).run();
        await this.db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_owner_channel
          ON notification_subscriptions(owner, channel, enabled)
        `).run();
        await this.db.prepare(`
          CREATE TABLE IF NOT EXISTS notification_deliveries (
            owner TEXT NOT NULL,
            idempotency_key TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(owner, idempotency_key)
          )
        `).run();
        await this.db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_notification_deliveries_owner_updated
          ON notification_deliveries(owner, updated_at DESC)
        `).run();
      })();
    }
    await this.ready;
  }

  async putSubscription(row) {
    await this.ensure();
    await this.db.prepare(`
      INSERT INTO notification_subscriptions(
        owner,id,channel,target_json,enabled,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(owner,id) DO UPDATE SET
        channel=excluded.channel,
        target_json=excluded.target_json,
        enabled=excluded.enabled,
        updated_at=excluded.updated_at
    `).bind(
      this.owner,
      String(row.id),
      String(row.channel),
      JSON.stringify(row.target || {}),
      row.enabled === false ? 0 : 1,
      String(row.createdAt),
      String(row.updatedAt),
    ).run();
    return {
      ...row,
      target: structuredClone(row.target || {}),
    };
  }

  async deleteSubscription(id) {
    await this.ensure();
    const result = await this.db.prepare(
      'DELETE FROM notification_subscriptions WHERE owner=? AND id=?'
    ).bind(this.owner, String(id)).run();
    return Number(result?.meta?.changes || 0) === 1;
  }

  async listSubscriptions() {
    await this.ensure();
    const result = await this.db.prepare(`
      SELECT id,channel,target_json,enabled,created_at,updated_at
      FROM notification_subscriptions
      WHERE owner=?
      ORDER BY created_at ASC, id ASC
    `).bind(this.owner).all();
    return (result?.results || []).map(subscriptionFromRow);
  }

  async claimDelivery(key, row) {
    await this.ensure();
    const idempotencyKey = String(key);
    const result = await this.db.prepare(`
      INSERT OR IGNORE INTO notification_deliveries(
        owner,idempotency_key,payload_json,updated_at
      ) VALUES(?,?,?,?)
    `).bind(
      this.owner,
      idempotencyKey,
      JSON.stringify(row),
      String(row?.completedAt || row?.startedAt || new Date().toISOString()),
    ).run();
    return Number(result?.meta?.changes || 0) === 1;
  }

  async getDelivery(key) {
    await this.ensure();
    const row = await this.db.prepare(`
      SELECT payload_json
      FROM notification_deliveries
      WHERE owner=? AND idempotency_key=?
    `).bind(this.owner, String(key)).first();
    return deliveryFromRow(row);
  }

  async putDelivery(key, row) {
    await this.ensure();
    await this.db.prepare(`
      INSERT INTO notification_deliveries(
        owner,idempotency_key,payload_json,updated_at
      ) VALUES(?,?,?,?)
      ON CONFLICT(owner,idempotency_key) DO UPDATE SET
        payload_json=excluded.payload_json,
        updated_at=excluded.updated_at
    `).bind(
      this.owner,
      String(key),
      JSON.stringify(row),
      String(row?.completedAt || row?.startedAt || new Date().toISOString()),
    ).run();
    return structuredClone(row);
  }

  async status() {
    await this.ensure();
    const [subscriptions, deliveries] = await Promise.all([
      this.db.prepare(
        'SELECT COUNT(*) AS count FROM notification_subscriptions WHERE owner=?'
      ).bind(this.owner).first(),
      this.db.prepare(
        'SELECT COUNT(*) AS count FROM notification_deliveries WHERE owner=?'
      ).bind(this.owner).first(),
    ]);
    return Object.freeze({
      owner: this.owner,
      subscriptions: Number(subscriptions?.count || 0),
      deliveries: Number(deliveries?.count || 0),
      durable: true,
    });
  }
}

export function createD1NotificationStore(db, options = {}) {
  return new D1NotificationStore(db, options);
}


export function createD1NotificationService({
  db,
  owner,
  transports = {},
  authorize = async () => false,
  audit = async () => {},
  clock,
} = {}) {
  const scopedOwner = requiredOwner(owner);
  const scopedAuthorize = async (permission, context = {}) => {
    const contextOwner = String(context?.owner || '').trim().slice(0, 220);
    if (!contextOwner || contextOwner !== scopedOwner) return false;
    return authorize(permission, context);
  };
  return createNotificationService({
    store: new D1NotificationStore(db, { owner: scopedOwner }),
    transports,
    authorize: scopedAuthorize,
    audit,
    ...(typeof clock === 'function' ? { clock } : {}),
  });
}
