import { preferTopModels } from '../models/ModelRegistry.js';
import { assertMentorCodeContract } from './mentor-code-contract.js';
import { createMentorCompanionFallback } from './mentor-companion-provider.js';
import { MentorMemoryRepository } from './mentor-memory.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { ZeroEuroGovernor } from '../augmentio/zero-euro-governor.js';
import { sanitizeInferenceSettings } from './inference-adaptation.js';
import { createLocalPcCoderProvider } from '../models/local-pc-model.js';

const MAX_FILES = 8;
const MAX_FILE_CHARS = 45_000;
const MAX_TOTAL_SOURCE_CHARS = 150_000;
// Prompt budgets. Edits are applied on the complete inspected file; a model only
// sees a bounded excerpt. The paired PC refuses any message above 12 000 chars
// (SOVEREIGNTY_AI_MESSAGE_TOO_LARGE) and 150 000-char prompts time out in the cloud.
const DEFAULT_PROMPT_CHARS = 40_000;
const COMPANION_PROMPT_CHARS = 11_500;
const MEMORY_PROMPT_CHARS = 3_000;
const MAX_CHANGES = 10;
const LONG_FILE_CHARS = 4000;
const MAX_CHANGE_CHARS = 200_000;
const ALLOWED_TESTS = new Set(['test', 'test:mel', 'test:integration', 'test:acceptance', 'test:smoke', 'test:mvp', 'test:routes']);
const DENIED_PATH = /(^|\/)(?:\.git|node_modules|\.wrangler|\.env(?:\.|$)|dev\.vars|secrets?|credentials?)(?:\/|$)|(?:^|[._/-])(?:token|password|api[_-]?key|private[_-]?key)(?:[._/-]|$)/i;
const ALLOWED_TEXT_PATH = /^(?:src|tests|scripts|docs|migrations|\.github)\/[A-Za-z0-9_./-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|txt|yml|yaml|toml|css|html|sql|sh|ps1)$|^(?:package\.json|wrangler\.jsonc)$/;
const SAFE_INSPECTION_TEXT_PATH = /^[A-Za-z0-9_./-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|txt|yml|yaml|toml|css|html|sql|sh|ps1)$/;

function bounded(value, max) {
  const text = String(value ?? '');
  return text.length > max ? text.slice(0, max) : text;
}

