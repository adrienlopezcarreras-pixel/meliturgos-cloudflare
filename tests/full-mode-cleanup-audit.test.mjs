import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet } from '../src/pages/full-interface-v5.js';

const sourceUrl = new URL('../src/pages/full-interface-v5.js', import.meta.url);
function count(text, needle) { return text.split(needle).length - 1; }

test('full mode removes legacy duplicate rooms and redundant controls', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const html = await (await onRequestGet({})).text();
  assert.doesNotMatch(source, /RENDER_CONTRACT|melFullRenderContract/);
  for (const obsolete of ['mentorRoomCanonical','melCanonicalStatus','melStatusBtnV5','melMentorBtnV5','melNextBtnV5','melReaderLastCanonical','melReaderBottomCanonical','melReaderLargeCanonical']) assert.doesNotMatch(html, new RegExp(obsolete));
  assert.equal(count(html, 'id="roomInput"'), 1);
  assert.equal(count(html, 'id="roomSend"'), 1);
  assert.equal(count(html, 'id="roomTarget"'), 1);
  assert.doesNotMatch(html, /Prochaine tâche|Fin du chat|Grande lecture|Dernière réponse|F5 revient ici/);
});

test('full mode only references live runtime routes for work and audit', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  for (const route of ['/api/professor/dev/status','/api/professor/dev/jobs','/api/professor/dev/autonomy/status','/api/gen2/capabilities','/api/gen2/code/self-check','/api/gen2/roadmap']) assert.match(source, new RegExp(route.replaceAll('/','\\/')));
  for (const dead of ['/api/gen2/orchestration/status','/api/gen2/work/dags','/api/gen2/capabilities/audit']) assert.doesNotMatch(source, new RegExp(dead.replaceAll('/','\\/')));
  assert.doesNotMatch(source, /runDag|auditDeep/);
});

test('full mode avatar uses a guaranteed embedded route everywhere', async () => {
  const html = await (await onRequestGet({})).text();
  assert.match(html, /\/assets\/avatars\/mel-classic\.webp/);
  assert.doesNotMatch(html, /meliturgos-avatar-fille\.png|mel-spanish-20260911\.webp/);
});

test('each static full-mode command is intentionally handled', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  for (const id of ['roomSend','roomRefresh','overviewRefresh','workRefresh','workCreate','roadRefresh','diagRefresh','runAudit']) assert.match(source, new RegExp("getElementById\\('"+id+"'\\)\\.addEventListener"));
  assert.match(source, /qsa\('button\[data-view\]'\)[\s\S]*addEventListener/);
  assert.match(source, /job-detail[\s\S]*addEventListener/);
});

test('Mentor and Council remain separate and zero-euro guarded', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /\/api\/gen2\/mentor\/chat/);
  assert.match(source, /\/api\/gen2\/mentor\/status/);
  assert.match(source, /\/api\/gen2\/augmentio\/fanout/);
  assert.match(source, /zéro-euro/);
  assert.doesNotMatch(source, /openai/i);
});
