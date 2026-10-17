// MEL WORK publishing channels: what lets MEL finish "write, illustrate and
// publish" missions on her own.
//   - image: Workers AI (FLUX schnell, free tier), stored in R2, served publicly
//     at /p/img/<id>.jpg so articles and posts can embed it;
//   - dev.to: MEL's own account, official REST API (api-key);
//   - Bluesky: MEL's own account, official AT Protocol API (app password).
// Account keys are entered once by the owner and kept in MEL's encrypted D1
// vault (same AES-GCM vault as her OAuth tokens), never in the repository.
// Every public text carries an AI/paid-mission disclosure.

import { createD1OAuthVaults } from '../connectors/d1-oauth-vault.js';

export const WORK_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const WORK_DISCLOSURE_FR = 'Contenu rédigé par MEL, une IA, dans le cadre d’une mission rémunérée.';
export const WORK_DISCLOSURE_EN = 'Written by MEL, an AI agent, as part of a paid task.';
const CHANNELS = Object.freeze({ devto: 'work.devto', bluesky: 'work.bluesky' });
const IMAGE_ID = /^[a-z0-9]{16}$/;

const ownerOf = env => String(env?.MELITURGOS_USER || 'owner');
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');

function vault(env, vaults) {
  return vaults || createD1OAuthVaults(env);
}

export async function saveChannelCredential(env, channel, input, { vaults } = {}) {
  if (!CHANNELS[channel]) throw Object.assign(new Error('WORK_CHANNEL_UNKNOWN'), { status: 400 });
  let token_set;
  if (channel === 'devto') {
    const key = String(input?.api_key || '').trim();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw Object.assign(new Error('DEVTO_API_KEY_INVALID'), { status: 400 });
    token_set = { access_token: key };
  } else {
    const handle = String(input?.handle || '').trim().replace(/^@/, '').toLowerCase();
    const password = String(input?.app_password || '').trim();
    if (!/^[a-z0-9.-]{3,253}$/.test(handle)) throw Object.assign(new Error('BLUESKY_HANDLE_INVALID'), { status: 400 });
    if (!/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(password)) throw Object.assign(new Error('BLUESKY_APP_PASSWORD_INVALID'), { status: 400 });
    token_set = { access_token: password, handle };
  }
  await vault(env, vaults).putToken({ owner: ownerOf(env), connector_id: CHANNELS[channel], token_set });
  return { channel, saved: true };
}

async function credential(env, channel, vaults) {
  try { return await vault(env, vaults).getToken({ owner: ownerOf(env), connector_id: CHANNELS[channel] }); }
  catch { return null; }
}

export async function channelStatus(env, { vaults } = {}) {
  const [devto, bluesky] = await Promise.all([credential(env, 'devto', vaults), credential(env, 'bluesky', vaults)]);
  return {
    mel_page: true,
    image: typeof env?.AI?.run === 'function' && Boolean(env?.MEDIA_BUCKET),
    devto: Boolean(devto?.access_token),
    bluesky: Boolean(bluesky?.access_token),
    bluesky_handle: bluesky?.handle || null,
  };
}

// ---- image -----------------------------------------------------------------