// Short, non-secret evidence of why a proposal was rejected: the refused path,
// or the start of the unusable answer. Codes alone could not explain
// MENTOR_PATH_DENIED / MENTOR_JSON_REQUIRED on production jobs.
function mentorFailureDetail(error, raw) {
  const message = String(error?.message || '');
  const path = /^MENTOR_(?:PATH_DENIED|INVALID_CHANGE|UNINSPECTED_EDIT|LONG_FILE_REQUIRES_EDIT|MISSING_IMPORT):(.+)$/.exec(message)?.[1];
  if (path) return 'path=' + path.slice(0, 240);
  // The model needs the parser's message to fix its code; its own reply alone
  // made the repair round resend the same invalid code (25/10).
  if (error?.syntax) return 'syntax=' + String(error.syntax).slice(0, 240);
  const text = String(typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')).replace(/\s+/g, ' ').trim();
  return text ? 'reply=' + text.slice(0, 160) : null;
}

function mentorFailureCode(error, fallback = 'MENTOR_PROVIDER_FAILED') {
  const rawCode = String(error?.code || '').trim().toUpperCase();
  if (/^[A-Z0-9_]{1,80}$/.test(rawCode)) return rawCode;
  const message = String(error?.message || '');
  if (/MENTOR_PATH_DENIED/i.test(message)) return 'MENTOR_PATH_DENIED';
  if (/MENTOR_INVALID_CHANGE/i.test(message)) return 'MENTOR_INVALID_CHANGE';
  if (/MENTOR_JSON_REQUIRED/i.test(message)) return 'MENTOR_JSON_REQUIRED';
  if (/JSON|Unexpected token|Expected property name|unterminated/i.test(message)) return 'MENTOR_JSON_INVALID';
  if (/timeout/i.test(message)) return 'MENTOR_PROVIDER_TIMEOUT';
  return fallback;
}

function evidenceObject(row) {
  const value = row?.evidence;
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function normalizedRepositoryPath(path) {
  const value = String(path || '').trim().replace(/\\/g, '/');
  if (!value || value.startsWith('/') || value.includes('..') || DENIED_PATH.test(value)) {
    const error = new Error(`MENTOR_PATH_DENIED:${value || 'empty'}`);
    error.code = 'MENTOR_PATH_DENIED';
    throw error;
  }
  return value;
}

function safeInspectionPath(path) {
  const value = normalizedRepositoryPath(path);
  if (!SAFE_INSPECTION_TEXT_PATH.test(value)) {
    const error = new Error(`MENTOR_PATH_DENIED:${value}`);
    error.code = 'MENTOR_PATH_DENIED';
    throw error;
  }
  return value;
}

function safePath(path) {
  const value = normalizedRepositoryPath(path);
  // The Bridge pushes with a GitHub App token that may not touch workflows,
  // so a workflow edit passes every test and is then rejected at push.
  if (!ALLOWED_TEXT_PATH.test(value) || value.startsWith('.github/workflows/')) {
    const error = new Error(`MENTOR_PATH_DENIED:${value}`);
    error.code = 'MENTOR_PATH_DENIED';
    throw error;
  }
  return value;
}

// A relative import to a file that does not exist only fails after the
// Bridge's full test run. Reject it here so another provider can answer.
async function assertImportsResolve(proposal, pathExists, inspectedFiles = []) {
  if (typeof pathExists !== 'function') return proposal;
  const known = new Set([...proposal.changes, ...inspectedFiles].map(file => file.path));
  for (const change of proposal.changes) {
    if (!/\.(?:m?js|cjs)$/.test(change.path)) continue;
    const dir = change.path.split('/').slice(0, -1);
    const specs = [...String(change.content || '').matchAll(/(?:from\s+|import\s*\(\s*|^\s*import\s+)['"](\.{1,2}\/[^'"]+)['"]/gm)].map(m => m[1]);
    for (const spec of new Set(specs)) {
      const parts = [...dir];
      for (const segment of spec.split('/')) {
        if (segment === '..') parts.pop();
        else if (segment !== '.') parts.push(segment);
      }
      const target = parts.join('/');
      if (known.has(target) || await pathExists(target)) continue;
      // A new test often guesses the module's folder (../src/x.js for
      // src/evolution/x.js: MENTOR_MISSING_IMPORT on MANIFEST-06, 25/10). When
      // exactly one inspected or changed file has that name, point the test at it.
      const name = target.split('/').pop();
      const matches = [...known].filter(path => path.split('/').pop() === name);
      if (change.created && /^tests\//.test(change.path) && matches.length === 1) {
        const fixed = path => { const from = change.path.split('/').slice(0, -1); return '../'.repeat(from.length) + path; };
        change.content = change.content.split(`'${spec}'`).join(`'${fixed(matches[0])}'`).split(`"${spec}"`).join(`"${fixed(matches[0])}"`);
        continue;
      }
      throw Object.assign(new Error(`MENTOR_MISSING_IMPORT:${target}`), { code: 'MENTOR_MISSING_IMPORT' });
    }
  }
  return proposal;
}

function escapeRawJsonStrings(text) {
  let out = '';
  let quote = false;
  let escaped = false;
  for (const char of text) {
    if (!quote) {
      out += char;
      if (char === '"') quote = true;
      continue;
    }
    if (escaped) {
      out += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      out += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      out += char;
      quote = false;
      continue;
    }
    if (char === '\n') { out += '\\n'; continue; }
    if (char === '\r') { out += '\\r'; continue; }
    if (char === '\t') { out += '\\t'; continue; }
    out += char;
  }
  return out;
}

function incompleteFile(content, inspectedSource = '') {
  // A real sanitizer already contains this literal in work-dag.js. Preserve
  // that inspected literal; an actual omitted-code marker is still refused.
  content = content.replace(/(['"])\[TRUNCATED\]\1/gi, literal => inspectedSource.includes(literal) ? "''" : literal);
  return /(?:\/\/|\*|\#)\s*\.\.\.\s*(?:existing|reste|rest of|inchangé|unchanged)/i.test(content)
    || /\[(?:truncated|contenu omis|à compléter)\]/i.test(content)
    || /^diff --git /m.test(content)
    || /^--- [^\r\n]+\r?\n\+\+\+ [^\r\n]+\r?\n@@ /m.test(content);
}

function proposalFromMarkedFiles(raw) {
  const text = String(raw || '');
  if (!text.includes('<<<MEL_FILE')) return null;
  const changes = [];
  const pattern = /(?:^|\r?\n)FILE[ \t]+(\S+)[ \t]*\r?\n<<<MEL_FILE\r?\n([\s\S]*?)\r?\nMEL_FILE(?=\r?\n|$)/g;
  const envelope = text.replace(pattern, (_, path, content) => {
    changes.push({ path, content, reason: 'Fichier complet délimité' });
    return '\n';
  });
  if (!changes.length) return null;
  const remainder = envelope
    .replace(/^(?:SUMMARY|TESTS)[ \t]+[^\r\n]*\r?$/gm, '')
    .replace(/^```(?:[A-Za-z0-9_-]+)?[ \t]*\r?$/gm, '')
    .trim();
  if (remainder) throw Object.assign(new Error('MENTOR_INVALID_CHANGE'), { code: 'MENTOR_INVALID_CHANGE' });
  const summary = (text.match(/(?:^|\n)SUMMARY[ \t]+(.+)/) || [])[1] || 'Proposition de développement MEL';
  const tests = [...text.matchAll(/(?:^|\n)TESTS[ \t]+(.+)/g)].flatMap((row) => row[1].split(/[,\s]+/));
  return { summary, changes, tests, confidence: 0.5, lessons: [], risks: [] };
}

// Code inside JSON strings is where small models break quotes and newlines
// (MENTOR_JSON_INVALID). Plain SEARCH/REPLACE blocks carry code verbatim.
// New tests live directly in tests/: their `../src/...` imports only resolve
// there (FOUNDER-02 failed 4 repairs on tests/src/roadmap/…, 25/10).
const NEW_TEST_PATH = /^tests\/[A-Za-z0-9_.-]+\.test\.mjs$/;

// The Council rejects code without a test that exercises it; reject earlier,
// while other providers can still answer, an implementation without one.
function assertTestIncluded(proposal, mode, requireTest = false, scope = null) {
  // A roadmap contract allows only its own files. Refuse here, per provider,
  // so the next model can still answer: the bridge used to reject the whole
  // round afterwards (31/10: MANIFEST-05 ROADMAP_CODE_SCOPE_VIOLATION).
  const outside = scope ? proposal.changes.filter(change => !scope.has(change.path)).map(change => change.path) : [];
  if (outside.length) throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${outside[0]} — hors contrat : seuls ${[...scope].join(', ')} sont modifiables`), { code: 'MENTOR_INVALID_CHANGE' });
  if (!requireTest || mode !== 'implement') return proposal;
  const logic = proposal.changes.some(change => /^src\/.+\.m?js$/.test(change.path));
  const test = proposal.changes.some(change => /^tests\/.+\.test\.mjs$/.test(change.path));
  if (logic && !test) throw Object.assign(new Error('MENTOR_TEST_REQUIRED'), { code: 'MENTOR_TEST_REQUIRED' });
  return proposal;
}

function proposalFromSearchReplace(raw) {
  const text = String(raw || '');
  // Models often miscount the conflict markers (<<<<<< SEARCH): accept 5 to 9.
  if (!/<{5,9} ?SEARCH/.test(text)) return null;
  const edits = [];
  const pattern = /(?:^|\r?\n)EDIT[ \t]+(\S+)[ \t]*\r?\n(?:```[A-Za-z0-9_-]*\r?\n)?<{5,9} ?SEARCH[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?={5,9}[ \t]*\r?\n([\s\S]*?)\r?\n>{5,9} ?REPLACE/g;
  for (const match of text.matchAll(pattern)) edits.push({ path: match[1], find: match[2] || '', replace: match[3] });
  if (!edits.length) return null;
  const summary = (text.match(/(?:^|\n)SUMMARY[ \t]+(.+)/) || [])[1] || 'Proposition de développement MEL';
  const tests = [...text.matchAll(/(?:^|\n)TESTS[ \t]+(.+)/g)].flatMap((row) => row[1].split(/[,\s]+/)).filter(Boolean);
  return { summary, edits, tests, confidence: 0.5, lessons: [], risks: [] };
}

function parseJsonCandidate(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  const blocks = proposalFromSearchReplace(raw);
  if (blocks) return blocks;
  const marked = proposalFromMarkedFiles(raw);
  if (marked) return marked;
  let text = String(raw || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) throw Object.assign(new Error('MENTOR_JSON_REQUIRED'), { code: 'MENTOR_JSON_REQUIRED' });
  const slice = text.slice(first, last + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return JSON.parse(escapeRawJsonStrings(slice));
  }
}

function normalizeInspectedFiles(files = []) {
  let total = 0;
  const out = [];
  for (const item of Array.isArray(files) ? files : []) {
    if (out.length >= MAX_FILES || total >= MAX_TOTAL_SOURCE_CHARS) break;
    const path = safeInspectionPath(item?.path);
    const remaining = MAX_TOTAL_SOURCE_CHARS - total;
    const content = String(item?.content ?? item?.result?.content ?? '');
    if (content.length > MAX_CHANGE_CHARS) throw Object.assign(new Error('MENTOR_SOURCE_TOO_LARGE'), { code: 'MENTOR_SOURCE_TOO_LARGE' });
    total += Math.min(content.length, MAX_FILE_CHARS, remaining);
    out.push({ path, content });
  }
  return out;
}

// Models often copy an excerpt with different indentation or trailing
// spaces. Resolve it to the exact source text when the line-trimmed match is
// unique; otherwise keep the original text so the usual checks reject it.
function resolveFind(text, find) {
  const source = String(text || '');
  if (!find || source.includes(find)) return find;
  // Models copy our own truncation notice into SEARCH (MENTOR_UNINSPECTED_EDIT
  // on FOUNDER-05, 25/10); it is never part of the file, so ignore it.
  const wanted = String(find).split(/\r?\n/)
    .filter(line => !/^\s*\[EXTRAIT (PARTIEL|TRONQUÉ)/.test(line))
    .map(line => line.trim());
  while (wanted.length && !wanted[0]) wanted.shift();
  while (wanted.length && !wanted.at(-1)) wanted.pop();
  if (!wanted.length) return find;
  const lines = source.split('\n');
  const hits = [];
  for (let i = 0; i + wanted.length <= lines.length; i++) {
    if (wanted.every((line, k) => lines[i + k].trim() === line)) hits.push(i);
  }
  if (hits.length !== 1) return find;
  return lines.slice(hits[0], hits[0] + wanted.length).join('\n');
}

function applyInspectedEdits(edits, inspectedFiles, repairReferences = [], visibleFiles = inspectedFiles) {
  if (!Array.isArray(edits) || !edits.length) return [];
  if (edits.length > MAX_CHANGES) throw Object.assign(new Error('MENTOR_INVALID_CHANGE:change-limit'), { code: 'MENTOR_INVALID_CHANGE' });
  const byPath = new Map((Array.isArray(inspectedFiles) ? inspectedFiles : []).map(file => [file.path, String(file.content || '')]));
  const touched = [];
  const newTests = new Set();
  for (const edit of edits) {
    const path = safePath(edit?.path);
    // The only file a proposal may create: a new test with an empty SEARCH.
    if (!byPath.has(path) && NEW_TEST_PATH.test(path) && !String(edit?.find ?? '')) {
      const created = String(edit?.replace ?? '');
      if (!created.trim() || created.length > MAX_CHANGE_CHARS) throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${path}`), { code: 'MENTOR_INVALID_CHANGE' });
      byPath.set(path, created);
      newTests.add(path);
      if (!touched.includes(path)) touched.push(path);
      continue;
    }
    // An empty SEARCH on an existing test file appends a new test at its end.
    // 30/10 production: FOUNDER-02 asked for one more regression in an existing
    // test file; qwen2.5-coder appended it with an empty SEARCH twice and both
    // attempts were refused, so the coder Council could never deliver it.
    if (byPath.has(path) && NEW_TEST_PATH.test(path) && !String(edit?.find ?? '')) {
      const added = String(edit?.replace ?? '');
      const source = byPath.get(path);
      if (!added.trim() || source.length + added.length + 1 > MAX_CHANGE_CHARS) throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${path} — ajout de test vide ou trop long`), { code: 'MENTOR_INVALID_CHANGE' });
      byPath.set(path, source.replace(/\n*$/, '\n') + '\n' + added.replace(/^\n+/, ''));
      if (!touched.includes(path)) touched.push(path);
      continue;
    }
    if (!byPath.has(path)) throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${path} — fichier non inspecté : seuls les fichiers de SOURCES_INSPECTÉES ou un nouveau tests/<nom>.test.mjs directement dans tests/ (imports en ../src/...)`), { code: 'MENTOR_INVALID_CHANGE' });
    const visible = visibleFiles.find(file => file.path === path);
    const find = resolveFind(visible?.content, String(edit?.find ?? ''));
    // A SEARCH copied verbatim from the real file, once, is not invented code even
    // when it sits outside the excerpt (31/10: FOUNDER-07 refused 4x on the real
    // first import line of restore-service.js). The uniqueness check below holds.
    const realSource = String(byPath.get(path) || '');
    const verbatimInFile = find.trim().length >= 20 && realSource.indexOf(find) >= 0 && realSource.indexOf(find, realSource.indexOf(find) + find.length) < 0;
    if (!verbatimInFile && !visibleFiles.some(file => file.path === path && file.content.includes(find))) {
      // Name the first SEARCH line the model did not copy verbatim; a bare code
      // let it resend the same guessed SEARCH (×9 on 25/10).
      const visibleLines = new Set(String(visible?.content || '').split('\n').map(line => line.trim()));
      const missing = String(find).split(/\r?\n/).map(line => line.trim()).find(line => line && !visibleLines.has(line));
      throw Object.assign(new Error(`MENTOR_UNINSPECTED_EDIT:${path} — SEARCH absent de l'extrait${missing ? ' ; ligne introuvable : ' + JSON.stringify(missing.slice(0, 160)) : ' ; lignes non contiguës'}`), { code: 'MENTOR_UNINSPECTED_EDIT' });
    }
    const replace = String(edit?.replace ?? '');
    if (!find || find.length > 8000 || replace.length > MAX_CHANGE_CHARS) {
      throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${path} — SEARCH vide ou REPLACE trop long`), { code: 'MENTOR_INVALID_CHANGE' });
    }
    const source = byPath.get(path);
    const at = source.indexOf(find);
    if (at < 0 || source.indexOf(find, at + find.length) >= 0) {
      throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${path} — SEARCH absent du fichier ou présent plusieurs fois : copie un extrait exact et unique`), { code: 'MENTOR_INVALID_CHANGE' });
    }
    const content = source.slice(0, at) + replace + source.slice(at + find.length);
    if (!content || content.length > MAX_CHANGE_CHARS || incompleteFile(content, source + (repairReferences.find(file => file.path === path)?.content || ''))) {
      throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${path} — fichier résultant incomplet ou tronqué`), { code: 'MENTOR_INVALID_CHANGE' });
    }
    byPath.set(path, content);
    if (!touched.includes(path)) touched.push(path);
  }
  return touched.map(path => ({
    path,
    ...(newTests.has(path) ? { created: true } : {}),
    content: byPath.get(path),
    reason: 'Modification appliquée sur le fichier inspecté',
  }));
}
function forbiddenImportSpecifiers(previousAttempts) {
  const text = JSON.stringify(previousAttempts || []);
  const found = new Set();
  for (const match of text.matchAll(/Unresolved import in [^:]+:\s*([A-Za-z0-9_@./-]+)/g)) found.add(match[1]);
  return found;
}

function stillImports(content, specifier) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:from\\s+|import\\s*\\()['"]${escaped}['"]|require\\(\\s*['"]${escaped}['"]\\s*\\)`).test(String(content || ''));
}

function assertAcceptedChange(change, inspectedFiles, forbidden, appliedEdit = false) {
  const inspected = (Array.isArray(inspectedFiles) ? inspectedFiles : []).find((file) => file.path === change.path);
  if (!inspected) throw Object.assign(new Error('MENTOR_UNINSPECTED_PATH'), { code: 'MENTOR_UNINSPECTED_PATH' });
  if ((inspected.content || '').length > LONG_FILE_CHARS && !appliedEdit) {
    throw Object.assign(new Error(`MENTOR_LONG_FILE_REQUIRES_EDIT:${change.path}`), { code: 'MENTOR_LONG_FILE_REQUIRES_EDIT' });
  }
  assertMentorCodeContract(change.path, inspected.content, change.content);
  for (const specifier of forbidden) {
    if (stillImports(change.content, specifier)) {
      throw Object.assign(new Error(`MENTOR_REPEATED_BROKEN_IMPORT:${specifier}`), { code: 'MENTOR_REPEATED_BROKEN_IMPORT' });
    }
  }
}

function normalizeProposal(value, provenance = {}, inspectedFiles = [], previousAttempts = [], repairReferences = [], visibleFiles = inspectedFiles) {
  const forbidden = forbiddenImportSpecifiers(previousAttempts);
  const parsed = parseJsonCandidate(value);
  const rawChanges = Array.isArray(parsed.changes)
    ? parsed.changes
    : (parsed.path && parsed.content != null ? [parsed] : []);
  if (rawChanges.length && Array.isArray(parsed.edits) && parsed.edits.length) throw Object.assign(new Error('MENTOR_INVALID_CHANGE'), { code: 'MENTOR_INVALID_CHANGE' });
  let changes;
  if (!rawChanges.length) {
    changes = applyInspectedEdits(parsed.edits, inspectedFiles, repairReferences, visibleFiles);
    if (!changes.length) throw Object.assign(new Error('MENTOR_CHANGES_REQUIRED'), { code: 'MENTOR_CHANGES_REQUIRED' });
  } else {
  if (rawChanges.length > MAX_CHANGES) throw Object.assign(new Error('MENTOR_INVALID_CHANGE:change-limit'), { code: 'MENTOR_INVALID_CHANGE' });
  const seen = new Set();
  changes = [];
  for (const raw of rawChanges) {
    const path = safePath(raw?.path);
    if (seen.has(path)) throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${path}`), { code: 'MENTOR_INVALID_CHANGE' });
    const content = String(raw?.content ?? '');
    const known = new Set((Array.isArray(inspectedFiles) ? inspectedFiles : []).map((file) => file.path));
    if (!known.has(path)) {
      const invented = [...content.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g)]
        .map((match) => match[1] || match[2])
        .filter((spec) => spec && !spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('node:'));
      if (invented.length) throw Object.assign(new Error(`MENTOR_UNINSPECTED_PATH:${path}`), { code: 'MENTOR_UNINSPECTED_PATH' });
    }
    if (!content || content.length > MAX_CHANGE_CHARS || incompleteFile(content, inspectedFiles.find(file => file.path === path)?.content || '')) throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${path}`), { code: 'MENTOR_INVALID_CHANGE' });
    seen.add(path);
    changes.push({ path, content, reason: bounded(raw?.reason || '', 1200) });
  }
  if (!changes.length) throw Object.assign(new Error('MENTOR_CHANGES_REQUIRED'), { code: 'MENTOR_CHANGES_REQUIRED' });
  }
  // A proposal identical to the inspected source is an empty diff: the Bridge
  // would cancel it as already satisfied, so reject it while retries remain.
  changes = changes.filter(change => inspectedFiles.find(file => file.path === change.path)?.content !== change.content);
  if (!changes.length) throw Object.assign(new Error('MENTOR_NO_OP_CHANGE'), { code: 'MENTOR_NO_OP_CHANGE' });
  const tests = [...new Set((Array.isArray(parsed.tests) ? parsed.tests : []).map(String).filter(name => ALLOWED_TESTS.has(name)))].slice(0, 4);
  if (!tests.length) tests.push('test:smoke');
  for (const change of changes) {
    if (change.created) { assertMentorCodeContract(change.path, '', change.content); continue; }
    if (!visibleFiles.some(file => file.path === change.path)) throw Object.assign(new Error('MENTOR_UNINSPECTED_PATH'), { code: 'MENTOR_UNINSPECTED_PATH' });
    assertAcceptedChange(change, inspectedFiles, forbidden, !rawChanges.length);
    const inspected = inspectedFiles.find(file => file.path === change.path);
    if (rawChanges.length && inspected && !visibleFiles.some(file => file.path === change.path && file.content.includes(inspected.content))) {
      throw Object.assign(new Error('MENTOR_UNINSPECTED_EDIT'), { code: 'MENTOR_UNINSPECTED_EDIT' });
    }
  }
  for (const change of changes) {
    const reference = repairReferences.find(file => file.path === change.path);
    if (reference) assertMentorCodeContract(change.path, reference.content, change.content);
  }
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
  const lessons = (Array.isArray(parsed.lessons) ? parsed.lessons : []).map(x => bounded(x, 1200)).filter(Boolean).slice(0, 8);
  return {
    summary: bounded(parsed.summary || parsed.plan || 'Proposition de développement MEL', 4000),
    changes,
    tests,
    confidence,
    lessons,
    risks: (Array.isArray(parsed.risks) ? parsed.risks : []).map(x => bounded(x, 1000)).filter(Boolean).slice(0, 8),
    provenance,
  };
}

