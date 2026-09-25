const LEDGER_GENESIS = 'GENESIS';
const MAX_EVIDENCE_CHARS = 64000;
const MAX_LIST_LIMIT = 2000;

function ledgerError(code, status = 500) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function stable(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw ledgerError('EVOLUTION_LEDGER_NON_FINITE_NUMBER', 400);
    return value;
  }
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined) continue;
      if (typeof child === 'function' || typeof child === 'symbol' || typeof child === 'bigint') {
        throw ledgerError('EVOLUTION_LEDGER_UNSUPPORTED_VALUE', 400);
      }
      out[key] = stable(child);
    }
    return out;
  }
  return String(value);
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

async function sha256Hex(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle?.digest) throw ledgerError('EVOLUTION_LEDGER_SHA256_UNAVAILABLE');
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : stableJson(value));
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function clean(value, max = 240) {
  return String(value || '').trim().slice(0, max);
}

function boundedEvidence(value) {
  const normalized = stable(value && typeof value === 'object' ? value : {});
  const json = JSON.stringify(normalized);
  if (json.length > MAX_EVIDENCE_CHARS) throw ledgerError('EVOLUTION_LEDGER_EVIDENCE_TOO_LARGE', 413);
  return { normalized, json };
}

function rowToPublic(row) {
  if (!row) return null;
  let evidence = {};
  try { evidence = JSON.parse(row.evidence_json || '{}'); } catch {}
  return Object.freeze({
    seq: Number(row.seq),
    event_id: String(row.event_id || ''),
    evolution_id: String(row.evolution_id || ''),
    stage: String(row.stage || ''),
    status: String(row.status || ''),
    actor: String(row.actor || ''),
    source_sha: String(row.source_sha || ''),
    branch: String(row.branch || ''),
    evidence,
    occurred_at: Number(row.occurred_at || 0),
    previous_hash: String(row.previous_hash || ''),
    entry_hash: String(row.entry_hash || ''),
  });
}

export async function evolutionLedgerEntryHash(input = {}) {
  return sha256Hex({
    event_id: clean(input.event_id, 220),
    evolution_id: clean(input.evolution_id, 220),
    stage: clean(input.stage, 120),
    status: clean(input.status, 80),
    actor: clean(input.actor, 160),
    source_sha: clean(input.source_sha, 80).toLowerCase(),
    branch: clean(input.branch, 240),
    evidence: stable(input.evidence || {}),
    occurred_at: Number(input.occurred_at || 0),
    previous_hash: clean(input.previous_hash, 80) || LEDGER_GENESIS,
  });
}

export class D1EvolutionLedger {
  constructor(db) {
    this.db = db || null;
    this.ready = null;
  }

  async ensure() {
    if (!this.db?.prepare) throw ledgerError('DB_BINDING_MISSING', 503);
    if (!this.ready) {
      this.ready = this.db.prepare(`
        CREATE TABLE IF NOT EXISTS evolution_ledger (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL UNIQUE,
          evolution_id TEXT NOT NULL,
          stage TEXT NOT NULL,
          status TEXT NOT NULL,
          actor TEXT NOT NULL DEFAULT '',
          source_sha TEXT NOT NULL DEFAULT '',
          branch TEXT NOT NULL DEFAULT '',
          evidence_json TEXT NOT NULL DEFAULT '{}',
          occurred_at INTEGER NOT NULL,
          previous_hash TEXT NOT NULL UNIQUE,
          entry_hash TEXT NOT NULL UNIQUE
        )
      `).run();
    }
    await this.ready;
    return true;
  }

  async getByEventId(eventId) {
    await this.ensure();
    const id = clean(eventId, 220);
    if (!id) return null;
    return rowToPublic(await this.db.prepare('SELECT * FROM evolution_ledger WHERE event_id=?').bind(id).first());
  }

  async latest() {
    await this.ensure();
    return rowToPublic(await this.db.prepare('SELECT * FROM evolution_ledger ORDER BY seq DESC LIMIT 1').first());
  }

