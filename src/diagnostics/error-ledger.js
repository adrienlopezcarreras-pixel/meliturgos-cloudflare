// Owner golden rule (26/10): every error, wherever it happens in MEL, becomes a
// MAX task that fixes it, permanently. Server errors are recorded here once per
// fingerprint (route + code); the hourly self-audit hands each new or returning
// one to MAX through the supervised development queue (Council, then mentor).
// A fingerprint seen again after its repair had a day reopens it.

const DAY_MS = 86_400_000;
// Error repairs are admitted one at a time; the ledger retains every other
// fingerprint durably as OPEN until a later supervised admission pass.
export const MAX_REPAIRS_PER_RUN = 1;
const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const schemaReady = new WeakMap();
function ensureSchema(db) {
  if (!schemaReady.has(db)) {
    schemaReady.set(db, db.prepare(`CREATE TABLE IF NOT EXISTS mel_error_ledger (
      fingerprint TEXT PRIMARY KEY, source TEXT NOT NULL, code TEXT NOT NULL, detail TEXT,
      count INTEGER NOT NULL DEFAULT 0, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN', job_id TEXT, queued_at INTEGER, repairs INTEGER NOT NULL DEFAULT 0)`).run()
      .catch(error => { schemaReady.delete(db); throw error; }));
  }
  return schemaReady.get(db);
}

export function errorFingerprint(source, code) {
  // Ids and numbers inside a route are not part of the error's identity.
  return clean(source, 160).replace(/\/[0-9a-f-]{8,}|\/\d+/gi, '/:id') + '|' + clean(code, 120);
}

// covered: the error already has its own repair path (self-audit streak →
// Council → MAX); the ledger keeps it visible without a second task.
export async function recordError(db, { source, code, detail = '', now = Date.now(), covered = false } = {}) {
  if (!db?.prepare || !source || !code) return null;
  await ensureSchema(db);
  const fingerprint = errorFingerprint(source, code);
  await db.prepare(`INSERT INTO mel_error_ledger (fingerprint, source, code, detail, count, first_seen, last_seen, status)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(fingerprint) DO UPDATE SET count = count + 1, last_seen = excluded.last_seen, detail = excluded.detail`)
    .bind(fingerprint, clean(source, 160), clean(code, 120), clean(detail, 300), now, now, covered ? 'COVERED' : 'OPEN').run();
  return fingerprint;
}

/** Reads the error code of a failed JSON response without consuming it. */
export async function errorCodeOf(response) {
  try {
    const body = await response.clone().json();
    return clean(body?.code || body?.error, 120) || 'HTTP_' + response.status;
  } catch { return 'HTTP_' + response.status; }
}

/** Hourly: hand new errors, and errors back after a repair, to MAX. */
export async function queueErrorRepairs(db, { enqueue, now = Date.now(), limit = MAX_REPAIRS_PER_RUN } = {}) {
  if (!db?.prepare) return { ok: true, status: 'SKIPPED_NO_DB', queued: 0 };
  await ensureSchema(db);
  // A queued error seen again a day after its repair started is reopened.
  await db.prepare("UPDATE mel_error_ledger SET status = 'OPEN' WHERE status = 'QUEUED' AND last_seen > queued_at + ?").bind(DAY_MS).run();
  // A caller cannot expand automatic repair admission beyond one item per pass.
  // This is not an execution lock: the supervised D1 single-flight fence remains authoritative.
  const admissionLimit = Math.min(MAX_REPAIRS_PER_RUN, Math.max(0, Number(limit) || 0));
  const rows = admissionLimit ? (await db.prepare("SELECT * FROM mel_error_ledger WHERE status = 'OPEN' ORDER BY count DESC, last_seen DESC LIMIT ?").bind(admissionLimit).all())?.results || [] : [];
  const queued = [];
  for (const row of rows) {
    const again = Number(row.repairs) > 0 ? ` Déjà réparée ${row.repairs} fois sans effet : la correction précédente n’a pas suffi.` : '';
    const result = await enqueue({
      goal: `Corriger l’erreur ${row.code} sur ${row.source} (${row.count} occurrence(s), dernière : ${new Date(Number(row.last_seen)).toISOString()}). Détail : ${row.detail || '—'}.${again} Trouver la cause, corriger, ajouter un test qui reproduit l’erreur, prouver qu’elle ne revient pas.`,
      requestKey: 'error-ledger:' + row.fingerprint + ':' + (Number(row.repairs) + 1),
      requestedBy: 'mel-autonomy',
      source: 'error-ledger',
      priority: 'P0',
      evidence: { fingerprint: row.fingerprint, count: row.count, first_seen: row.first_seen, last_seen: row.last_seen },
    }).catch(error => ({ error: clean(error?.code || error?.message, 120) }));
    // Never mark an error queued unless the supervised queue confirms a durable job.
    // A failed or capacity-rejected enqueue must leave the fingerprint OPEN for retry.
    if (result?.error || !result?.job_id) continue;
    await db.prepare("UPDATE mel_error_ledger SET status = 'QUEUED', job_id = ?, queued_at = ?, repairs = repairs + 1 WHERE fingerprint = ?")
      .bind(result?.job_id || null, now, row.fingerprint).run();
    queued.push({ fingerprint: row.fingerprint, job_id: result?.job_id || null });
  }
  return { ok: true, status: 'ERROR_REPAIRS_QUEUED', queued: queued.length, repairs: queued };
}
