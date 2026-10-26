// Owner input requests (owner rule, 25/10: "elle prépare tout jusqu'au moment
// où je rentre un texte"). MEL and MAX do all the work themselves and only
// stop for what the owner alone can give: an authentication (connect a
// service, configure a secret outside MEL) or a text answer. One pending
// request per need; answering re-queues the mission with the answer.
// Secrets are never accepted here: they belong to connectors or Cloudflare.

import { enqueueSupervisedDevelopmentRequest } from './owner-development-queue.js';

const KINDS = new Set(['AUTH', 'TEXT']);
const MAX_ANSWER = 4000;
// Tokens and keys look like one long unbroken word, or carry a known prefix.
const SECRET_RE = /^(sk-|ghp_|gho_|github_pat_|xox[abpr]-|AKIA|AIza|hf_)|^[A-Za-z0-9_\-+/=.]{32,}$/;
// Failures that only the owner can lift: a missing connection or credential.
// Only explicit runtime auth errors qualify. Service names (gmail, google…)
// appear in tool names and Council verdicts: they caught a FOUNDER-01 review
// about raw tool JSON as a "Gmail connection" request (26/10).
const AUTH_FAILURE_RE = /\b(OAUTH_[A-Z_]+|[A-Z_]*TOKEN_(?:MISSING|EXPIRED|INVALID|REVOKED)|[A-Z_]*NOT_CONNECTED|[A-Z_]*AUTH(?:ENTICATION|ORIZATION)?_(?:REQUIRED|FAILED|MISSING)|MISSING_(?:SECRET|CREDENTIALS?|API_KEY)|HTTP_?40[13]|UNAUTHORIZED)\b/;
const REVIEW_VERDICT_RE = /^COUNCIL_REJECTED/;

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

const schemaReady = new WeakMap();
function ensureSchema(db) {
  if (!schemaReady.has(db)) {
    schemaReady.set(db, db.prepare(`CREATE TABLE IF NOT EXISTS mel_owner_requests (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, question TEXT NOT NULL,
      link TEXT, job_id TEXT, roadmap_id TEXT, goal TEXT, dedupe_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING', answer TEXT, created_at INTEGER NOT NULL, answered_at INTEGER)`).run()
      .catch(error => { schemaReady.delete(db); throw error; }));
  }
  return schemaReady.get(db);
}

function failure(code, status = 400) {
  return Object.assign(new Error(code), { code, status });
}

export async function createOwnerRequest(db, { kind, title, question, link = '', jobId = '', roadmapId = '', goal = '', dedupeKey = '', now = Date.now() } = {}) {
  const type = String(kind || '').toUpperCase();
  if (!KINDS.has(type)) throw failure('OWNER_REQUEST_KIND_INVALID');
  const row = {
    kind: type,
    title: clean(title, 160),
    question: clean(question, 1200),
    link: /^https:\/\//.test(String(link || '')) ? clean(link, 500) : null,
    job_id: clean(jobId, 200) || null,
    roadmap_id: clean(roadmapId, 120) || null,
    goal: clean(goal, 4000) || null,
    dedupe_key: clean(dedupeKey || `${type}:${roadmapId || jobId || title}`, 300),
  };
  if (!row.title || !row.question) throw failure('OWNER_REQUEST_TEXT_REQUIRED');
  await ensureSchema(db);
  const existing = await db.prepare("SELECT id FROM mel_owner_requests WHERE dedupe_key = ? AND status = 'PENDING'").bind(row.dedupe_key).first();
  if (existing) return { ok: true, status: 'ALREADY_PENDING', id: existing.id };
  const id = `owner-req-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await db.prepare(`INSERT INTO mel_owner_requests (id, kind, title, question, link, job_id, roadmap_id, goal, dedupe_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, row.kind, row.title, row.question, row.link, row.job_id, row.roadmap_id, row.goal, row.dedupe_key, now).run();
  return { ok: true, status: 'CREATED', id };
}

