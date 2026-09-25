import test from 'node:test';
import assert from 'node:assert/strict';

import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { registerDocumentCapabilities } from '../../src/capabilities/document-capabilities.js';
import {
  createDocumentProcessor,
  detectDocumentKind,
} from '../../src/media/document-processor.js';

const encoder = new TextEncoder();

test('built-in text/markdown/html/json extraction is UTF-8 strict, normalized and hashed', async () => {
  const processor = createDocumentProcessor();

  const markdown = await processor.extract({
    bytes: encoder.encode('# Titre\r\n\r\nTexte'),
    mime_type: 'text/markdown',
    filename: 'note.md',
  });
  assert.equal(markdown.kind, 'MARKDOWN');
  assert.equal(markdown.text, '# Titre\n\nTexte');
  assert.match(markdown.content_sha256, /^[a-f0-9]{64}$/);
  assert.match(markdown.text_sha256, /^[a-f0-9]{64}$/);

  const html = await processor.extract({
    bytes: encoder.encode('<html><style>.x{}</style><script>secret()</script><body><h1>Salut &amp; MEL</h1><p>Texte</p></body></html>'),
    mime_type: 'text/html',
    filename: 'page.html',
  });
  assert.equal(html.kind, 'HTML');
  assert.match(html.text, /Salut & MEL/);
  assert.match(html.text, /Texte/);
  assert.equal(html.text.includes('secret()'), false);

  const json = await processor.extract({
    bytes: encoder.encode('{"b":2,"a":1}'),
    mime_type: 'application/json',
    filename: 'data.json',
  });
  assert.equal(json.kind, 'JSON');
  assert.match(json.text, /"a": 1/);
});

test('binary signatures are enforced and unsupported binary parsing fails closed', async () => {
  const processor = createDocumentProcessor();
  const fakePdf = Uint8Array.from([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x37]);

  assert.equal(detectDocumentKind({ bytes: fakePdf, mime_type: 'application/pdf', filename: 'a.pdf' }), 'PDF');
  await assert.rejects(
    () => processor.extract({ bytes: fakePdf, mime_type: 'application/pdf', filename: 'a.pdf' }),
    { code: 'DOCUMENT_PDF_EXTRACTOR_REQUIRED', status: 503 },
  );

  await assert.rejects(
    () => processor.extract({
      bytes: encoder.encode('not a pdf'),
      mime_type: 'application/pdf',
      filename: 'a.pdf',
    }),
    { code: 'DOCUMENT_SIGNATURE_MISMATCH', status: 400 },
  );
});

test('PDF extractor results are revalidated for page and text limits before entering MEL', async () => {
  const fakePdf = Uint8Array.from([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x37]);
  const processor = createDocumentProcessor({
    extractors: {
      PDF: async () => ({
        pages: [
          { number: 1, text: 'Première page.' },
          { number: 2, text: 'Deuxième page.' },
        ],
        metadata: { title: 'Fixture' },
        warnings: ['embedded-font-fallback'],
      }),
    },
  });

  const result = await processor.extract({
    bytes: fakePdf,
    mime_type: 'application/pdf',
    filename: 'fixture.pdf',
    max_pages: 2,
  });
  assert.equal(result.page_count, 2);
  assert.equal(result.metadata.title, 'Fixture');
  assert.deepEqual(result.warnings, ['embedded-font-fallback']);

  await assert.rejects(
    () => processor.extract({
      bytes: fakePdf,
      mime_type: 'application/pdf',
      filename: 'fixture.pdf',
      max_pages: 1,
    }),
    { code: 'DOCUMENT_PAGE_LIMIT_EXCEEDED', status: 413 },
  );
});

test('document indexing produces deterministic bounded chunks from validated pages', async () => {
  const processor = createDocumentProcessor();
  const extraction = await processor.extract({
    bytes: encoder.encode('Paragraphe un.\n\nParagraphe deux un peu plus long.\n\nParagraphe trois.'),
    mime_type: 'text/plain',
    filename: 'a.txt',
  });

  const first = await processor.index({ extraction, chunk_chars: 32 });
  const second = await processor.index({ extraction, chunk_chars: 32 });
  assert.ok(first.chunk_count >= 2);
  assert.deepEqual(second, first);
  assert.ok(first.chunks.every(chunk => chunk.char_count <= 32));
  assert.ok(first.chunks.every(chunk => /^[a-f0-9]{64}$/.test(chunk.text_sha256)));
});

test('invalid UTF-8, oversized input and malformed JSON fail explicitly', async () => {
  const processor = createDocumentProcessor();
  await assert.rejects(
    () => processor.extract({
      bytes: Uint8Array.from([0xc3,0x28]),
      mime_type: 'text/plain',
      filename: 'bad.txt',
    }),
    { code: 'DOCUMENT_UTF8_INVALID', status: 422 },
  );
  await assert.rejects(
    () => processor.extract({
      bytes: encoder.encode('{bad'),
      mime_type: 'application/json',
      filename: 'bad.json',
    }),
    { code: 'DOCUMENT_JSON_INVALID', status: 422 },
  );
  await assert.rejects(
    () => processor.extract({
      bytes: encoder.encode('123456'),
      mime_type: 'text/plain',
      filename: 'large.txt',
      max_bytes: 5,
    }),
    { code: 'DOCUMENT_TOO_LARGE', status: 413 },
  );
});

test('CapabilityBus document runtime reads the canonical media asset and exposes status/extract/index', async () => {
  const bytes = encoder.encode('Document stocké en R2.\n\nDeuxième paragraphe.');
  const row = {
    id: 'doc-1',
    type: 'DOCUMENT',
    mime_type: 'text/plain',
    filename: 'doc.txt',
    size: bytes.length,
    r2_key: 'media/doc-1',
  };
  const db = {
    prepare() {
      return {
        bind() { return this; },
        async first() { return row; },
      };
    },
  };
  const bucket = {
    async get(key) {
      assert.equal(key, 'media/doc-1');
      return { async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } };
    },
  };
  const bus = new CapabilityBus();
  registerDocumentCapabilities(bus, { DB: db, MEDIA_BUCKET: bucket });

  const status = await bus.execute('documents.status', {}, { owner: 'owner', permissions: [], requestId: 'status' });
  assert.equal(status.persistent_media, true);
  assert.equal(status.binary_extractors.PDF, false);

  const extracted = await bus.execute('documents.extract', { id: 'doc-1' }, { owner: 'owner', permissions: [], requestId: 'extract' });
  assert.equal(extracted.kind, 'TEXT');
  assert.match(extracted.text, /Document stocké en R2/);

  const indexed = await bus.execute('documents.index', { id: 'doc-1', chunk_chars: 24 }, { owner: 'owner', permissions: [], requestId: 'index' });
  assert.ok(indexed.chunk_count >= 2);
});
