import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeUiAudit } from '../scripts/ui-production-audit.mjs';
import { architectureFindings, readArchitectureReport, storeArchitectureReport } from '../src/diagnostics/architecture-audit-store.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

test('UI audit: server errors, JS errors and stuck panels are findings; 401/403 are blocked, not failures', () => {
  const report = summarizeUiAudit([
    { path: '/', panel: null, errors: [], responses: [{ method: 'GET', path: '/api/a', status: 500 }, { method: 'GET', path: '/api/b', status: 401 }], stuck: ['box'] },
    { path: '/professor', panel: 'lora', errors: ['boom'], responses: [{ method: 'GET', path: '/api/c', status: 403 }, { method: 'GET', path: '/api/d', status: 200 }], stuck: [] },
    { path: '/', panel: 'chat', errors: [], responses: [], stuck: ['box'] },
  ]);
  assert.equal(report.api_calls, 4);
  assert.equal(report.blocked_calls, 2);
  assert.deepEqual(report.findings.map(f => f.code), ['UI_API_SERVER_ERROR', 'UI_STUCK_LOADING', 'UI_JS_ERROR'], 'the same stuck element on several panels is one finding');
});

test('the UI section rides the weekly report into MEL findings', async () => {
  const db = sqliteD1();
  const now = Date.now();
  await storeArchitectureReport(db, { schema: 'mel.architecture-audit/v1', ui: { schema: 'mel.ui-production-audit/v1', pages: 12, findings: [{ code: 'UI_JS_ERROR', detail: '/professor#lora : boom' }, { code: 'NOT_UI', detail: 'x' }] } }, { now });
  assert.deepEqual(architectureFindings(await readArchitectureReport(db), { now }).map(f => f.code), ['UI_JS_ERROR']);
});

test('the production UI audit is read-only and never blocks the weekly report', async () => {
  const script = await readFile('scripts/ui-production-audit.mjs', 'utf8');
  assert.match(script, /route\.request\(\)\.method\(\) === 'GET' \? route\.continue\(\) : route\.abort\(\)/);
  const workflow = await readFile('.github/workflows/architecture-audit.yml', 'utf8');
  assert.match(workflow, /Audit the production interface \(read-only\)/);
  assert.match(workflow, /add-mask::\$MEL_PARALLEL_PROOF/);
  assert.match(workflow, /UI audit failed to run; report sent without ui/);
});
