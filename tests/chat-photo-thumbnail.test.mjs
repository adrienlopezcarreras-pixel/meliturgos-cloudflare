import test from 'node:test';
import assert from 'node:assert/strict';
import { localPhotoPreview } from '../src/pages/chat-photo-preview.js';

test('8 MB private camera photo creates 1024px thumbnail and revokes its temporary URL', async () => {
  const originals = {
    Image: globalThis.Image,
    document: globalThis.document,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  };
  const revoked = [], draws = [];
  let canvas;
  try {
    URL.createObjectURL = () => 'blob:owner-private-preview';
    URL.revokeObjectURL = value => { revoked.push(value); };
    class MockImage {
      naturalWidth = 4000;
      naturalHeight = 3000;
      set src(value) {
        assert.equal(value, 'blob:owner-private-preview');
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = MockImage;
    canvas = {
      width: 0,
      height: 0,
      getContext(name) {
        assert.equal(name, '2d');
        return {
          set fillStyle(value) { assert.equal(value, '#fff'); },
          fillRect() {},
          drawImage(_image, x, y, w, h) { draws.push([x,y,w,h]); },
        };
      },
      toDataURL(type, quality) {
        assert.equal(type, 'image/jpeg');
        assert.ok(quality > 0 && quality <= 1);
        return 'data:image/jpeg;base64,' + 'a'.repeat(200);
      },
    };
    globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return canvas; } };
    const image = await localPhotoPreview({ type:'image/jpeg', size:8_000_000 });
    assert.match(image, /^data:image\/jpeg;base64,/);
    assert.equal(canvas.width, 1024);
    assert.equal(canvas.height, 768);
    assert.deepEqual(draws, [[0,0,1024,768]]);
    assert.deepEqual(revoked, ['blob:owner-private-preview']);
  } finally {
    globalThis.Image = originals.Image;
    globalThis.document = originals.document;
    URL.createObjectURL = originals.createObjectURL;
    URL.revokeObjectURL = originals.revokeObjectURL;
  }
});

test('invalid MIME and images over upload limit are not decoded or exposed', async () => {
  assert.equal(await localPhotoPreview({ type:'image/svg+xml',size:1200 }),null);
  assert.equal(await localPhotoPreview({ type:'image/jpeg',size:26*1024*1024 }),null);
});