function base64ToBytes(b64) {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function generateWorkImage(env, { prompt, origin }) {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (text.length < 8) throw new Error('WORK_IMAGE_PROMPT_EMPTY');
  if (!env?.MEDIA_BUCKET?.put) throw new Error('WORK_IMAGE_STORAGE_UNAVAILABLE');
  const result = await env.AI.run(WORK_IMAGE_MODEL, { prompt: text, steps: 4 });
  const bytes = base64ToBytes(result?.image);
  if (bytes.length < 1024) throw new Error('WORK_IMAGE_EMPTY');
  const id = randomId();
  await env.MEDIA_BUCKET.put('work-images/' + id + '.jpg', bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  return { id, url: String(origin).replace(/\/+$/, '') + '/p/img/' + id + '.jpg', bytes };
}

export async function serveWorkImage(request, env) {
  const id = new URL(request.url).pathname.slice('/p/img/'.length).replace(/\.jpg$/, '');
  if (!IMAGE_ID.test(id) || !env?.MEDIA_BUCKET?.get) return new Response('Not found', { status: 404 });
  const object = await env.MEDIA_BUCKET.get('work-images/' + id + '.jpg');
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' } });
}

// ---- dev.to ----------------------------------------------------------------

export async function publishDevto(env, { title, markdown, tags = [], imageUrl = null, english = true }, { vaults, fetchImpl = fetch } = {}) {
  const cred = await credential(env, 'devto', vaults);
  if (!cred?.access_token) throw new Error('DEVTO_NOT_CONFIGURED');
  const disclosure = english ? WORK_DISCLOSURE_EN : WORK_DISCLOSURE_FR;
  const body = {
    article: {
      title: String(title || 'MEL').slice(0, 120),
      body_markdown: String(markdown || '').trim() + '\n\n---\n*' + disclosure + '*\n',
      published: true,
      tags: tags.map(t => String(t).toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean).slice(0, 4),
      ...(imageUrl ? { main_image: imageUrl } : {}),
    },
  };
  const response = await fetchImpl('https://dev.to/api/articles', { method: 'POST', headers: { 'api-key': cred.access_token, 'content-type': 'application/json', accept: 'application/vnd.forem.api-v1+json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.url) throw new Error('DEVTO_PUBLISH_FAILED_' + response.status);
  return { url: String(data.url) };
}

// ---- Bluesky ---------------------------------------------------------------

const PDS = 'https://bsky.social/xrpc/';

function utf8Index(text, index) {
  return new TextEncoder().encode(text.slice(0, index)).length;
}

export function blueskyPostText(summary, link, english = true) {
  const tag = english ? ' (AI-written, paid task)' : ' (rédigé par une IA, mission rémunérée)';
  const room = 300 - link.length - tag.length - 2;
  const chars = Array.from(String(summary || '').replace(/\s+/g, ' ').trim());
  const head = chars.length > room ? chars.slice(0, room - 1).join('') + '…' : chars.join('');
  return head + tag + '\n' + link;
}

export async function publishBluesky(env, { summary, link, imageBytes = null, imageAlt = '', english = true }, { vaults, fetchImpl = fetch } = {}) {
  const cred = await credential(env, 'bluesky', vaults);
  if (!cred?.access_token || !cred?.handle) throw new Error('BLUESKY_NOT_CONFIGURED');
  const sessionRes = await fetchImpl(PDS + 'com.atproto.server.createSession', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: cred.handle, password: cred.access_token }) });
  const session = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok || !session?.accessJwt || !session?.did) throw new Error('BLUESKY_LOGIN_FAILED_' + sessionRes.status);
  const auth = { authorization: 'Bearer ' + session.accessJwt };
  const text = blueskyPostText(summary, link, english);
  const start = text.lastIndexOf(link);
  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    facets: [{ index: { byteStart: utf8Index(text, start), byteEnd: utf8Index(text, start + link.length) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: link }] }],
  };
  if (imageBytes && imageBytes.length < 950_000) {
    const blobRes = await fetchImpl(PDS + 'com.atproto.repo.uploadBlob', { method: 'POST', headers: { ...auth, 'content-type': 'image/jpeg' }, body: imageBytes });
    const blob = await blobRes.json().catch(() => ({}));
    if (blobRes.ok && blob?.blob) record.embed = { $type: 'app.bsky.embed.images', images: [{ alt: String(imageAlt).slice(0, 300), image: blob.blob }] };
  }
  const postRes = await fetchImpl(PDS + 'com.atproto.repo.createRecord', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record }) });
  const post = await postRes.json().catch(() => ({}));
  const rkey = String(post?.uri || '').split('/').pop();
  if (!postRes.ok || !rkey) throw new Error('BLUESKY_POST_FAILED_' + postRes.status);
  return { url: 'https://bsky.app/profile/' + cred.handle + '/post/' + rkey };
}
