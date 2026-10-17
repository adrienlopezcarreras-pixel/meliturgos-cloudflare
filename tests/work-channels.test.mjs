import test from 'node:test';
import assert from 'node:assert/strict';
import { saveChannelCredential, channelStatus, publishDevto, publishBluesky, blueskyPostText, serveWorkImage, WORK_DISCLOSURE_EN } from '../src/revenue/work-channels.js';
import { publishDeliverable } from '../src/revenue/work-stream.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

function memoryVault() {
  const store = new Map();
  return { async putToken({ owner, connector_id, token_set }) { store.set(owner + '|' + connector_id, token_set); }, async getToken({ owner, connector_id }) { return store.get(owner + '|' + connector_id) || null; } };
}
const env0 = () => ({ MELITURGOS_USER: 'adrien', AI: { run: async () => ({}) }, MEDIA_BUCKET: { put: async () => {}, get: async () => null } });

test('owner saves MEL\'s own dev.to and Bluesky keys into the vault; bad formats are refused', async () => {
  const vaults = memoryVault();
  const env = env0();
  assert.deepEqual(await channelStatus(env, { vaults }), { mel_page: true, image: true, devto: false, bluesky: false, bluesky_handle: null });
  await assert.rejects(saveChannelCredential(env, 'devto', { api_key: 'x' }, { vaults }), /DEVTO_API_KEY_INVALID/);
  await assert.rejects(saveChannelCredential(env, 'bluesky', { handle: 'mel.bsky.social', app_password: 'my-real-password' }, { vaults }), /BLUESKY_APP_PASSWORD_INVALID/);
  await saveChannelCredential(env, 'devto', { api_key: 'AbCdEfGhIjKlMnOpQrSt' }, { vaults });
  await saveChannelCredential(env, 'bluesky', { handle: '@MEL.bsky.social', app_password: 'abcd-efgh-ijkl-mnop' }, { vaults });
  const s = await channelStatus(env, { vaults });
  assert.equal(s.devto, true); assert.equal(s.bluesky, true); assert.equal(s.bluesky_handle, 'mel.bsky.social');
});

test('dev.to article always carries the AI/paid-task disclosure and sane tags', async () => {
  const vaults = memoryVault();
  const env = env0();
  await saveChannelCredential(env, 'devto', { api_key: 'AbCdEfGhIjKlMnOpQrSt' }, { vaults });
  let sent = null;
  const fetchImpl = async (url, init) => { sent = { url, init, body: JSON.parse(init.body) }; return Response.json({ url: 'https://dev.to/mel/knots-1abc' }, { status: 201 }); };
  const { url } = await publishDevto(env, { title: 'Knots analysis', markdown: '# Hi', tags: ['Bit-coin', 'Open Source', 'a', 'b', 'c'], imageUrl: 'https://mel.test/p/img/x.jpg' }, { vaults, fetchImpl });
  assert.equal(url, 'https://dev.to/mel/knots-1abc');
  assert.equal(sent.init.headers['api-key'], 'AbCdEfGhIjKlMnOpQrSt');
  assert.ok(sent.body.article.body_markdown.includes(WORK_DISCLOSURE_EN));
  assert.deepEqual(sent.body.article.tags, ['bitcoin', 'opensource', 'a', 'b']);
  assert.equal(sent.body.article.published, true);
});

test('Bluesky post stays under 300 characters, is labelled AI-written and links with exact byte offsets', async () => {
  const link = 'https://dev.to/mel/knots-1abc';
  const text = blueskyPostText('é'.repeat(400), link);
  assert.ok(Array.from(text).length <= 300);
  assert.match(text, /AI-written, paid task/);
  const vaults = memoryVault();
  const env = env0();
  await saveChannelCredential(env, 'bluesky', { handle: 'mel.bsky.social', app_password: 'abcd-efgh-ijkl-mnop' }, { vaults });
  let record = null;
  const fetchImpl = async (url, init) => {
    if (url.endsWith('createSession')) return Response.json({ accessJwt: 'jwt', did: 'did:plc:mel' });
    if (url.endsWith('createRecord')) { record = JSON.parse(init.body).record; return Response.json({ uri: 'at://did:plc:mel/app.bsky.feed.post/3kabc' }); }
    return new Response('{}', { status: 500 });
  };
  const { url } = await publishBluesky(env, { summary: 'Résumé élégant', link }, { vaults, fetchImpl });
  assert.equal(url, 'https://bsky.app/profile/mel.bsky.social/post/3kabc');
  const bytes = new TextEncoder().encode(record.text);
  const { byteStart, byteEnd } = record.facets[0].index;
  assert.equal(new TextDecoder().decode(bytes.slice(byteStart, byteEnd)), link);
});

