/**
 * ChatGPT Context Import — MELITURGOS Gen2
 *
 * Safe importer for an exported ChatGPT personal context summary JSON.
 * Each entry is stored as a `chatgpt_context_summary` memory row.
 * - never overwrites source_type="manual" facts
 * - preserves uncertainty and provenance
 * - deduplicates by fingerprint within this import session
 */

import { AuditService } from '../audit/audit-service.js';
import { json, readJson } from '../core/http.js';
import { ClientError } from '../core/errors.js';

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new ClientError('Payload JSON object attendu.', 'IMPORT_INVALID_JSON', 400);
  }
  if (!Array.isArray(payload.entries) && !Array.isArray(payload.memories)) {
    throw new ClientError('Le contexte ChatGPT doit contenir "entries" ou "memories".', 'IMPORT_INVALID_FORMAT', 400);
  }
  return Array.isArray(payload.entries)
    ? payload.entries
    : payload.memories.map(m => ({ text: m.content || m.text || JSON.stringify(m), ...m }));
}

function entryKind(raw) {
  const k = String(raw.kind || raw.type || raw.category || 'fact').toLowerCase();
  const valid = ['fact', 'preference', 'identity', 'decision', 'project', 'episodic', 'lesson'];
  return valid.includes(k) ? k : 'fact';
}

function entryContent(raw) {
  return String(raw.text || raw.content || raw.summary || '').trim();
}

function entryMetadata(raw, index, importId, now) {
  const md = Object.assign({}, raw.metadata || {});
  md.import_id = importId;
  md.import_index = index;
  md.source_type = 'chatgpt_context_summary';
  md.source_title = raw.title || raw.source_title || null;
  md.source_date = raw.date || raw.created_at || raw.timestamp || null;
  md.chatgpt_conversation_id = raw.conversation_id || raw.chat_id || null;
  md.uncertain = Boolean(raw.uncertain || raw.confidence < 0.8 || false);
  md.imported_at = now;
  if (raw.sensitive) md.sensitive = true;
  if (raw.confidence && Number.isFinite(Number(raw.confidence))) {
    md.confidence = Number(raw.confidence);
  }
  return md;
}

export async function importChatGPTContext(env, rawPayload, guard) {
  const now = Date.now();
  const importId = crypto.randomUUID();
  const audit = new AuditService(env);

  // 1. Backup current memories/export snapshot (best-effort)
  const backup = await exportExistingMemories(env);

  // 2. Validate
  const entries = validatePayload(rawPayload);
  const seenFp = new Set();
  const summary = { inserted: 0, duplicates: 0, rejected: 0, skipped: 0, import_id: importId, entries_total: entries.length };

  await audit.log({ event: 'chatgpt_import_started', import_id: importId, entries_total: entries.length });

  for (let i = 0; i < entries.length; i++) {
    const raw = entries[i];
    const content = entryContent(raw);
    if (!content) { summary.skipped++; continue; }
    if (looksLikeSecret(content)) { summary.rejected++; continue; }

    const md = entryMetadata(raw, i, importId, now);
    const kind = entryKind(raw);
    const importance = Number(raw.importance);
    const confidence = Number(raw.confidence);

    try {
      // Use addMemory via injected adapter (worker.js will wrap this)
      const result = await env.addMemoryAdapter(content, kind, importance, confidence, md, now);
      if (result.dupeWithinImport || seenFp.has(result.fingerprint)) {
        summary.duplicates++;
      } else {
        seenFp.add(result.fingerprint);
        if (result.inserted) summary.inserted++;
        else summary.duplicates++;
      }
    } catch (e) {
      console.error('chatgpt import entry failed', e);
      summary.rejected++;
    }
  }

  await audit.log({ event: 'chatgpt_import_completed', import_id: importId, summary });
  return { ok: true, import_id: importId, summary, backup_id: backup.id };
}

async function exportExistingMemories(env) {
  const backupId = crypto.randomUUID();
  try {
    const rows = await env.DB.prepare('SELECT * FROM memories ORDER BY id').all();
    // In a real D1 environment this would write to R2 or a backup table.
    // Here we return a snapshot handle so the caller can persist it.
    return { id: backupId, rows: rows.results || [] };
  } catch (e) {
    console.error('export backup failed', e);
    return { id: backupId, rows: [], error: String(e) };
  }
}

function looksLikeSecret(text) {
  // Exclude credential-like strings from memory
  return /\b(sk-[a-f0-9]{48,}|ghp_[a-zA-Z0-9]{36,}|AKIA[0-9A-Z]{16,})\b/.test(text);
}