function scoreProposal(proposal) {
  return proposal.confidence * 10 + Math.min(5, proposal.changes.length) * 2 + Math.min(3, proposal.tests.length) + Math.min(2, proposal.lessons.length * 0.5);
}

// Reuse #2329's six-file excerpts while honoring the provider-specific
// excerpt already computed by promptWithinLimit. Full inspected text stays
// untouched for exact edit validation, including files above 45k characters.
function sourceBlock(files) {
  return (Array.isArray(files) ? files : []).slice(0, 6).map(file => {
    const source = String(file.content || '');
    const visible = String(file.excerpt ?? source).slice(0, 4500);
    return [
      '===== FILE ' + file.path + ' =====',
      visible,
      ...(visible.length < source.length
        ? ['[EXTRAIT PARTIEL / EXTRAIT TRONQUÉ: ne modifier que les lignes effectivement visibles ci-dessus]']
        : []),
      '===== END ' + file.path + ' =====',
    ].join('\n');
  }).join('\n');
}

function promptLimit(provider) {
  const explicit = Number(provider?.maxInputChars);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return provider?.providerId === 'local-companion-ai' || provider?.providerId === 'local-pc-coder'
    ? COMPANION_PROMPT_CHARS
    : DEFAULT_PROMPT_CHARS;
}

