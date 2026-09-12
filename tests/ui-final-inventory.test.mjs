import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet as renderFull } from '../src/pages/full-interface-v5.js';
import { onRequestGet as renderNormal } from '../src/pages/mvp-interface-v2.js';
import { finalizeMvpInterface } from '../src/pages/mvp-interface-finalizer.js';

function duplicateIds(html) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

test('full mode static DOM has unique ids and one intentional command surface', async () => {
  const html = await (await renderFull({})).text();
  assert.deepEqual(duplicateIds(html), []);
  for (const id of ['overviewRefresh','roomSend','roomRefresh','workCreate','workRefresh','roadRefresh','diagRefresh','runAudit']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must exist exactly once`);
  }
  assert.doesNotMatch(html, /melStatusBtnV5|melMentorBtnV5|melNextBtnV5|mentorRoomCanonical|melReaderBottomCanonical|runDag|auditDeep/);
});

test('normal mode keeps useful interactions and hides unsupported file import', async () => {
  const base = await readFile(new URL('../src/pages/mvp-interface.js', import.meta.url), 'utf8');
  const behavior = await readFile(new URL('../src/pages/mvp-behavior-enhancer.js', import.meta.url), 'utf8');
  const finalizer = await readFile(new URL('../src/pages/mvp-interface-finalizer.js', import.meta.url), 'utf8');

  assert.match(base, /send\.addEventListener\('click'/);
  assert.match(base, /full\.addEventListener\('click'/);
  assert.match(base, /themeButton\.addEventListener\('click'/);
  assert.match(base, /avatar\.addEventListener\('click'/);
  assert.match(base, /input\.addEventListener\('keydown'/);
  assert.match(behavior, /CHAT_TIMEOUT_MS=120000/);
  assert.match(behavior, /melAuditRefresh.*addEventListener/s);
  assert.match(behavior, /\.drop,#fileInput/);
  assert.doesNotMatch(behavior, /\/api\/voice\/transcribe|\/api\/files\/(?:analyze|upload)/);
  assert.match(finalizer, /melReadingsToday/);
  assert.match(finalizer, /addEventListener\('click'.*aelfUrl/s);
  assert.match(finalizer, /const AVATARS=/);
});

test('normal route renders one behavior layer and one finalizer layer', async () => {
  const behaviorResponse = await renderNormal({});
  const finalResponse = await finalizeMvpInterface(behaviorResponse);
  const html = await finalResponse.text();
  assert.equal((html.match(/id="mel-mvp-behavior-runtime"/g) || []).length, 1);
  assert.equal((html.match(/id="mel-interface-finalizer-runtime"/g) || []).length, 1);
  assert.match(html, /Audit MEL/);
  assert.match(html, /Lectures du jour/);
  assert.match(html, /Mode complet/);
  assert.match(html, /\/assets\/avatars\/mel-classic\.webp/);
});
