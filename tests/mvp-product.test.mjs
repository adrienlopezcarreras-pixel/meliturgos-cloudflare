import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat, readFile } from 'node:fs/promises';
import { onRequestGet as normalMvp } from '../src/pages/mvp-interface.js';
import { onRequestGet as professorPage } from '../src/pages/full-interface-v2.js';
import { withConversationArchive } from '../src/conversations/intercept.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import worker from '../src/index.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { composeProfessorEnhancements } from '../src/pages/mvp-behavior-enhancer.js';
import { FULL_MODE_CONTROL_PATCH } from '../src/pages/full-mode-control-enhancer.js';
import { WORK_TRUTH_PATCH } from '../src/pages/work-truth-enhancer.js';

async function canonicalProfessorHtml() {
  const response = await professorPage({});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  return response.text();
}


test('static MEL visuals stay outside the Worker JavaScript bundle', async () => {
  const indexSource = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const assetSource = await readFile(new URL('../src/pages/mel-avatar-assets.js', import.meta.url), 'utf8');
  assert.doesNotMatch(indexSource, /serveMelAvatar/);
  assert.doesNotMatch(assetSource, /mel-themes-20260917\/generated|data:image|base64,/);
  const required = [
    '../dist/assets/avatars/mel-classic.webp',
    '../dist/assets/avatars/mel-full.webp',
    '../dist/assets/backgrounds/mel-bg-library-hd.jpg',
    '../dist/assets/backgrounds/mel-bg-futuristic-hd.jpg',
  ];
  for (const relative of required) {
    const info = await stat(new URL(relative, import.meta.url));
    assert.ok(info.size > 10000, relative);
  }
});

test('normal MEL surface remains available and loads the external canonical controls runtime', async () => {
  const response = await normalMvp({});
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.match(html, /<title>MEL<\/title>/);
  assert.match(html, /id="melAvatar"/);
  assert.match(html, /id="full"/);
  assert.match(html, /<script src="\/normal-runtime\.js\?v=5" defer><\/script>/);
  assert.doesNotMatch(html, /id="mel-normal-v3-runtime"/);
  assert.match(html, /data-mel-theme-choice="classic"/);
  assert.match(html, /data-mel-avatar="\/assets\/avatars\/mel-classic\.webp"/);
  assert.doesNotThrow(() => new Function(NORMAL_RUNTIME_SOURCE));
  assert.match(NORMAL_RUNTIME_SOURCE, /full\.addEventListener\('click'/);
  assert.match(NORMAL_RUNTIME_SOURCE, /themeTrigger\.addEventListener\('click'/);
  assert.match(NORMAL_RUNTIME_SOURCE, /send\.addEventListener\('click'/);
  assert.match(NORMAL_RUNTIME_SOURCE, /let conversationId=stableId\('mel\.conversation'\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /conversationId=String\(d\.conversation\.id\);localStorage\.setItem\('mel\.conversation',conversationId\)/);
});

test('Professor enhancement pipeline is single-pass and idempotent', async () => {
  const html = await canonicalProfessorHtml();
  const enhanced = composeProfessorEnhancements(html);
  for (const marker of ['mel-full-control-runtime','mel-roadmap-live-refresh-runtime','mel-work-truth-runtime']) {
    assert.equal((enhanced.match(new RegExp(marker, 'g')) || []).length, 1, marker);
  }
  assert.equal(composeProfessorEnhancements(enhanced), enhanced);
  assert.match(FULL_MODE_CONTROL_PATCH, /loadControlState\(\);activityTimer=setInterval/);
  assert.doesNotMatch(FULL_MODE_CONTROL_PATCH, /loadActivity\(\);activityTimer=setInterval/);
  assert.match(WORK_TRUTH_PATCH, /if\(panel\.classList\.contains\('active'\)\)refresh\(\);/);
});

test('canonical Professor keeps chat in the same control surface and sends through /api/chat', async () => {
  const html = await canonicalProfessorHtml();
  assert.match(html, /<title>Mode complet<\/title>/);
  assert.match(html, /id="chatlog"/);
  assert.match(html, /id="chatInput"/);
  assert.match(html, /id="chatSend"/);
  assert.match(html, /jfetch\('\/api\/chat'/);
  assert.match(html, /conversation_id:conversationId/);
  assert.match(html, /device_id:deviceId/);
  assert.match(html, /e\.key==='Enter'/);
});

test('canonical Professor renders chat text safely and exposes explicit error state', async () => {
  const html = await canonicalProfessorHtml();
  assert.match(html, /d\.textContent=text/);
  assert.match(html, /addMsg\('mel','Erreur : '\+e\.message\)/);
  assert.match(html, /qs\('#chatSend'\)\.disabled=false/);
  assert.doesNotMatch(html, /chatlog[^\n]{0,200}innerHTML\s*=\s*text/);
});

test('canonical Professor exposes the complete control-center views instead of the retired theme picker', async () => {
  const html = await canonicalProfessorHtml();
  for (const view of ['overview','chat','skills','roadmap','multi','work','memory','diagnostics']) {
    assert.match(html, new RegExp(`data-view="${view}"`));
    assert.match(html, new RegExp(`data-panel="${view}"`));
  }
  assert.doesNotMatch(html, /data-theme-choice/);
  assert.doesNotMatch(html, /conversationSelect|newConversation|interaction_count/i);
});


test('canonical Professor keeps user work API separate from the internal Dev Bridge namespace', async () => {
  const html = await canonicalProfessorHtml();
  assert.match(html, /\/api\/work\/health/);
  assert.match(html, /\/api\/work\/jobs/);
  assert.doesNotMatch(html, /\/api\/dev-bridge\/health/);
  assert.doesNotMatch(html, /\/api\/dev-bridge\/jobs/);
});

test('archive survives request consumption and stores text, device, model and attachments', async () => {
  const DB = sqliteD1();
  try {
    const handler = withConversationArchive(async req => { await req.json(); return Response.json({ text: 'Réponse', model: 'test-engine' }); });
    const response = await handler(new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ text: 'Question', conversation_id: 'c1', device_id: 'd1', attachments: [{ name: 'a.txt' }] }) }), { DB });
    assert.equal(response.status, 200);
    const { results } = await DB.prepare('SELECT * FROM archive_messages ORDER BY timestamp').all();
    assert.equal(results.length, 2);
    assert.equal(results[0].content, 'Question');
    assert.equal(results[1].content, 'Réponse');
    assert.equal(results[0].device_id, 'd1');
    assert.equal(results[1].model, 'test-engine');
    assert.deepEqual(JSON.parse(results[0].attachments_json), [{ name: 'a.txt' }]);
  } finally { DB.close(); }
});

test('failed chat responses are not archived as assistant answers', async () => {
  const DB = sqliteD1();
  try {
    const handler = withConversationArchive(async req => { await req.json(); return Response.json({ error: 'bad' }, { status: 503 }); });
    await handler(new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ text: 'Question' }) }), { DB });
    assert.equal((await DB.prepare('SELECT * FROM archive_messages').all()).results.length, 0);
  } finally { DB.close(); }
});

