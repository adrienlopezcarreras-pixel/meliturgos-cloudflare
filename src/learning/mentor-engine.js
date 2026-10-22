import { assertMentorCodeContract } from './mentor-code-contract.js';
import { createMentorCompanionFallback } from './mentor-companion-provider.js';
import { MentorMemoryRepository } from './mentor-memory.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { ZeroEuroGovernor } from '../augmentio/zero-euro-governor.js';
import { sanitizeInferenceSettings } from './inference-adaptation.js';

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
  if (!ALLOWED_TEXT_PATH.test(value)) {
    const error = new Error(`MENTOR_PATH_DENIED:${value}`);
    error.code = 'MENTOR_PATH_DENIED';
    throw error;
  }
  return value;
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

function parseJsonCandidate(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
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

function applyInspectedEdits(edits, inspectedFiles, repairReferences = [], visibleFiles = inspectedFiles) {
  if (!Array.isArray(edits) || !edits.length) return [];
  if (edits.length > MAX_CHANGES) throw Object.assign(new Error('MENTOR_INVALID_CHANGE:change-limit'), { code: 'MENTOR_INVALID_CHANGE' });
  const byPath = new Map((Array.isArray(inspectedFiles) ? inspectedFiles : []).map(file => [file.path, String(file.content || '')]));
  const touched = [];
  for (const edit of edits) {
    const path = safePath(edit?.path);
    if (!byPath.has(path)) throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${path}`), { code: 'MENTOR_INVALID_CHANGE' });
    const find = String(edit?.find ?? '');
    if (!visibleFiles.some(file => file.path === path && file.content.includes(find))) {
      throw Object.assign(new Error('MENTOR_UNINSPECTED_EDIT'), { code: 'MENTOR_UNINSPECTED_EDIT' });
    }
    const replace = String(edit?.replace ?? '');
    if (!find || find.length > 8000 || replace.length > MAX_CHANGE_CHARS) {
      throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${path}`), { code: 'MENTOR_INVALID_CHANGE' });
    }
    const source = byPath.get(path);
    const at = source.indexOf(find);
    if (at < 0 || source.indexOf(find, at + find.length) >= 0) {
      throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${path}`), { code: 'MENTOR_INVALID_CHANGE' });
    }
    const content = source.slice(0, at) + replace + source.slice(at + find.length);
    if (!content || content.length > MAX_CHANGE_CHARS || incompleteFile(content, source + (repairReferences.find(file => file.path === path)?.content || ''))) {
      throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${path}`), { code: 'MENTOR_INVALID_CHANGE' });
    }
    byPath.set(path, content);
    if (!touched.includes(path)) touched.push(path);
  }
  return touched.map(path => ({
    path,
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
  const tests = [...new Set((Array.isArray(parsed.tests) ? parsed.tests : []).map(String).filter(name => ALLOWED_TESTS.has(name)))].slice(0, 4);
  if (!tests.length) tests.push('test:smoke');
  for (const change of changes) {
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
  return provider?.providerId === 'local-companion-ai' ? COMPANION_PROMPT_CHARS : DEFAULT_PROMPT_CHARS;
}

// Fit the prompt to one provider: the frame is kept, sources share the rest.
function promptWithinLimit(build, files, limit, visibleScope = []) {
  const frame = build([]).length;
  let budget = Math.max(0, Math.min(MAX_TOTAL_SOURCE_CHARS, limit - frame - 120 * files.length));
  const excerpts = files.map((file, index) => {
    const share = Math.min(MAX_FILE_CHARS, Math.floor(budget / (files.length - index)));
    const visible = file.content.slice(0, share);
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

function buildRepairPrompt({ goal, files, raw, failure, mode, reference = '' }) {
  const uninspected = /MENTOR_UNINSPECTED_PATH/.test(String(failure || ''));
  const allowed = (Array.isArray(files) ? files : []).slice(0, 6).map(file => file.path).filter(Boolean).join(', ');
  return [
    'Tu répares une réponse de code rejetée. Réponds uniquement par un objet JSON valide.',
    'FORMAT UNIQUE (aucun autre format): {"summary":"modification","edits":[{"path":"CHEMIN_EXACT","find":"EXTRAIT_EXACT_UNIQUE","replace":"NOUVEAU_CONTENU"}],"tests":["test:smoke"],"confidence":0.8}.',
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

function buildPrompt({ role, goal, files, lessons, experiences, previousAttempts, mode, reference = '' }) {
  const allowed = (Array.isArray(files) ? files : []).slice(0, 6).map(file => file.path).filter(Boolean).join(', ');
  return [
    'Tu es le mentor code de MELITURGOS. Réponds uniquement par un objet JSON valide, sans markdown ni explication.',
    'RÔLE: ' + role + '. MODE: ' + (mode === 'repair' ? 'RÉPARATION APRÈS TEST' : 'IMPLÉMENTATION') + '.',
    'FORMAT OBLIGATOIRE: {"summary":"modification concrète","edits":[{"path":"CHEMIN_EXACT","find":"EXTRAIT_EXACT_UNIQUE","replace":"NOUVEAU_CONTENU"}],"tests":["test:smoke"],"confidence":0.8}.',
    'Utilise edits, pas changes. find doit être un extrait EXACT et UNIQUE visible dans SOURCES_INSPECTÉES. replace est son remplacement réel.',
    'Fichiers autorisés: ' + allowed + '. Ne crée pas de fichier non inspecté.',
    'Ne renvoie pas un fichier entier, un diff, un bloc FILE/MEL_FILE, du texte tronqué ou du code hors JSON.',
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

// ChatGPT-GPT6 / MEL-MENTOR-TIMEOUT: each provider call is bounded even
// if its backend ignores AbortSignal; late results never block MAX.
async function boundedMentorInvoke(provider, request, limitMs) {
  const limit = Math.max(10, Math.min(30_000, Number(limitMs) || 25_000));
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
  constructor({ memory, providerFactory, invokeTimeoutMs = 25_000, repairTimeoutMs = 12_000 } = {}) {
    this.memory = memory || new MentorMemoryRepository(null);
    this.providerFactory = providerFactory;
    // ChatGPT-GPT6 / MEL-MENTOR-TIMEOUT: deadlines below the 180-second MAX request.
    this.invokeTimeoutMs = Math.max(10, Math.min(30_000, Number(invokeTimeoutMs) || 25_000));
    this.repairTimeoutMs = Math.max(10, Math.min(30_000, Number(repairTimeoutMs) || 12_000));
  }

  async _providers(env) {
    if (this.providerFactory) return this.providerFactory(env);
    const pool = createDefaultAugmentioPool(env);
    await pool.refreshHealth();
    const governor = new ZeroEuroGovernor({ maxCost: 0 });
    // ChatGPT-GPT6 / MEL-MENTOR-FALLBACK: bounded model fallback (revert this PR to remove).
    // Bound the number of eligible models, but let the mentor fall back beyond
    // the first three when those providers fail or return invalid proposals.
    const cloud = pool.list({ capability: 'CODE' }).filter(provider => governor.allows(provider)).slice(0, 6);
    const companion = await createMentorCompanionFallback(env);
    return companion ? [...cloud, companion] : cloud;
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

  async propose({ env, jobId, goal, inspectedFiles = [], previousAttempts = [], mode = 'implement', repairReferences = [] } = {}) {
    const objective = bounded(goal, 12_000).trim();
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
    const providers = await this._providers(env);
    if (!providers.length) throw Object.assign(new Error('MENTOR_NO_ZERO_COST_CODE_PROVIDER'), { code: 'MENTOR_NO_ZERO_COST_CODE_PROVIDER', status: 503 });

    const roles = ['implémenteur principal', 'relecteur architecture et régressions', 'testeur-réparateur'];
    const proposals = [];
    const failures = [];
    const attemptedProviders = [];
    let repairAttempted = false;
    let repairValidProposals = 0;

    // [ChatGPT-GPT6 / MEL-CODE-CLOUD-FIRST] Separate zero-added-cost cloud
    // waves from optional, prevalidated Companion inference. A partial final
    // cloud wave must finish before any local PC inference can be attempted.
    // No extra scheduler, provider registry or budget is introduced.
    const cloudProviders = providers.filter(provider => provider.providerId !== 'local-companion-ai');
    const localProviders = providers.filter(provider => provider.providerId === 'local-companion-ai');
    const providerWaves = [];
    for (const tier of [cloudProviders, localProviders]) {
      for (let offset = 0; offset < tier.length; offset += 3) {
        providerWaves.push(tier.slice(offset, offset + 3));
      }
    }
    for (const wave of providerWaves) {
      if (proposals.length) break;
      const waveOffset = attemptedProviders.length;
      attemptedProviders.push(...wave.map(provider => provider.id));
      const settled = await Promise.allSettled(wave.map((provider, index) => {
        const active = learned.activeAdapter;
        const lora = active?.base_model === provider.modelId ? active?.adapter?.id : null;
        const visibleScope = [];
        return boundedMentorInvoke(provider, {
          input: promptWithinLimit(
            visible => buildPrompt({ role: roles[(waveOffset + index) % roles.length], goal: objective, files: visible, lessons: remembered, experiences, previousAttempts, mode, reference: referenceFor(provider) }),
            files,
            promptLimit(provider),
            visibleScope,
          ),
          context: {
            purpose: 'mel-autonomous-development',
            job_id: jobId || null,
            mode,
            inference_settings: learned.inference,
            ...(lora ? { lora } : {}),
          },
        }, this.invokeTimeoutMs).then(output => ({ output, visibleScope }));
      }));

      const repairInputs = [];
      settled.forEach((result, index) => {
        const provider = wave[index];
        if (result.status === 'rejected') {
          const failure = mentorFailureCode(result.reason);
          failures.push({ provider: provider.id, error: failure, stage: 'initial' });
          // A provider outage has no malformed answer to repair. Try another
          // provider instead of issuing the same failed inference twice.
          return;
        }
        const output = result.value.output;
        const raw = output?.text ?? output;
        try {
          const proposal = normalizeProposal(raw, output?.provenance || { provider: provider.providerId, model: provider.modelId }, files, previousAttempts, references, result.value.visibleScope);
          proposals.push({ ...proposal, provider_id: provider.id, score: scoreProposal(proposal), repaired: false });
        } catch (error) {
          const failure = mentorFailureCode(error, 'MENTOR_PROPOSAL_INVALID');
          failures.push({ provider: provider.id, error: failure, stage: 'initial' });
          repairInputs.push({ provider, raw: bounded(raw, 20_000), failure });
        }
      });

      if (!proposals.length && repairInputs.length) {
        repairAttempted = true;
        const active = learned.activeAdapter;
        const repaired = await Promise.allSettled(repairInputs.map(({ provider, raw, failure }) => {
          const lora = active?.base_model === provider.modelId ? active?.adapter?.id : null;
          const visibleScope = [];
          return boundedMentorInvoke(provider, {
            input: promptWithinLimit(
              visible => buildRepairPrompt({ goal: objective, files: visible, raw: bounded(raw, Math.floor(promptLimit(provider) / 3)), failure, mode, reference: referenceFor(provider) }),
              files,
              promptLimit(provider),
              visibleScope,
            ),
            context: {
              purpose: 'mel-autonomous-development-structured-repair',
              job_id: jobId || null,
              mode,
              inference_settings: learned.inference,
              ...(lora ? { lora } : {}),
            },
          }, this.repairTimeoutMs).then(output => ({ output, visibleScope }));
        }));
        repaired.forEach((result, index) => {
          const { provider } = repairInputs[index];
          if (result.status === 'rejected') {
            failures.push({
              provider: provider.id,
              error: mentorFailureCode(result.reason, 'MENTOR_PROVIDER_REPAIR_FAILED'),
              stage: 'repair',
            });
            return;
          }
          try {
            const proposal = normalizeProposal(
              result.value.output?.text ?? result.value.output,
              result.value.output?.provenance || { provider: provider.providerId, model: provider.modelId },
              files,
              previousAttempts,
              references,
              result.value.visibleScope,
            );
            proposals.push({ ...proposal, provider_id: provider.id, score: scoreProposal(proposal), repaired: true });
            repairValidProposals += 1;
          } catch (error) {
            failures.push({
              provider: provider.id,
              error: mentorFailureCode(error, 'MENTOR_REPAIRED_PROPOSAL_INVALID'),
              stage: 'repair',
            });
          }
        });
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