// A long file used to be shown from its first line only, so the code a goal
// is about was often off-screen and every SEARCH on it was refused as
// MENTOR_UNINSPECTED_EDIT (8 of 14 refusals on 25/10). Show instead the window
// that mentions the goal's words most; edits stay limited to what is shown.
function focusTerms(goal) {
  return [...new Set(String(goal || '').toLowerCase().match(/[a-z_][a-z0-9_]{4,}/g) || [])].slice(0, 40);
}

function focusedWindow(content, share, terms) {
  if (content.length <= share || !terms.length) return content.slice(0, share);
  const lines = content.split('\n');
  // Earlier terms weigh more: test-imported symbols come first (31/10).
  const scores = lines.map(line => { const low = line.toLowerCase(); return terms.reduce((n, term, rank) => n + (low.includes(term) ? terms.length - rank : 0), 0); });
  let best = 0, bestScore = -1;
  for (let start = 0; start < lines.length; start += 1) {
    let size = 0, score = 0;
    for (let i = start; i < lines.length && size + lines[i].length + 1 <= share; i += 1) { size += lines[i].length + 1; score += scores[i]; }
    if (score > bestScore) { bestScore = score; best = start; }
  }
  if (bestScore <= 0) return content.slice(0, share);
  let size = 0, end = best;
  while (end < lines.length && size + lines[end].length + 1 <= share) { size += lines[end].length + 1; end += 1; }
  return lines.slice(best, end).join('\n');
}

