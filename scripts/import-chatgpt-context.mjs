import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const IN = process.argv[2] || 'imports/MELITURGOS_CONTEXT_TRANSFER_MAX_2026-09-06.json';
const SQL_OUT = process.argv[3] || 'imports/generated-import.sql';

const data = JSON.parse(await readFile(IN, 'utf-8'));

function normalize(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function fingerprint(text) {
  return createHash('sha256').update(normalize(text)).digest('hex');
}

function looksLikeSecret(text) {
  return /\b(sk-[a-f0-9]{48,}|ghp_[a-zA-Z0-9]{36,}|AKIA[0-9A-Z]{16,})\b/.test(String(text));
}

const entries = [];
const importId = crypto.randomUUID();
const now = Date.now();

function flattenObject(obj, path = '') {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    entries.push({ path, value: String(obj) });
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) flattenObject(obj[i], `${path}[${i}]`);
    return;
  }
  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      flattenObject(val, path ? `${path}.${key}` : key);
    }
  }
}

flattenObject(data.sections || data, '');

const accepted = [];
let rejected = 0;
let skipped = 0;
for (const e of entries) {
  const content = String(e.value).trim();
  if (!content || content.length < 3) { skipped++; continue; }
  if (looksLikeSecret(content)) { rejected++; continue; }
  const fp = fingerprint(content);
  accepted.push({ content, path: e.path, fp });
}

// Deduplicate within this import batch
const seenFp = new Set();
const unique = [];
let duplicatesWithinImport = 0;
for (const e of accepted) {
  if (seenFp.has(e.fp)) { duplicatesWithinImport++; continue; }
  seenFp.add(e.fp);
  unique.push(e);
}

const sqlStatements = [
  "BEGIN TRANSACTION;",
  "CREATE TABLE IF NOT EXISTS chatgpt_import_batches (id TEXT PRIMARY KEY, imported_at INTEGER NOT NULL, source_file TEXT, total_elements INTEGER, unique_elements INTEGER, duplicate_within_import INTEGER, rejected_secret INTEGER, skipped_trivial INTEGER);",
  `INSERT INTO chatgpt_import_batches(id, imported_at, source_file, total_elements, unique_elements, duplicate_within_import, rejected_secret, skipped_trivial) VALUES('${importId}', ${now}, 'MELITURGOS_CONTEXT_TRANSFER_MAX_2026-09-06.json', ${entries.length}, ${unique.length}, ${duplicatesWithinImport}, ${rejected}, ${skipped});`,
];

for (const e of unique) {
  const escapedContent = e.content.replace(/'/g, "''");
  const escapedPath = e.path.replace(/'/g, "''");
  const metadata = JSON.stringify({ import_id: importId, source_type: 'chatgpt_context_summary', section_path: e.path, provenance: 'chatgpt_context_transfer_v1', uncertain: true });
  sqlStatements.push(
    `INSERT OR IGNORE INTO memories(created_at, kind, content, importance, confidence, source, provenance, metadata, fingerprint) VALUES(${now}, 'fact', '${escapedContent}', 0.75, 0.7, 'chatgpt_context_summary', '${escapedPath}', '${metadata.replace(/'/g, "''")}', '${e.fp}');`
  );
}

sqlStatements.push("COMMIT;");
await writeFile(SQL_OUT, sqlStatements.join('\n'), 'utf-8');

console.log(JSON.stringify({
  import_id: importId,
  total_elements: entries.length,
  unique_elements: unique.length,
  duplicate_within_import: duplicatesWithinImport,
  rejected_secret: rejected,
  skipped_trivial: skipped,
  sql_file: SQL_OUT
}, null, 2));

console.log(`\nPour executer l'import réel :`);
console.log(`npx wrangler d1 execute meliturgos-memory --remote --file=${SQL_OUT}`);
