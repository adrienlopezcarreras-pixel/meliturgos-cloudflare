import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet } from '../src/pages/full-interface-v5.js';

const sourceUrl = new URL('../src/pages/full-interface-v5.js', import.meta.url);

function count(text, needle) {
  return text.split(needle).length - 1;
}

test('full mode removes legacy duplicate rooms and redundant action buttons', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const html = await (await onRequestGet({})).text();
  assert.doesNotMatch(source, /RENDER_CONTRACT|melFullRenderContract/);
  for (const obsolete of ['mentorRoomCanonical','melCanonicalStatus','melStatusBtnV5','melMentorBtnV5','melNextBtnV5','melReaderLastCanonical','melReaderBottomCanonical','melReaderLargeCanonical']) {
    assert.doesNotMatch(html, new RegExp(obsolete));
  }
  assert.equal(count(html, 'id="chatInput"'), 1);
  assert.equal(count(html, 'id="chatSend"'), 1);
  assert.equal(count(html, 'id="chatTarget"'), 1);
  assert.doesNotMatch(html, /Prochaine tâche|Fin du chat|Grande lecture|Dernière réponse|F5 revient ici/);
});

test('every static full-mode action button has a real handler', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  for (const id of ['refreshAll','chatSend','workCreate','workRefresh','runAudit']) {
    assert.match(source, new RegExp("el\\('" + id + "'\\)\\.addEventListener"), `${id} has no event handler`);
  }
  assert.match(source, /querySelectorAll\('\.nav button'\)[\s\S]*addEventListener/);
  assert.match(source, /workList'\)\.addEventListener[\s\S]*data-job-action/);
});

test('full mode gives each section one clear responsibility', async () => {
  const html = await (await onRequestGet({})).text();
  for (const panel of ['overview','salon','work','roadmap','diagnostics']) assert.equal(count(html, `data-panel="${panel}"`), 1);
  assert.match(html, /Une fonction par commande/);
  assert.match(html, /Vue de référence en lecture seule/);
  assert.match(html, /Une seule commande d’audit/);
  assert.match(html, /Détail et exécution restent deux actions distinctes/);
});

test('Mentor and Council routes remain separate and zero-euro guarded', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /\/api\/gen2\/mentor\/chat/);
  assert.match(source, /\/api\/gen2\/mentor\/status/);
  assert.match(source, /\/api\/gen2\/augmentio\/fanout/);
  assert.match(source, /Zero-Euro Governor/);
  assert.doesNotMatch(source, /openai/i);
});