// Fit the prompt to one provider: the frame is kept, sources share the rest.
function promptWithinLimit(build, files, limit, visibleScope = [], goal = '') {
  const terms = focusTerms(goal);
  const frame = build([]).length;
  let budget = Math.max(0, Math.min(MAX_TOTAL_SOURCE_CHARS, limit - frame - 120 * files.length));
  const excerpts = files.map((file, index) => {
    // sourceBlock shows at most 4500 characters per file.
    const share = Math.min(MAX_FILE_CHARS, 4500, Math.floor(budget / (files.length - index)));
    const visible = focusedWindow(file.content, share, terms);
    budget -= visible.length;
    const excerpt = visible.length < file.content.length
      ? `${visible}\n[EXTRAIT TRONQUÉ: ${file.content.length} caractères au total. Modifie ce fichier par edits avec un find copié de cet extrait.]`
      : visible;
    return { ...file, excerpt };
  });
  const input = bounded(build(excerpts), limit);
  for (const file of excerpts.slice(0, 6)) {
    if (input.includes(sourceBlock([file]))) visibleScope.push({ path: file.path, content: String(file.excerpt ?? file.content).slice(0, 4500) });
  }
  return input;
}

function buildRepairPrompt({ goal, files, raw, failure, mode, reference = '', allowedPaths = null }) {
  const uninspected = /MENTOR_UNINSPECTED_PATH/.test(String(failure || ''));
  const allowed = (Array.isArray(allowedPaths) && allowedPaths.length ? allowedPaths : (Array.isArray(files) ? files : []).slice(0, 6).map(file => file.path)).filter(Boolean).join(', ');
  return [
    'Tu répares une réponse de code rejetée.',
    'FORMAT UNIQUE (texte brut, sans JSON) : une ligne « SUMMARY modification concrète », une ligne « TESTS test:smoke », puis pour chaque modification : une ligne « EDIT CHEMIN_EXACT », une ligne « <<<<<<< SEARCH », l’extrait EXACT et UNIQUE à remplacer, une ligne « ======= », le nouveau contenu, une ligne « >>>>>>> REPLACE ». Le JSON {"summary","edits":[{"path","find","replace"}],"tests"} reste accepté.',
    'Les edits remplacent un texte EXACT qui existe UNE SEULE FOIS dans un fichier inspecté; ne réécris pas le fichier entier.',
    'Choisis uniquement un des fichiers effectivement inspectés ci-dessous: ' + allowed,
    'Pour les gros fichiers, cible quelques lignes présentes dans les extraits fournis. Aucun import inventé, placeholder, diff, prose, bloc FILE ou marqueur MEL_FILE.',
    'Ne crée aucun fichier non inspecté. Ne propose ni secret, ni nouvelle dépendance non prouvée.',
    'Ne prétends pas avoir exécuté les tests.',
    'MODE: ' + (mode === 'repair' ? 'RÉPARATION APRÈS TEST' : 'IMPLÉMENTATION'),
    'OBJECTIF: ' + bounded(goal, 2000),
    'ERREUR_DE_VALIDATION: ' + bounded(failure || 'INVALID_PROPOSAL', 120),
    uninspected ? 'L’ancien chemin non inspecté est interdit; repars d’un extrait inspecté.' : 'RÉPONSE_INVALIDE_À_RÉPARER:',
    uninspected ? '' : bounded(raw || '', 2500),
    reference,
    'SOURCES_INSPECTÉES (base candidate actuelle; appliquer edits ici):',
    sourceBlock(files),
  ].filter(Boolean).join('\n');
}

function buildPrompt({ role, goal, files, lessons, experiences, previousAttempts, mode, reference = '', allowedPaths = null }) {
  const allowed = (Array.isArray(allowedPaths) && allowedPaths.length ? allowedPaths : (Array.isArray(files) ? files : []).slice(0, 6).map(file => file.path)).filter(Boolean).join(', ');
  return [
    'Tu es le mentor code de MELITURGOS. Réponds uniquement dans le format ci-dessous, sans explication.',
    'RÔLE: ' + role + '. MODE: ' + (mode === 'repair' ? 'RÉPARATION APRÈS TEST' : 'IMPLÉMENTATION') + '.',
    'FORMAT OBLIGATOIRE (texte brut, sans JSON) : une ligne « SUMMARY modification concrète », une ligne « TESTS test:smoke », puis pour chaque modification : une ligne « EDIT CHEMIN_EXACT », une ligne « <<<<<<< SEARCH », l’extrait EXACT et UNIQUE à remplacer, une ligne « ======= », le nouveau contenu, une ligne « >>>>>>> REPLACE ». Le JSON {"summary","edits":[{"path","find","replace"}],"tests"} reste accepté.',
    'L’extrait SEARCH doit être EXACT et UNIQUE, copié de SOURCES_INSPECTÉES ; REPLACE est son remplacement réel.',
    'TEST OBLIGATOIRE : tout changement de logique dans src/ s’accompagne d’un nouveau test, en bloc EDIT tests/<nom>.test.mjs avec une section SEARCH vide (si ce fichier de test existe déjà, le bloc est ajouté à sa fin) ; il utilise node:test et node:assert/strict, importe le module modifié par chemin relatif et vérifie le comportement demandé.',
    'Fichiers autorisés: ' + allowed + '. Ne crée pas de fichier non inspecté.',
    'Ne renvoie pas un fichier entier, un diff, un bloc FILE/MEL_FILE ou du texte tronqué.',
    'Modifie le minimum pour faire avancer l’objectif approuvé. Aucun nouvel import ou module non présent dans les fichiers/dependances vérifiés.',
    'N’invente pas un module absent : aucun nouvel import sans dépendance ou fichier vérifié.',
    'Ne modifie aucun secret et ne prétends pas que les tests ont déjà réussi.',
    'OBJECTIF: ' + bounded(goal, 2200),
    'LEÇONS_VALIDÉES: ' + bounded(JSON.stringify(lessons || []), 1800),
    'EXPÉRIENCES_VALIDÉES: ' + bounded(JSON.stringify(experiences?.validated || []), 1800),
    'OBSERVATIONS ACQUISES NON VALIDÉES — HYPOTHÈSES UNIQUEMENT, NE JAMAIS LES TRAITER COMME DES FAITS: ' + bounded(JSON.stringify(experiences?.observations || []), 1200),
    'ERREURS_PRÉCÉDENTES: ' + bounded(JSON.stringify(previousAttempts || []), 1800),
    reference,
    'SOURCES_INSPECTÉES (base candidate actuelle; appliquer edits ici):',
    sourceBlock(files),
  ].join('\n');
}