test('real entrypoint chat integrates model router and archive with mocked AI', async () => {
  const DB = sqliteD1();
  const calls = [];
  const env = { DB, MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only', AI: { async run(model, input) { calls.push({ model, input }); return { response: 'Réponse du moteur de test' }; } } };
  try {
    const response = await worker.fetch(new Request('http://localhost/api/chat', { method: 'POST', headers: { authorization: 'Basic ' + btoa('test:test-only'), 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Bonjour', conversation_id: 'integration', device_id: 'browser' }) }), env);
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.text, 'Réponse du moteur de test');
    assert.equal(calls.length, 1);
    assert.equal((await DB.prepare('SELECT * FROM archive_messages').all()).results.length, 2);
  } finally { DB.close(); }
});

test('conversation context is scoped and cognitive memory reaches the interchangeable engine', async () => {
  const DB = sqliteD1();
  const calls = [];
  const env = { DB, MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only', AI: { async run(model, input) { calls.push(input.messages); return { response: 'Réponse de test' }; } } };
  const request = (text, conversation_id) => new Request('http://localhost/api/chat', { method: 'POST', headers: { authorization: 'Basic ' + btoa('test:test-only'), 'content-type': 'application/json' }, body: JSON.stringify({ text, conversation_id }) });
  try {
    assert.equal((await worker.fetch(request('Souviens-toi que mon projet est le jardin solaire', 'garden'), env)).status, 200);
    assert.equal((await worker.fetch(request('Autre sujet confidentiel pour cette conversation', 'other'), env)).status, 200);
    const response = await worker.fetch(request('Quel est mon projet jardin solaire ?', 'garden'), env);
    assert.equal(response.status, 200);
    const messages = calls.at(-1);
    assert.ok(messages.some(message => message.role === 'user' && message.content.includes('Souviens-toi')));
    assert.ok(!messages.some(message => message.role === 'user' && message.content.includes('Autre sujet')));
    assert.match(messages[0].content, /jardin solaire/);
    assert.equal((await DB.prepare('SELECT * FROM memories').all()).results.length, 1);
  } finally { DB.close(); }
});
