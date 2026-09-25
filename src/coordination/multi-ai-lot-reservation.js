import { requireValue } from '../core/contracts.js';
import { MULTI_AI_PROTOCOL } from './multi-ai-protocol.js';

export const MULTI_AI_LOT_PREFIX = 'multi-ai-lot:';
export const DEFAULT_MULTI_AI_LOT_LEASE_MS = 10 * 60 * 1000;

const MIN_LEASE_MS = 60 * 1000;
const MAX_LEASE_MS = 30 * 60 * 1000;

const textValue = value => typeof value === 'string' ? value.trim() : '';

function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function leaseMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MULTI_AI_LOT_LEASE_MS;
  return Math.max(MIN_LEASE_MS, Math.min(MAX_LEASE_MS, Math.trunc(parsed)));
}

function lotItem(value) {
  const item = textValue(value);
  requireValue(item.length > 0 && item.length <= 160, 'MULTI_AI_LOT_ITEM_REQUIRED', 400);
  return item;
}

function ownerId(value) {
  const owner = textValue(value);
  requireValue(owner.length > 0 && owner.length <= 200, 'MULTI_AI_LOT_OWNER_REQUIRED', 400);
  return owner;
}

function reservationKey(item) {
  return `${MULTI_AI_LOT_PREFIX}${item}`;
}

function reservedStatus(owner) {
  return `LOT_RESERVED:${owner}`;
}

async function ensureTable(db) {
  requireValue(db && typeof db.prepare === 'function', 'MULTI_AI_LOT_DB_REQUIRED', 500);
  await db.prepare(`CREATE TABLE IF NOT EXISTS dev_bridge_state (
    bridge_id TEXT PRIMARY KEY,
    last_seen INTEGER NOT NULL,
    status TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  )`).run();
}

function parseMetadata(row) {
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.metadata_json || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function getMultiAiLotReservation({ db, item, now = Date.now() } = {}) {
  await ensureTable(db);
  const normalizedItem = lotItem(item);
  const key = reservationKey(normalizedItem);
  const row = await db.prepare('SELECT bridge_id,last_seen,status,metadata_json FROM dev_bridge_state WHERE bridge_id=?')
    .bind(key)
    .first();
  if (!row) return null;
  const metadata = parseMetadata(row);
  return Object.freeze({
    key,
    item: normalizedItem,
    owner: textValue(metadata.owner) || textValue(row.status).replace(/^LOT_RESERVED:/, '') || null,
    source_sha: textValue(metadata.source_sha) || null,
    expires_at: Number(row.last_seen || 0),
    expired: Number(row.last_seen || 0) <= Number(now),
    candidate: MULTI_AI_PROTOCOL.canonicalCandidate,
  });
}

export async function tryReserveMultiAiLot({
  db,
  item,
  owner,
  sourceSha = '',
  leaseMs: requestedLeaseMs = DEFAULT_MULTI_AI_LOT_LEASE_MS,
  now = Date.now(),
} = {}) {
  await ensureTable(db);
  const normalizedItem = lotItem(item);
  const normalizedOwner = ownerId(owner);
  const key = reservationKey(normalizedItem);
  const acquiredAt = Number(now);
  const expiresAt = acquiredAt + leaseMs(requestedLeaseMs);
  const status = reservedStatus(normalizedOwner);
  const source = textValue(sourceSha);
  requireValue(!source || /^[a-f0-9]{40}$/i.test(source), 'MULTI_AI_LOT_SOURCE_SHA_INVALID', 400);

  const metadata = JSON.stringify({
    kind: 'MULTI_AI_LOT_RESERVATION',
    item: normalizedItem,
    owner: normalizedOwner,
    source_sha: source || null,
    candidate: MULTI_AI_PROTOCOL.canonicalCandidate,
    acquired_at: acquiredAt,
    expires_at: expiresAt,
  });

  const result = await db.prepare(`
    INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json)
    VALUES(?,?,?,?)
    ON CONFLICT(bridge_id) DO UPDATE SET
      last_seen=excluded.last_seen,
      status=excluded.status,
      metadata_json=excluded.metadata_json
    WHERE dev_bridge_state.last_seen <= ? OR dev_bridge_state.status = ?
  `).bind(key, expiresAt, status, metadata, acquiredAt, status).run();

  if (changedRows(result) === 1) {
    return Object.freeze({
      acquired: true,
      key,
      item: normalizedItem,
      owner: normalizedOwner,
      source_sha: source || null,
      expires_at: expiresAt,
      candidate: MULTI_AI_PROTOCOL.canonicalCandidate,
    });
  }

  const current = await getMultiAiLotReservation({ db, item: normalizedItem, now: acquiredAt });
  return Object.freeze({
    acquired: false,
    key,
    item: normalizedItem,
    owner: current?.owner || null,
    expires_at: current?.expires_at || 0,
    candidate: MULTI_AI_PROTOCOL.canonicalCandidate,
  });
}

export async function releaseMultiAiLot({ db, item, owner } = {}) {
  await ensureTable(db);
  const normalizedItem = lotItem(item);
  const normalizedOwner = ownerId(owner);
  const result = await db.prepare(`
    UPDATE dev_bridge_state
    SET last_seen=0,status='RELEASED',metadata_json='{}'
    WHERE bridge_id=? AND status=?
  `).bind(reservationKey(normalizedItem), reservedStatus(normalizedOwner)).run();
  return changedRows(result) === 1;
}