function buildTestFollowUpPrompt({ goal, change }) {
  return [
    'Tu es le mentor code de MELITURGOS. Ta modification ci-dessous n’a pas de test : le Council refuse un code non testé.',
    'Écris UNIQUEMENT le test, au format : une ligne « EDIT tests/<nom>.test.mjs », une ligne « <<<<<<< SEARCH », une ligne « ======= », le contenu complet du test, une ligne « >>>>>>> REPLACE ». La section SEARCH reste vide.',
    'Le test utilise node:test et node:assert/strict, importe le module modifié par chemin relatif (../src/…) et vérifie le comportement demandé. Aucun autre texte.',
    'OBJECTIF: ' + goal,
    'TA MODIFICATION:',
    change,
  ].join('\n');
}

// ChatGPT-GPT6 / MEL-MENTOR-TIMEOUT: each provider call is bounded even
// if its backend ignores AbortSignal; late results never block MAX.
async function boundedMentorInvoke(provider, request, limitMs) {
  const limit = Math.max(10, Math.min(90_000, Number(limitMs) || 25_000));
  const abort = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider.invoke({ ...request, signal: abort.signal })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error('MENTOR_PROVIDER_TIMEOUT'), { code: 'MENTOR_PROVIDER_TIMEOUT' }));
          abort.abort();
        }, limit);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class MentorEngine {
  // Workers AI code models need 50-100 s per answer in production. The per-call
  // cap used to be clamped to 30 s inside boundedMentorInvoke whatever the
  // setting, so most proposals ended in MENTOR_PROVIDER_TIMEOUT (25/10). The
  // runtime lease is now renewed while the tick lives, so a proposal may take
  // up to 150 s, still inside the 240 s owner MAX request.
  constructor({ memory, providerFactory, invokeTimeoutMs = 80_000, repairTimeoutMs = 45_000, proposeBudgetMs = 150_000, now = () => Date.now() } = {}) {
    this.memory = memory || new MentorMemoryRepository(null);
    this.providerFactory = providerFactory;
    // ChatGPT-GPT6 / MEL-MENTOR-TIMEOUT: deadlines below the 180-second MAX request.
    this.invokeTimeoutMs = Math.max(10, Math.min(90_000, Number(invokeTimeoutMs) || 80_000));
    this.repairTimeoutMs = Math.max(10, Math.min(60_000, Number(repairTimeoutMs) || 45_000));
    this.proposeBudgetMs = Math.max(20, Math.min(180_000, Number(proposeBudgetMs) || 150_000));
    this.now = typeof now === 'function' ? now : () => Date.now();
  }

  async _providers(env, { codeCouncil = false, escalate = false } = {}) {
    if (this.providerFactory) return this.providerFactory(env);
    const pool = createDefaultAugmentioPool(env);
    await pool.refreshHealth();
    const governor = new ZeroEuroGovernor({ maxCost: 0 });
    // ChatGPT-GPT6 / MEL-MENTOR-FALLBACK: bounded model fallback (revert this PR to remove).
    // Bound the number of eligible models, but let the mentor fall back beyond
    // the first three when those providers fail or return invalid proposals.
    const specialists = pool.list({ capability: 'CODE_SPECIALIST' }).filter(provider => governor.allows(provider));
    const large = specialists.filter(provider => provider.capabilities.includes('CODE_LARGE'));
    const small = specialists.filter(provider => !provider.capabilities.includes('CODE_LARGE'));
    // Owner decision 01/11: MEL's top models code first and alone when
    // available; the small coders lost most rounds and spent neurons.
    const coders = preferTopModels([...large, ...small], env, { min: 1 });
    // No code model answers the zero-cost proof: keep MAX moving with the
    // general models; the weekly development audit reports the exclusion.
    const cloud = coders.length ? coders : pool.list({ capability: 'CODE' }).filter(provider => governor.allows(provider)).slice(0, codeCouncil ? 16 : 6);
    const companion = await createMentorCompanionFallback(env);
    const pcCoder = await createLocalPcCoderProvider(env);
    if (codeCouncil) return cloud;
    const local = [pcCoder, companion].filter(Boolean);
    return local.length ? [...local, ...cloud] : cloud;
  }

  async _learnedRuntime() {
    const [settingsRows, adapterRows] = await Promise.all([
      this.memory.recent({ limit: 1, kind: 'INFERENCE_SETTINGS' }),
      this.memory.recent({ limit: 1, kind: 'LORA_ADAPTER_ACTIVE' }),
    ]);
    return {
      inference: sanitizeInferenceSettings(evidenceObject(settingsRows[0])?.settings || {}),
      activeAdapter: adapterRows.length ? evidenceObject(adapterRows[0]) : null,
    };
  }

  async acquireExperience(input = {}) {
    return this.memory.acquireExperience(input);
  }

  async validateExperience(input = {}) {
    return this.memory.validateExperience(input);
  }

  async experienceContext(goal, options = {}) {
    return this.memory.experienceContext(goal, options);
  }

  async propose({ env, jobId, goal, inspectedFiles = [], previousAttempts = [], mode = 'implement', repairReferences = [], pathExists = null, requireTest = false, failedRounds = 0, allowedPaths = null } = {}) {
    const scope = Array.isArray(allowedPaths) && allowedPaths.length ? new Set(allowedPaths) : null;
    // The supervisor appends the whole manifest status list; models mistake it
    // for the task and "fix" roadmap ID lists, so only the item itself is sent.
    const objective = bounded(goal, 12_000).replace(/\s*\|\s*OBJECTIF\s[\s\S]*$/, '').trim();
    // Center long-file excerpts on the functions the tests import: 31/10, the
    // goal words centered restore-service.js elsewhere and the coders could
    // not see comparePatrimonyExports (line 67) they had to change.
    const importedSymbols = [...new Set((Array.isArray(inspectedFiles) ? inspectedFiles : [])
      .filter(file => /^tests\//.test(String(file?.path || '')))
      .flatMap(file => [...String(file.content || '').matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/src\//g)])
      .flatMap(match => match[1].split(',').map(name => name.trim().split(/\s+as\s+/)[0]).filter(Boolean)))].slice(0, 20);
    // A contract can name the functions to change in a large file (FOCUS_CODE):
    // FOUNDER-02's 60 KB runtime core is otherwise centered on goal words.
    const contractFocus = (String(goal || '').match(/FOCUS_CODE ([^|]+)/)?.[1] || '').trim().split(/\s+/).filter(Boolean);
    const leading = [...new Set([...contractFocus, ...importedSymbols])];
    const focusGoal = leading.length ? leading.join(' ') + '\n' + objective : objective;
    if (!objective) throw Object.assign(new Error('MENTOR_GOAL_REQUIRED'), { code: 'MENTOR_GOAL_REQUIRED', status: 400 });
    const files = normalizeInspectedFiles(inspectedFiles);
    if (!files.length) throw Object.assign(new Error('MENTOR_INSPECTION_REQUIRED'), { code: 'MENTOR_INSPECTION_REQUIRED', status: 422 });
    const references = normalizeInspectedFiles(repairReferences).filter(reference => files.some(file => file.path === reference.path));
    const referenceFor = provider => {
      if (!references.length) return '';
      const budget = Math.floor(promptLimit(provider) * 0.45 / references.length);
      return 'RÉPARATION: références historiques lues au SHA de base du paquet défectueux. Préserver leurs exports et contrats, examiner les changements candidats utiles; ne pas recopier aveuglément.\n' + references.map(file => 'REFERENCE ' + file.path + '\n' + file.content.slice(0, budget) + (file.content.length > budget ? '\n[REFERENCE TRONQUÉE]' : '')).join('\n');
    };
    const learned = await this._learnedRuntime();
    const [remembered, experiences] = await Promise.all([
      this.memory.context(objective, { limit: learned.inference.memory_results }),
      this.memory.experienceContext(objective, { limit: learned.inference.memory_results }),
    ]);
    const codeCouncil = mode === 'repair' || previousAttempts.length >= 2;
    // The PC coder takes the first attempt. A GitHub refusal or a proposal MEL
    // already rejected moves the work to the online coder.
    const providers = await this._providers(env, {
      codeCouncil,
      // In a repair, previousAttempts holds the failing tests, not the failed
      // rounds: one stubborn test never escalated (30/10: FOUNDER-02 failed
      // three repairs on qwen2.5-coder and never reached gpt-oss-120b).
      escalate: previousAttempts.length >= 3 || Number(failedRounds) >= 2,
    });
    if (!providers.length) throw Object.assign(new Error('MENTOR_NO_ZERO_COST_CODE_PROVIDER'), { code: 'MENTOR_NO_ZERO_COST_CODE_PROVIDER', status: 503 });

    const roles = ['implémenteur principal', 'relecteur architecture et régressions', 'testeur-réparateur'];
    const proposals = [];
    const failures = [];
    const attemptedProviders = [];
    let repairAttempted = false;
    let repairValidProposals = 0;

    // The connected PC coder goes first and, when it answers, the cloud coder
    // is not called. A repair or a previous failure skips the PC.
    const localIds = new Set(['local-pc-coder', 'local-companion-ai']);
    const localProviders = providers.filter(provider => localIds.has(provider.providerId));
    const cloudProviders = providers.filter(provider => !localIds.has(provider.providerId));
    const problem = mode === 'repair' || previousAttempts.length > 0 || codeCouncil;
    const tiers = !problem && localProviders.length ? [localProviders, cloudProviders] : [cloudProviders];
    const providerWaves = [];
    for (const tier of tiers) {
      for (let offset = 0; offset < tier.length; offset += 3) providerWaves.push(tier.slice(offset, offset + 3));
    }
    const startedAt = this.now();
    const remaining = () => this.proposeBudgetMs - (this.now() - startedAt);
    // Keep a cloud retry window when the optional PC provider is slow or empty.
    // A failed local attempt must not consume the entire Mentor invocation budget.
    const cloudReserveMs = localProviders.length && cloudProviders.length && !problem
      ? Math.min(20_000, Math.floor(this.proposeBudgetMs / 3)) : 0;
    for (const wave of providerWaves) {
      if (!codeCouncil && proposals.length) break;
      // A new wave never starts once it could not finish inside the budget.
      if (attemptedProviders.length && remaining() < Math.min(this.invokeTimeoutMs, 10_000)) {
        failures.push({ provider: 'mentor', error: 'MENTOR_TIME_BUDGET_EXHAUSTED', stage: 'initial' });
        break;
      }
      const waveOffset = attemptedProviders.length;
      attemptedProviders.push(...wave.map(provider => provider.id));
      const settled = await Promise.allSettled(wave.map((provider, index) => {
        const active = learned.activeAdapter;
        const lora = active?.base_model === provider.modelId ? active?.adapter?.id : null;
        const visibleScope = [];
        return boundedMentorInvoke(provider, {
          input: promptWithinLimit(
            visible => buildPrompt({ allowedPaths, role: roles[(waveOffset + index) % roles.length], goal: objective, files: visible, lessons: remembered, experiences, previousAttempts, mode, reference: referenceFor(provider) }),
            files,
            promptLimit(provider),
            visibleScope,
            focusGoal,
          ),
          context: {
            purpose: 'mel-autonomous-development',
            job_id: jobId || null,
            mode,
            inference_settings: learned.inference,
            ...(lora ? { lora } : {}),
          },
        }, Math.max(10, Math.min(this.invokeTimeoutMs, Math.max(10, remaining() - (localIds.has(provider.providerId) ? cloudReserveMs : 0))))).then(output => ({ output, visibleScope }));
      }));

      const repairInputs = [];
      for (const [index, result] of settled.entries()) {
        const provider = wave[index];
        if (result.status === 'rejected') {
          const failure = mentorFailureCode(result.reason);
          failures.push({ provider: provider.id, error: failure, stage: 'initial' });
          // A provider outage has no malformed answer to repair. Try another
          // provider instead of issuing the same failed inference twice.
          continue;
        }
        const output = result.value.output;
        const raw = output?.text ?? output;
        try {
          const provenance = output?.provenance || { provider: provider.providerId, model: provider.modelId };
          let proposal = await assertImportsResolve(normalizeProposal(raw, provenance, files, previousAttempts, references, result.value.visibleScope), pathExists, files);
          try {
            assertTestIncluded(proposal, mode, requireTest, scope);
          } catch (error) {
            if (error?.code !== 'MENTOR_TEST_REQUIRED' || typeof raw !== 'string' || remaining() < 10_000) throw error;
            // Models write the change and forget its test; ask the same model
            // for the test alone instead of discarding a valid change.
            const testOutput = await boundedMentorInvoke(provider, {
              input: buildTestFollowUpPrompt({ goal: objective, change: bounded(raw, 12_000) }),
              context: { purpose: 'mel-autonomous-development', job_id: jobId || null, mode, inference_settings: learned.inference },
            }, Math.max(10, Math.min(this.invokeTimeoutMs, remaining())));
            const combined = raw + '\n' + String(testOutput?.text ?? testOutput ?? '');
            proposal = await assertImportsResolve(normalizeProposal(combined, provenance, files, previousAttempts, references, result.value.visibleScope), pathExists, files);
            assertTestIncluded(proposal, mode, requireTest, scope);
          }
          proposals.push({ ...proposal, provider_id: provider.id, score: scoreProposal(proposal), repaired: false });
        } catch (error) {
          const failure = mentorFailureCode(error, 'MENTOR_PROPOSAL_INVALID');
          failures.push({ provider: provider.id, error: failure, stage: 'initial', detail: mentorFailureDetail(error, raw) });
          repairInputs.push({ provider, raw: bounded(raw, 20_000), failure });
        }
      }

      if (!proposals.length && repairInputs.length) {
        repairAttempted = true;
        const active = learned.activeAdapter;
        const repaired = await Promise.allSettled(repairInputs.map(({ provider, raw, failure }) => {
          const lora = active?.base_model === provider.modelId ? active?.adapter?.id : null;
          const visibleScope = [];
          return boundedMentorInvoke(provider, {
            input: promptWithinLimit(
              visible => buildRepairPrompt({ allowedPaths, goal: objective, files: visible, raw: bounded(raw, Math.floor(promptLimit(provider) / 3)), failure, mode, reference: referenceFor(provider) }),
              files,
              promptLimit(provider),
              visibleScope,
              focusGoal,
            ),
            context: {
              purpose: 'mel-autonomous-development-structured-repair',
              job_id: jobId || null,
              mode,
              inference_settings: learned.inference,
              ...(lora ? { lora } : {}),
            },
          }, Math.max(10, Math.min(this.repairTimeoutMs, remaining()))).then(output => ({ output, visibleScope }));
        }));
        for (const [index, result] of repaired.entries()) {
          const { provider } = repairInputs[index];
          if (result.status === 'rejected') {
            failures.push({
              provider: provider.id,
              error: mentorFailureCode(result.reason, 'MENTOR_PROVIDER_REPAIR_FAILED'),
              stage: 'repair',
            });
            continue;
          }
          try {
            const proposal = await assertImportsResolve(normalizeProposal(
              result.value.output?.text ?? result.value.output,
              result.value.output?.provenance || { provider: provider.providerId, model: provider.modelId },
              files,
              previousAttempts,
              references,
              result.value.visibleScope,
            ), pathExists, files);
            assertTestIncluded(proposal, mode, requireTest, scope);
            proposals.push({ ...proposal, provider_id: provider.id, score: scoreProposal(proposal), repaired: true });
            repairValidProposals += 1;
          } catch (error) {
            failures.push({
              provider: provider.id,
              error: mentorFailureCode(error, 'MENTOR_REPAIRED_PROPOSAL_INVALID'),
              stage: 'repair',
              detail: mentorFailureDetail(error, result.value.output?.text ?? result.value.output),
            });
          }
        }
      }
    }

    if (!proposals.length) {
      const error = new Error('MENTOR_NO_VALID_CODE_PROPOSAL');
      error.code = 'MENTOR_NO_VALID_CODE_PROPOSAL';
      error.status = 502;
      error.failures = failures;
      error.repair_attempted = repairAttempted;
      throw error;
    }

    proposals.sort((a, b) => b.score - a.score);
    const best = proposals[0];
    await this.memory.acquireExperience({
      fingerprint: [
        'mentor-council-proposal',
        jobId || 'no-job',
        mode,
        best.summary,
        best.changes.map(change => change.path).join(','),
      ].join('|'),
      job_id: jobId || null,
      goal: objective,
      source_type: mode === 'repair' ? 'MENTOR_COUNCIL_REPAIR_PROPOSAL' : 'MENTOR_COUNCIL_CODE_PROPOSAL',
      lesson: best.summary,
      evidence: {
        proposal_kind: mode === 'repair' ? 'REPAIR_PROPOSAL' : 'CODE_PROPOSAL',
        files: best.changes.map(x => x.path),
        tests: best.tests,
        provider: best.provenance,
        inference_settings: learned.inference,
        active_adapter_id: learned.activeAdapter?.adapter?.id || null,
      },
      score: best.confidence,
      tags: ['development', 'mentor', 'council', mode],
    });

    return {
      ok: true,
      job_id: jobId || null,
      mode,
      code_council: { triggered: codeCouncil, eligible_only: 'CODE', attempted: attemptedProviders, valid_proposals: proposals.length, selected: best.provider_id },
      proposal: {
        summary: best.summary,
        changes: best.changes,
        tests: best.tests,
        confidence: best.confidence,
        lessons: best.lessons,
        risks: best.risks,
        provenance: best.provenance,
      },
      council: {
        providers_attempted: attemptedProviders,
        valid_proposals: proposals.length,
        rejected_proposals: failures,
        selected_provider: best.provider_id,
        structured_repair_attempted: repairAttempted,
        structured_repair_valid_proposals: repairValidProposals,
        selected_from_repair: best.repaired === true,
      },
      learning: {
        memory_context_count: remembered.length,
        acquired_observation_count: experiences.observations.length,
        validated_experience_count: experiences.validated.length,
        inference_settings: learned.inference,
        active_adapter_id: learned.activeAdapter?.adapter?.id || null,
        active_adapter_base_model: learned.activeAdapter?.base_model || null,
      },
      memory_context_count: remembered.length,
      policy: 'ZERO_ADDED_COST_FAIL_CLOSED',
    };
  }

  async recordOutcome({ jobId, goal = '', outcome, lesson, evidence = null, score = 0, tags = [] } = {}) {
    const normalizedOutcome = String(outcome || 'UNKNOWN').toUpperCase();
    const text = bounded(lesson || `Développement ${normalizedOutcome.toLowerCase()} pour ${goal || jobId || 'MEL'}.`, 8000);
    const stored = await this.memory.remember({
      job_id: jobId || null,
      goal,
      kind: 'DEVELOPMENT_OUTCOME',
      lesson: text,
      evidence,
      outcome: normalizedOutcome,
      score,
      tags: ['development', 'outcome', ...tags],
    });

    const requestId = String(evidence?.request_id || '');
    const ci = evidence?.ci;
    if (normalizedOutcome === 'SUCCEEDED' && jobId && requestId && ci?.verified === true) {
      try {
        const validated = await this.memory.validateExperience({
          fingerprint: `teacher-review:${jobId}:${requestId}`,
          proof: ci,
        });
        return {
          ...stored,
          experience_validation: {
            validated: true,
            experience_id: validated.id,
            proof_status: validated.evidence?.proof_status || 'VERIFIED_CANDIDATE_CI',
          },
        };
      } catch (error) {
        return {
          ...stored,
          experience_validation: {
            validated: false,
            reason: String(error?.code || error?.message || 'MENTOR_EXPERIENCE_VALIDATION_FAILED').slice(0, 160),
          },
        };
      }
    }
    return stored;
  }
}

export function createMentorEngine(env, options = {}) {
  return new MentorEngine({ memory: options.memory || new MentorMemoryRepository(env?.DB), providerFactory: options.providerFactory });
}

export const mentorPolicy = Object.freeze({
  max_files: MAX_FILES,
  max_source_chars: MAX_TOTAL_SOURCE_CHARS,
  max_changes: MAX_CHANGES,
  max_change_chars: MAX_CHANGE_CHARS,
  allowed_tests: [...ALLOWED_TESTS],
  deployment_requires_human_approval: true,
});
