import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contingencyTestModel, renderContingencyTestPage } from '../src/pages/contingency-test-page.js';
import { planCoreMigration } from '../src/continuity/life-contingency.js';

test('the test page switches every part and does not disconnect production', () => {
  const html = renderContingencyTestPage();
  const model = contingencyTestModel();
  assert.equal(model.disconnects_production, false);
  assert.match(html, /href="\/professor"/);
  assert.match(html, /Retour au mode complet/);
  assert.match(html, /<footer>Notice : cette page est un test/);
  for (const part of ['cloudflare', 'pc', 'github', 'model', 'gmail', 'onedrive', 'shards']) {
    assert.match(html, new RegExp(part));
  }
  for (const row of model.life) assert.match(html, new RegExp(row.id));
  assert.equal(model.scenarios.length, 127);
  assert.match(html, /id="candidates"/);
  assert.match(html, /candidats, ni activés ni validés/);
  for (const part of ['cloudflare','pc','github','model','gmail','onedrive','shards']) {
    assert.ok(model.replacement_catalog[part].candidates.length > 0, part);
  }
  assert.equal(readFileSync(new URL('../src/router.js', import.meta.url), 'utf8').includes('"/test/contingence"'), true);
});

test('a core brick migrates only when its replacement is already proved, and nothing is activated', () => {
  for (const part of ['cloudflare', 'github', 'model']) {
    const blocked = planCoreMigration({ part, replacementReady: false });
    assert.equal(blocked.status, 'MIGRATION_BLOCKED');
    assert.equal(blocked.countermeasure, 'KEEP_SOURCE');
    assert.equal(blocked.activation_performed, false);
    const ready = planCoreMigration({ part, replacementReady: true });
    // A proven candidate can be prepared, but never switched without approval.
    assert.equal(ready.automatic, false);
    assert.deepEqual(ready.steps, ['EXPORT', 'IMPORT_ON_TARGET', 'SMOKE', 'ACTIVATE', 'ROLLBACK_IF_SMOKE_FAILS']);
    assert.equal(ready.activation_performed, false);
  }
  assert.throws(() => planCoreMigration({ part: 'gmail' }), /CORE_BRICK_UNKNOWN/);
});


test('contingency page clearly separates simulations from production state and provides return controls',()=>{
  const html=renderContingencyTestPage();
  assert.equal((html.match(/href="\/professor"/g)||[]).length,2,'return to MEL at top and bottom');
  assert.match(html,/role="button">← Retour au mode complet de MEL/);
  assert.match(html,/id="reset"/);
  assert.match(html,/id="selection-summary"/);
  assert.match(html,/id="replacement-details"/);
  assert.match(html,/id="count-scenarios"/);
  assert.match(html,/id="count-events"/);
  assert.match(html,/Mode simulation|Simulation uniquement/i);
  assert.match(html,/ne montre pas l'état de santé réel de MEL/);
  assert.match(html,/aucun déploiement n'est effectué/);
  assert.match(html,/ShardVault 7\/7/);
  assert.match(html,/@media\(max-width:740px\)/);
  assert.match(html,/parts\.querySelectorAll\('input\[type=checkbox\]'\)/);
  assert.match(html,/github\.com\/adrienlopezcarreras-pixel\/meliturgos-cloudflare\/pull\/3094/);
});
test('all 127 combinations are matched by set membership, never lexicographical ordering',()=>{
  const html=renderContingencyTestPage();
  assert.match(html,/row\.down\.length === down\.length && row\.down\.every\(part => down\.includes\(part\)\)/);
  const scenarios=contingencyTestModel().scenarios;
  assert.equal(scenarios.length,127);
  for(const scenario of scenarios) {
    const checked=[...scenario.down].reverse();
    const matches=scenarios.filter(row=>row.down.length===checked.length&&row.down.every(part=>checked.includes(part)));
    assert.equal(matches.length,1,scenario.down.join(','));
    assert.deepEqual(matches[0].down,scenario.down);
  }
});
