import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contingencyTestModel, renderContingencyTestPage } from '../src/pages/contingency-test-page.js';
import { planCoreMigration } from '../src/continuity/life-contingency.js';

test('the test page switches every part and does not disconnect production', () => {
  const html = renderContingencyTestPage();
  const model = contingencyTestModel();
  assert.equal(model.disconnects_production, false);
  assert.match(html, /ne débranche rien/);
  for (const part of ['cloudflare', 'pc', 'github', 'model', 'gmail', 'onedrive', 'shards']) {
    assert.match(html, new RegExp(part));
  }
  for (const row of model.life) assert.match(html, new RegExp(row.id));
  assert.equal(model.scenarios.length, 127);
  assert.equal(readFileSync(new URL('../src/router.js', import.meta.url), 'utf8').includes('"/test/contingence"'), true);
});

test('a core brick migrates only when its replacement is already proved, and nothing is activated', () => {
  for (const part of ['cloudflare', 'github', 'model']) {
    const blocked = planCoreMigration({ part, replacementReady: false });
    assert.equal(blocked.status, 'MIGRATION_BLOCKED');
    assert.equal(blocked.countermeasure, 'KEEP_SOURCE');
    assert.equal(blocked.activation_performed, false);
    const ready = planCoreMigration({ part, replacementReady: true });
    assert.equal(ready.automatic, true);
    assert.deepEqual(ready.steps, ['EXPORT', 'IMPORT_ON_TARGET', 'SMOKE', 'ACTIVATE', 'ROLLBACK_IF_SMOKE_FAILS']);
    assert.equal(ready.activation_performed, false);
  }
  assert.throws(() => planCoreMigration({ part: 'gmail' }), /CORE_BRICK_UNKNOWN/);
});
