import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditArchitecture } from '../scripts/architecture-audit.mjs';
import { architectureFindings, readArchitectureReport, storeArchitectureReport } from '../src/diagnostics/architecture-audit-store.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

test('the repository audit finds oversized, untested, legacy-imported and duplicated code', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'mel-arch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'tests'), { recursive: true });
  await writeFile(path.join(root, 'src/big.js'), 'export function same() {}\n'.repeat(1600));
  await writeFile(path.join(root, 'src/old.js'), '// LEGACY_DO_NOT_USE\nexport function same() {}\n');
  await writeFile(path.join(root, 'src/roadmap.js'), "export function item(){ return 'LEGACY_DO_NOT_USE'; }\n");
  await writeFile(path.join(root, 'src/user.js'), "import { same } from './old.js';\nimport { item } from './roadmap.js';\nexport function onRequestGet() {}\n");
  await writeFile(path.join(root, 'src/page.js'), 'export function onRequestGet() {}\n');
  await writeFile(path.join(root, 'tests/user.test.mjs'), "import '../src/user.js';\n");
  const report = await auditArchitecture(root);
  assert.deepEqual(report.oversized.map(r => r.path), ['src/big.js']);
  assert.deepEqual(report.untested_modules, ['src/big.js', 'src/old.js', 'src/page.js', 'src/roadmap.js']);
  assert.deepEqual(report.legacy_imported, [{ path: 'src/old.js', imported_by: 'src/user.js' }]);
  assert.deepEqual(report.duplicate_exports.map(d => d.name), ['same'], 'onRequest* page handlers are not duplicates');
});

test('MEL stores the report and the weekly audit turns it into findings', async () => {
  const db = sqliteD1();
  const now = Date.parse('2026-10-26T05:00:00Z');
  await assert.rejects(storeArchitectureReport(db, { schema: 'other' }), /SCHEMA_INVALID/);
  await storeArchitectureReport(db, {
    schema: 'mel.architecture-audit/v1', max_lines: 1500,
    oversized: [{ path: 'src/api/native-chat.js', lines: 3020 }],
    untested_modules: ['src/a.js'], legacy_imported: [], duplicate_exports: [{ name: 'x', files: ['src/a.js', 'src/b.js'] }],
  }, { sha: 'abc', now });
  const latest = await readArchitectureReport(db);
  assert.deepEqual(architectureFindings(latest, { now }).map(f => f.code), ['ARCH_FILE_TOO_LARGE', 'ARCH_DUPLICATE_EXPORT', 'ARCH_UNTESTED_MODULES']);
  assert.deepEqual(architectureFindings(latest, { now: now + 9 * 86_400_000 }).map(f => f.code), ['ARCHITECTURE_AUDIT_STALE']);
  assert.deepEqual(architectureFindings(null, { now }), [], 'no report yet is not a finding');
});

test('the weekly workflow posts with GitHub OIDC and the Worker routes it', async () => {
  const workflow = await readFile('.github/workflows/architecture-audit.yml', 'utf8');
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /\/api\/internal\/architecture-audit/);
  assert.match(workflow, /ARCHITECTURE_REPORT_STORED/);
  assert.match(await readFile('src/professor-live-learning-entry.js', 'utf8'), /maybeHandleArchitectureAuditInternal\(request,env\)/);
  assert.match(await readFile('src/diagnostics/domain-audit.js', 'utf8'), /architectureFindings\(architecture/);
});

test('MEL-AUDIT-06: new Workers AI text models become upgrade discoveries', async () => {
  const { newCatalogModels } = await import('../scripts/workers-ai-catalog-diff.mjs');
  const catalog = { result: [
    { name: '@cf/openai/gpt-oss-120b', task: { name: 'Text Generation' } },
    { name: '@cf/new/coder-2', task: { name: 'Text Generation' } },
    { name: '@cf/old/model', task: { name: 'Text Generation' }, properties: [{ property_id: 'planned_deprecation_date', value: '2026-01-01' }] },
    { name: '@cf/black-forest-labs/flux', task: { name: 'Text-to-Image' } },
  ] };
  assert.deepEqual(newCatalogModels(catalog, ['@cf/openai/gpt-oss-120b']), ['@cf/new/coder-2']);
  const db = sqliteD1();
  const now = Date.now();
  await storeArchitectureReport(db, { schema: 'mel.architecture-audit/v1', new_models: ['@cf/new/coder-2'] }, { now });
  assert.deepEqual(architectureFindings(await readArchitectureReport(db), { now }).map(f => f.code), ['UPGRADE_MODEL_AVAILABLE']);
  assert.match(await readFile('.github/workflows/architecture-audit.yml', 'utf8'), /ai\/models\/search/);
});
