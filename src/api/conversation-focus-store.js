function cleanId(value) {
  return String(value || '').trim().slice(0, 200);
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

async function ensureTable(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS conversation_focus_state (conversation_id TEXT PRIMARY KEY, anchor TEXT NOT NULL DEFAULT '', constraints_json TEXT NOT NULL DEFAULT '[]', excluded_topics_json TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL)").run();
}

export async function loadConversationFocusState(env = {}, conversationId = '') {
  if (!env?.DB) return null;
  const id = cleanId(conversationId);
  if (!id) return null;
  try {
    await ensureTable(env.DB);
    const row = await env.DB.prepare('SELECT * FROM conversation_focus_state WHERE conversation_id=?').bind(id).first();
    if (!row) return null;
    const constraints = parseJson(row.constraints_json, []);
    const excluded = parseJson(row.excluded_topics_json, []);
    return {
      conversation_id:id,
      anchor:String(row.anchor || ''),
      constraints:Array.isArray(constraints) ? constraints : [],
      excluded_topics:Array.isArray(excluded) ? excluded : [],
      updated_at:Number(row.updated_at || 0),
    };
  } catch {
    return null;
  }
}

export async function saveConversationFocusState(env = {}, conversationId = '', focus = null) {
  if (!env?.DB || !focus) return false;
  const id = cleanId(conversationId);
  if (!id) return false;
  try {
    await ensureTable(env.DB);
    await env.DB.prepare("INSERT INTO conversation_focus_state(conversation_id,anchor,constraints_json,excluded_topics_json,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET anchor=excluded.anchor,constraints_json=excluded.constraints_json,excluded_topics_json=excluded.excluded_topics_json,updated_at=excluded.updated_at")
      .bind(
        id,
        String(focus.anchor || '').slice(0, 1200),
        JSON.stringify(Array.isArray(focus.constraints) ? focus.constraints.slice(-8) : []),
        JSON.stringify(Array.isArray(focus.excluded_topics) ? focus.excluded_topics.slice(-12) : []),
        Date.now(),
      )
      .run();
    return true;
  } catch {
    return false;
  }
}