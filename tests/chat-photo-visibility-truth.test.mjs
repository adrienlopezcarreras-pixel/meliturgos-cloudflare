import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inferPublicImageLookup } from '../src/api/native-chat.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { localPhotoPreview, MEL_CHAT_PHOTO_PREVIEW_SOURCE } from '../src/pages/chat-photo-preview.js';

const root = new URL('../', import.meta.url);
const source = path => readFile(new URL(path, root), 'utf8');

test('explicit public photo requests are researched, not guessed by the base chat model', () => {
  const item = inferPublicImageLookup('montre moi une photo du pape');
  assert.equal(item?.id, 'web.research');
  assert.match(item.input.query, /pape/);
  assert.equal(inferPublicImageLookup('analyse cette photo ci-jointe'), null);
  assert.equal(inferPublicImageLookup('pourquoi la photo ne s affiche pas ?'), null);
  assert.equal(inferPublicImageLookup('génère une image'), null);
  assert.equal(inferPublicImageLookup('bonjour'), null);
});

test('native chat does not turn an unexecuted tool JSON into an apparent answer or invent a delivered image', async () => {
  const native = await source('src/api/native-chat.js');
  assert.match(native, /inferPublicImageLookup\(activeTaskText\)/);
  assert.match(native, /La photo n.a pas été obtenue/);
  assert.match(native, /Aucun appel d.outil non exécuté ne sera présenté comme un résultat/);
  assert.match(native, /validatedPictureUrl\(toolResults\)/);
  assert.doesNotMatch(native, /Le JSON d.appel d.outil n.est pas une réponse/);
});

test('both chat surfaces use one camera-photo thumbnail implementation', async () => {
  assert.match(NORMAL_RUNTIME_SOURCE, /function localPhotoPreview\(file\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /showSentPhotos\(node,staged\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /analyse visuelle indisponible/);
  assert.match(NORMAL_RUNTIME_SOURCE, /canvas\.toDataURL\('image\/jpeg'/);
  const full = await source('src/pages/full-interface-v2.js');
  assert.match(full, /import \{ MEL_CHAT_PHOTO_PREVIEW_SOURCE \} from '.\/chat-photo-preview\.js'/);
  assert.match(full, /\$\{MEL_CHAT_PHOTO_PREVIEW_SOURCE\}/);
  assert.match(full, /showSentPhotos\(node,staged\)/);
  assert.match(full, /localUrl=await localPhotoPreview\(file\)/);
  assert.match(full, /vision indisponible/);
  assert.ok(MEL_CHAT_PHOTO_PREVIEW_SOURCE.includes('function localPhotoPreview(file)'));
});

test('camera thumbnails are local, bounded and revoke their temporary blob URLs', async () => {
  assert.equal(await localPhotoPreview(new Blob(['invalid'], { type:'text/plain' })), null);
  assert.equal(await localPhotoPreview({ type:'image/jpeg', size:25*1024*1024+1 }), null);
  assert.match(MEL_CHAT_PHOTO_PREVIEW_SOURCE, /URL\.createObjectURL\(file\)/);
  assert.match(MEL_CHAT_PHOTO_PREVIEW_SOURCE, /URL\.revokeObjectURL\(blobUrl\)/);
  assert.match(MEL_CHAT_PHOTO_PREVIEW_SOURCE, /1024 \/ Math\.max\(w, h\)/);
  assert.match(MEL_CHAT_PHOTO_PREVIEW_SOURCE, /1_600_000/);
  assert.doesNotMatch(MEL_CHAT_PHOTO_PREVIEW_SOURCE, /fetch\(|localStorage|upload\(/);
});
