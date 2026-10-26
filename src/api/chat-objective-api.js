import { applyObjectiveStep, objectiveFromMessage, stepsForObjective } from '../chat/objective-plan.js';

const schemaReady = new WeakMap();

function ensureSchema(db) {
  if (!schemaReady.has(db)) {
    schemaReady.set(db, db.prepare(`CREATE TABLE IF NOT EXISTS mel_chat_objectives (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      conversation_id TEXT,
      title TEXT NOT NULL,
      steps TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`).run().catch(error => { schemaReady.delete(db); throw error; }));
  }
  return schemaReady.get(db);
}

function fail(code, status = 400) {
  return Object.assign(new Error(code), { code, status });
}

function ownerOf(env) {
  return String(env?.MELITURGOS_USER || 'owner').trim().slice(0, 200) || 'owner';
}

function planFromRow(row) {
  if (!row) return null;
  let steps = [];
  try { steps = JSON.parse(row.steps); } catch { steps = []; }
  return {
    id: row.id,
    title: row.title,
    conversation_id: row.conversation_id || '',
    status: row.status,
    steps,
    updated_at: row.updated_at,
  };
}

export async function readActiveObjective(env) {
  const db = env?.DB;
  if (!db) return null;
  await ensureSchema(db);
  const row = await db.prepare(`SELECT id, title, conversation_id, steps, status, updated_at
    FROM mel_chat_objectives WHERE owner = ? AND status = 'ACTIVE' ORDER BY updated_at DESC LIMIT 1`)
    .bind(ownerOf(env)).first();
  return planFromRow(row);
}

export async function saveObjective(env, { text = '', conversationId = '', now = Date.now() } = {}) {
  const db = env?.DB;
  if (!db) throw fail('OBJECTIVE_DB_REQUIRED', 503);
  const title = objectiveFromMessage(text) || String(text || '').trim().slice(0, 400);
  if (title.length < 8) throw fail('OBJECTIVE_TEXT_REQUIRED');
  const steps = stepsForObjective(title);
  await ensureSchema(db);
  const owner = ownerOf(env);
  await db.prepare(`UPDATE mel_chat_objectives SET status = 'REPLACED', updated_at = ? WHERE owner = ? AND status = 'ACTIVE'`)
    .bind(now, owner).run();
  const id = 'obj-' + now.toString(36);
  await db.prepare(`INSERT INTO mel_chat_objectives (id, owner, conversation_id, title, steps, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`)
    .bind(id, owner, String(conversationId || '').slice(0, 120), title, JSON.stringify(steps), now, now).run();
  return { id, title, conversation_id: String(conversationId || ''), status: 'ACTIVE', steps, updated_at: now };
}

export async function updateObjectiveStep(env, { stepId = '', state = '', label = '', now = Date.now() } = {}) {
  const db = env?.DB;
  if (!db) throw fail('OBJECTIVE_DB_REQUIRED', 503);
  const current = await readActiveObjective(env);
  if (!current) throw fail('OBJECTIVE_NOT_FOUND', 404);
  const steps = applyObjectiveStep(current.steps, { stepId, state, label });
  await db.prepare(`UPDATE mel_chat_objectives SET steps = ?, updated_at = ? WHERE id = ? AND status = 'ACTIVE'`)
    .bind(JSON.stringify(steps), now, current.id).run();
  return { ...current, steps, updated_at: now };
}

export async function handleChatObjective(request, env) {
  const url = new URL(request.url);
  try {
    if (request.method === 'GET' && url.pathname === '/api/chat/objective') {
      return Response.json({ ok: true, plan: await readActiveObjective(env) }, { headers: { 'cache-control': 'no-store' } });
    }
    if (request.method !== 'POST') return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
    const body = await request.json().catch(() => ({}));
    if (url.pathname === '/api/chat/objective') {
      const plan = await saveObjective(env, { text: body.text, conversationId: body.conversation_id });
      return Response.json({ ok: true, plan });
    }
    if (url.pathname === '/api/chat/objective/step') {
      const plan = await updateObjectiveStep(env, { stepId: body.step_id, state: body.state, label: body.label });
      return Response.json({ ok: true, plan });
    }
    return null;
  } catch (error) {
    return Response.json({ ok: false, code: error.code || 'OBJECTIVE_FAILED' }, { status: error.status || 500 });
  }
}
