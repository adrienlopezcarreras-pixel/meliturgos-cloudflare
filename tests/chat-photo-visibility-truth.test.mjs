import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inferPublicImageLookup } from '../src/api/native-chat.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { LOCAL_PHOTO_PREVIEW_SOURCE } from '../src/pages/local-photo-preview.js';

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

test('normal chat previews bounded private photos before and after send without external URLs', () => {
  assert.match(LOCAL_PHOTO_PREVIEW_SOURCE, /async function melLocalPhotoPreview\(file\)/);
  assert.match(LOCAL_PHOTO_PREVIEW_SOURCE, /createImageBitmap\(file\)/);
  assert.match(LOCAL_PHOTO_PREVIEW_SOURCE, /canvas\.toDataURL/);
  assert.match(NORMAL_RUNTIME_SOURCE, /showSentPhotos\(node,staged\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /analyse visuelle indisponible/);
  assert.match(NORMAL_RUNTIME_SOURCE, /item\.mediaUrl\|\|item\.localUrl/);
  assert.match(NORMAL_RUNTIME_SOURCE, /URL\.revokeObjectURL/);
  assert.doesNotMatch(LOCAL_PHOTO_PREVIEW_SOURCE, /URL\.createObjectURL/);
});

test('full chat keeps photo preview in sent messages and does not expose a stored object publicly', async () => {
  const full = await source('src/pages/full-interface-v2.js');
  assert.match(full, /LOCAL_PHOTO_PREVIEW_SOURCE/);
  assert.match(full, /showSentPhotos\(node,staged\)/);
  assert.match(full, /localUrl=await melLocalPhotoPreview\(file\)/);
  assert.match(full, /function appendLocalMedia\(host,item/);
  assert.match(full, /vision indisponible/);
  assert.doesNotMatch(full, /URL\.createObjectURL\(file\)/);
});
