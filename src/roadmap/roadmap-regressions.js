// Verified roadmap items are not worked again by MAX. A monthly re-verification
// replays the whole test suite; an item whose tests fail again is stored here
// and reopened (REGRESSED) until a job for it completes after the regression.
const KEY = 'roadmap-regressions';
const ROADMAP_ID = /\b(?:MEL-[A-Z]+-\d{2,3}|GEN2-\d{1,3})\b/g;

export function roadmapIdsInText(text) {
  return [...new Set(String(text || '').match(ROADMAP_ID) || [])];
}

export async function recordRoadmapRegressions(db, ids, { now = Date.now() } = {}) {
  const clean = [...new Set((Array.isArray(ids) ? ids : []).filter(id => /^(?:MEL-[A-Z]+-\d{2,3}|GEN2-\d{1,3})$/.test(id)))].slice(0, 200);
  await db.prepare(`INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)
    ON CONFLICT(bridge_id) DO UPDATE SET last_seen=excluded.last_seen,status=excluded.status,metadata_json=excluded.metadata_json`)
    .bind(KEY, now, clean.length ? 'REGRESSED' : 'CLEAN', JSON.stringify({ ids: clean, at: now })).run();
  return { ids: clean, at: now };
}

// Ids still regressed: listed by the last re-verification and not completed since.
export async function activeRoadmapRegressions(db) {
  if (!db) return [];
  const row = await db.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?').bind(KEY).first().catch(() => null);
  let state = {};
  try { state = JSON.parse(row?.metadata_json || '{}'); } catch {}
  const ids = Array.isArray(state.ids) ? state.ids : [];
  if (!ids.length) return [];
  const done = await db.prepare(`SELECT DISTINCT json_extract(optional_context,'$.roadmap_id') AS id FROM dev_jobs
    WHERE status='COMPLETED' AND created_at > ? AND json_valid(optional_context)`).bind(Number(state.at) || 0).all().catch(() => ({ results: [] }));
  const fixed = new Set((done.results || []).map(r => r.id));
  return ids.filter(id => !fixed.has(id));
}