test('publishing pipeline: image + dev.to + Bluesky links are appended; any failure means nothing is handed in', async () => {
  const db = sqliteD1();
  const vaults = memoryVault();
  const env = { ...env0(), DB: db, MEL_PUBLIC_ORIGIN: 'https://mel.test' };
  const mission = { id: '0x' + '1'.repeat(64), description: '# Analyse Knots and publish' };
  const assessment = { publishTargets: ['devto', 'bluesky'], needsImage: true, language: 'en' };
  const channels = { image: true, devto: true, bluesky: true };
  const calls = [];
  const ok = await publishDeliverable({
    env: { ...env, AI: { run: async (model, input) => model.includes('flux') ? { image: btoa('x'.repeat(4096)) } : { response: '{"title":"Knots","tags":["bitcoin"],"summary":"Short summary","image_prompt":"abstract knot"}' } } },
    mission, assessment, output: { content: '# Knots\n\nAnalysis.' }, channels,
    step: t => calls.push(t),
  }).catch(e => e);
  // Without stored keys the external targets fail closed.
  assert.equal(ok?.message, 'WORK_SOLVER_OUTPUT_INVALID');
  assert.ok(calls.some(t => /Publication impossible/.test(t)));
});

test('image route only serves well-formed ids', async () => {
  assert.equal((await serveWorkImage(new Request('https://mel.test/p/img/../../x.jpg'), env0())).status, 404);
  assert.equal((await serveWorkImage(new Request('https://mel.test/p/img/abcdefghijkmnpqr.jpg'), env0())).status, 404);
});

test('publishing pipeline success: image generated, dev.to article and Bluesky post, links appended to the hand-in', async () => {
  const vaults = memoryVault();
  const stored = [];
  const env = { MELITURGOS_USER: 'adrien', DB: sqliteD1(), MEL_PUBLIC_ORIGIN: 'https://mel.test',
    MEDIA_BUCKET: { put: async (key) => { stored.push(key); }, get: async () => null },
    AI: { run: async (model) => model.includes('flux') ? { image: btoa('x'.repeat(4096)) } : { response: '{"title":"Knots","tags":["bitcoin"],"summary":"Short summary","image_prompt":"abstract knot"}' } } };
  await saveChannelCredential(env, 'devto', { api_key: 'AbCdEfGhIjKlMnOpQrSt' }, { vaults });
  await saveChannelCredential(env, 'bluesky', { handle: 'mel.bsky.social', app_password: 'abcd-efgh-ijkl-mnop' }, { vaults });
  const fetchImpl = async (url) => {
    if (url === 'https://dev.to/api/articles') return Response.json({ url: 'https://dev.to/mel/knots-1abc' }, { status: 201 });
    if (url.endsWith('createSession')) return Response.json({ accessJwt: 'jwt', did: 'did:plc:mel' });
    if (url.endsWith('uploadBlob')) return Response.json({ blob: { ref: 'b' } });
    if (url.endsWith('createRecord')) return Response.json({ uri: 'at://did:plc:mel/app.bsky.feed.post/3kabc' });
    return new Response('{}', { status: 500 });
  };
  const out = await publishDeliverable({ env, mission: { id: 't', description: 'x' }, assessment: { publishTargets: ['devto', 'bluesky'], needsImage: true, language: 'en' }, output: { content: '# Knots\n\nAnalysis.' }, channels: { image: true, devto: true, bluesky: true }, deps: { vaults, fetchImpl } });
  assert.match(out.content, /Image : https:\/\/mel\.test\/p\/img\/[a-z0-9]{16}\.jpg/);
  assert.match(out.content, /Article dev\.to : https:\/\/dev\.to\/mel\/knots-1abc/);
  assert.match(out.content, /Post Bluesky : https:\/\/bsky\.app\/profile\/mel\.bsky\.social\/post\/3kabc/);
  assert.equal(stored.length, 1);
});
