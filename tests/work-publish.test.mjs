import test from 'node:test';
import assert from 'node:assert/strict';
import { publishWork, servePublication, extractHtmlDocument, renderMarkdown } from '../src/revenue/work-publish.js';
import { streamDirectWork } from '../src/revenue/work-stream.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const get = (path, env) => servePublication(new Request('https://mel.test' + path), env);

test('a Markdown deliverable is published as an escaped public article', async () => {
  const env = { DB: sqliteD1() };
  const { url, kind, slug } = await publishWork(env, { title: 'Guide <b>', content: '# Titre\n\nTexte **gras** <script>alert(1)</script>\n\n- un\n- deux', origin: 'https://mel.test/' });
  assert.equal(kind, 'markdown');
  assert.match(url, /^https:\/\/mel\.test\/p\/[a-z0-9]{12}$/);
  const res = await get('/p/' + slug, env);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<strong>gras<\/strong>/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
});

test('an HTML deliverable (page, demo, mini-game) runs in a CSP sandbox, never on MEL\'s origin', async () => {
  const env = { DB: sqliteD1() };
  const content = 'Voici le jeu :\n```html\n<!doctype html><html><body><canvas></canvas><script>1</script></body></html>\n```';
  assert.ok(extractHtmlDocument(content));
  const { slug, kind } = await publishWork(env, { title: 'Jeu', content, origin: 'https://mel.test' });
  assert.equal(kind, 'html');
  const res = await get('/p/' + slug, env);
  assert.match(res.headers.get('content-security-policy'), /^sandbox allow-scripts/);
  assert.doesNotMatch(res.headers.get('content-security-policy'), /allow-same-origin/);
  assert.match(await res.text(), /^<!doctype html>/);
  assert.equal((await get('/p/zzzzzzzzzzzz', env)).status, 404);
  assert.equal((await get('/p/../secret', env)).status, 404);
});

test('markdown renderer only emits http(s) links', () => {
  assert.doesNotMatch(renderMarkdown('[x](javascript:alert(1))'), /href="javascript/);
  assert.match(renderMarkdown('[x](https://a.b/c)'), /href="https:\/\/a\.b\/c"/);
});

test('a mission asking for a public link gets one: MEL publishes and appends it to the deliverable', async () => {
  const db = sqliteD1({ maintenanceFence: true });
  const NOW = Date.parse('2026-10-17T12:00:00Z');
  const env = { DB: db, MEL_PUBLIC_ORIGIN: 'https://mel.test', AI: { async run(_m, input) {
    if (input.messages[0].content.startsWith('Tu es MEL WORK')) return { response: '# Article\n\nContenu.' };
    return { response: '{"eligible":true,"draftable":true,"confidenceBps":9500,"category":"writing","deliverable":"text","needsPublicUrl":true,"requiresHuman":false,"requiresPhysicalWorld":false,"requiresSecrets":false,"requestsUnsafeAction":false,"humanSteps":[],"reason":"ok"}' };
  } } };
  const task = { id: '0x' + '1'.repeat(64), status: 'open', reward: '2000000', submissionCount: 0, mode: 'bounty', claimedBy: null, stakeRequired: false, expiryTime: new Date(NOW + 24 * 3600_000).toISOString(), description: '# Write and publish an article\nPublish it and send the link.' };
  const queued = [];
  const text = await streamDirectWork({ env, fetchImpl: async () => Response.json({ tasks: [task] }), now: () => NOW, autonomous: true, queueSubmission: async (_e, a) => { queued.push(a); return { status: 'QUEUED' }; } }).text();
  const events = text.split('\n').filter(Boolean).map(l => JSON.parse(l));
  const done = events.find(e => e.type === 'done');
  assert.ok(done, text);
  const saved = await db.prepare('SELECT content FROM mel_work_artifacts WHERE id=?').bind(done.result.artifactId).first();
  const link = saved.content.match(/Lien public : (https:\/\/mel\.test\/p\/([a-z0-9]{12}))/);
  assert.ok(link, saved.content);
  assert.equal((await get('/p/' + link[2], env)).status, 200);
  assert.equal(queued.length, 1);
});