export async function listOwnerRequests(db, { status = 'PENDING', limit = 20 } = {}) {
  await ensureSchema(db);
  const result = await db.prepare(`SELECT id, kind, title, question, link, job_id, roadmap_id, status, created_at, answered_at
    FROM mel_owner_requests WHERE status = ? ORDER BY created_at DESC LIMIT ?`).bind(String(status), Math.max(1, Math.min(100, Number(limit) || 20))).all();
  return result?.results || [];
}

// The answer re-queues the mission. AUTH answers carry no content: the owner
// only confirms that the connection is done.
export async function answerOwnerRequest(env, { id, answer = '', now = Date.now(), enqueue = enqueueSupervisedDevelopmentRequest } = {}) {
  const db = env?.DB;
  await ensureSchema(db);
  const request = await db.prepare("SELECT * FROM mel_owner_requests WHERE id = ? AND status = 'PENDING'").bind(clean(id, 80)).first();
  if (!request) throw failure('OWNER_REQUEST_NOT_PENDING', 404);
  const text = request.kind === 'TEXT' ? clean(answer, MAX_ANSWER) : '';
  if (request.kind === 'TEXT' && !text) throw failure('OWNER_ANSWER_REQUIRED');
  if (SECRET_RE.test(text)) throw failure('OWNER_ANSWER_LOOKS_LIKE_SECRET');
  await db.prepare("UPDATE mel_owner_requests SET status = 'ANSWERED', answer = ?, answered_at = ? WHERE id = ? AND status = 'PENDING'")
    .bind(text || null, now, request.id).run();
  let mission = null;
  if (request.goal) {
    const reply = request.kind === 'AUTH'
      ? 'Le propriétaire a terminé l’authentification demandée : reprendre et prouver le résultat.'
      : `Réponse du propriétaire : ${text}`;
    mission = await enqueue({
      env,
      goal: `${request.goal}\n\n${reply}`.slice(0, 4000),
      requestKey: `owner-answer:${request.id}`,
      requestedBy: 'mel-autonomy',
      source: 'owner-request',
      priority: 'P0',
      roadmapId: request.roadmap_id || '',
    }).catch(error => ({ ok: false, error: String(error?.code || error?.message || 'ENQUEUE_FAILED').slice(0, 120) }));
  }
  return { ok: true, status: 'ANSWERED', id: request.id, mission };
}

// Daily: a mel-autonomy mission that failed for want of a connection becomes
// one AUTH request instead of a silent failure.
export async function raiseOwnerRequestsForFailedJobs(db, { now = Date.now(), sinceMs = 2 * 86_400_000 } = {}) {
  if (!db?.prepare) return { ok: true, status: 'SKIPPED_NO_DB', created: 0 };
  await ensureSchema(db);
  const result = await db.prepare(`SELECT id, goal, error FROM dev_jobs
    WHERE requested_by = 'mel-autonomy' AND status = 'FAILED' AND updated_at > ? ORDER BY updated_at DESC LIMIT 50`).bind(now - sinceMs).all();
  let created = 0;
  for (const job of result?.results || []) {
    const error = String(job.error || '');
    // A Council rejection is a review verdict, never a missing connection.
    const match = REVIEW_VERDICT_RE.test(error) ? null : error.match(AUTH_FAILURE_RE);
    if (!match) continue;
    // Autonomy job ids carry the roadmap item: mel-autonomy-mel-manifest-01-e….
    const roadmapId = (String(job.id || '').match(/^mel-autonomy-([a-z0-9]+-[a-z0-9]+-\d+)/i)?.[1] || '').toUpperCase();
    const done = await createOwnerRequest(db, {
      kind: 'AUTH',
      title: `Connexion requise : ${match[0]}`,
      question: `MEL a préparé la mission${roadmapId ? ' ' + roadmapId : ''} mais elle bloque sur « ${clean(error, 300)} ». Connectez le service concerné (Connecteurs), puis cliquez « C’est fait ».`,
      jobId: job.id,
      roadmapId,
      goal: job.goal,
      dedupeKey: `AUTH:${roadmapId || match[0].toLowerCase()}`,
      now,
    });
    if (done.status === 'CREATED') created++;
  }
  return { ok: true, status: 'OWNER_REQUESTS_SWEPT', created };
}