  async append({
    event_id = '',
    evolution_id,
    stage,
    status,
    actor = '',
    source_sha = '',
    branch = '',
    evidence = {},
    occurred_at = Date.now(),
  } = {}) {
    await this.ensure();
    const evolutionId = clean(evolution_id, 220);
    const normalizedStage = clean(stage, 120);
    const normalizedStatus = clean(status, 80);
    if (!evolutionId) throw ledgerError('EVOLUTION_ID_REQUIRED', 400);
    if (!normalizedStage) throw ledgerError('EVOLUTION_STAGE_REQUIRED', 400);
    if (!normalizedStatus) throw ledgerError('EVOLUTION_STATUS_REQUIRED', 400);

    const evidenceValue = boundedEvidence(evidence);
    const timestamp = Number(occurred_at);
    if (!Number.isInteger(timestamp) || timestamp <= 0) throw ledgerError('EVOLUTION_OCCURRED_AT_INVALID', 400);

    const deterministicSeed = {
      evolution_id: evolutionId,
      stage: normalizedStage,
      status: normalizedStatus,
      actor: clean(actor, 160),
      source_sha: clean(source_sha, 80).toLowerCase(),
      branch: clean(branch, 240),
      evidence: evidenceValue.normalized,
      occurred_at: timestamp,
    };
    const eventId = clean(event_id, 220) || `evo-${(await sha256Hex(deterministicSeed)).slice(0, 40)}`;

    const existing = await this.getByEventId(eventId);
    if (existing) return { appended: false, entry: existing };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const latest = await this.latest();
      const previousHash = latest?.entry_hash || LEDGER_GENESIS;
      const entry = {
        event_id: eventId,
        evolution_id: evolutionId,
        stage: normalizedStage,
        status: normalizedStatus,
        actor: clean(actor, 160),
        source_sha: clean(source_sha, 80).toLowerCase(),
        branch: clean(branch, 240),
        evidence: evidenceValue.normalized,
        occurred_at: timestamp,
        previous_hash: previousHash,
      };
      const entryHash = await evolutionLedgerEntryHash(entry);
      try {
        await this.db.prepare(`
          INSERT INTO evolution_ledger(
            event_id,evolution_id,stage,status,actor,source_sha,branch,
            evidence_json,occurred_at,previous_hash,entry_hash
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          eventId,
          evolutionId,
          normalizedStage,
          normalizedStatus,
          entry.actor,
          entry.source_sha,
          entry.branch,
          evidenceValue.json,
          timestamp,
          previousHash,
          entryHash,
        ).run();
        return {
          appended: true,
          entry: await this.getByEventId(eventId),
        };
      } catch (error) {
        const duplicate = await this.getByEventId(eventId);
        if (duplicate) return { appended: false, entry: duplicate };
        if (attempt === 4) {
          const failure = ledgerError('EVOLUTION_LEDGER_APPEND_CONFLICT', 409);
          failure.cause = error;
          throw failure;
        }
      }
    }
    throw ledgerError('EVOLUTION_LEDGER_APPEND_FAILED');
  }

  async list({ evolution_id = '', limit = 200 } = {}) {
    await this.ensure();
    const boundedLimit = Math.max(1, Math.min(MAX_LIST_LIMIT, Math.trunc(Number(limit) || 200)));
    const id = clean(evolution_id, 220);
    const result = id
      ? await this.db.prepare('SELECT * FROM evolution_ledger WHERE evolution_id=? ORDER BY seq ASC LIMIT ?').bind(id, boundedLimit).all()
      : await this.db.prepare('SELECT * FROM evolution_ledger ORDER BY seq ASC LIMIT ?').bind(boundedLimit).all();
    return (result?.results || []).map(rowToPublic);
  }

  async verify({ limit = MAX_LIST_LIMIT } = {}) {
    await this.ensure();
    const countRow = await this.db.prepare('SELECT COUNT(*) AS count FROM evolution_ledger').first();
    const count = Number(countRow?.count || 0);
    if (count > MAX_LIST_LIMIT || count > Number(limit || MAX_LIST_LIMIT)) {
      return Object.freeze({
        ok: false,
        code: 'EVOLUTION_LEDGER_VERIFY_LIMIT_EXCEEDED',
        count,
        verified: 0,
        failures: Object.freeze([]),
      });
    }

    const rows = await this.list({ limit: Math.max(1, count || 1) });
    const failures = [];
    let previousHash = LEDGER_GENESIS;
    for (const row of rows) {
      if (row.previous_hash !== previousHash) {
        failures.push({
          seq: row.seq,
          code: 'PREVIOUS_HASH_MISMATCH',
          expected: previousHash,
          actual: row.previous_hash,
        });
      }
      const expectedHash = await evolutionLedgerEntryHash(row);
      if (expectedHash !== row.entry_hash) {
        failures.push({
          seq: row.seq,
          code: 'ENTRY_HASH_MISMATCH',
          expected: expectedHash,
          actual: row.entry_hash,
        });
      }
      previousHash = row.entry_hash;
    }

    return Object.freeze({
      ok: failures.length === 0,
      code: failures.length ? 'EVOLUTION_LEDGER_INTEGRITY_FAILED' : 'EVOLUTION_LEDGER_VERIFIED',
      count,
      verified: rows.length,
      head_hash: rows.length ? rows[rows.length - 1].entry_hash : LEDGER_GENESIS,
      failures: Object.freeze(failures),
    });
  }
}

export { LEDGER_GENESIS };
