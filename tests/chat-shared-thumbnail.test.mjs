import test from 'node:test';
import assert from 'node:assert/strict';
import { melLocalPhotoPreview, LOCAL_PHOTO_PREVIEW_SOURCE } from '../src/pages/local-photo-preview.js';

test('shared preview accepts larger uploaded photos and generates a bounded local thumbnail', async () => {
  const prevBitmap = globalThis.createImageBitmap;
  const prevDocument = globalThis.document;
  const calls = [];
  let closed = false;
  globalThis.createImageBitmap = async () => ({width:4000,height:3000,close(){closed=true}});
  globalThis.document = {
    createElement(type) {
      assert.equal(type, 'canvas');
      return {
        width:0,height:0,
        getContext(kind) {
          assert.equal(kind, '2d');
          return {fillStyle:'',fillRect(...args){calls.push(['fill',...args])},drawImage(...args){calls.push(['image',...args])}};
        },
        toDataURL(type, quality) {
          assert.equal(type,'image/jpeg');
          assert.equal(quality,0.78);
          assert.equal(this.width,640);
          assert.equal(this.height,480);
          return 'data:image/jpeg;base64,small';
        },
      };
    },
  };
  try {
    const result = await melLocalPhotoPreview({type:'image/jpeg',size:6_000_000});
    assert.equal(result,'data:image/jpeg;base64,small');
    assert.equal(closed,true);
    assert.equal(calls.length,2);
  } finally {
    if (prevBitmap === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap=prevBitmap;
    if (prevDocument === undefined) delete globalThis.document;
    else globalThis.document=prevDocument;
  }
});

test('local preview refuses oversized, unsupported and empty inputs without reading data', async () => {
  assert.equal(await melLocalPhotoPreview({type:'image/svg+xml',size:500}),null);
  assert.equal(await melLocalPhotoPreview({type:'image/png',size:25_000_001}),null);
  assert.equal(await melLocalPhotoPreview({type:'image/png',size:0}),null);
  assert.match(LOCAL_PHOTO_PREVIEW_SOURCE,/async function melLocalPhotoPreview/);
  assert.doesNotMatch(LOCAL_PHOTO_PREVIEW_SOURCE,/fetch\(|createObjectURL/);
});
