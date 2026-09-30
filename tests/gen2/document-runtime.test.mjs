import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDocuments,
  createDocumentAdapters,
  createDocumentRuntime,
  detectDocumentType,
} from '../../src/media/documents.js';

const encoder = new TextEncoder();

test('GEN2-24 detects PDF by magic bytes even with generic MIME', () => {
  const bytes = encoder.encode('%PDF-1.7\nbody');
  assert.deepEqual(
    detectDocumentType({ bytes, name:'upload.bin', mime:'application/octet-stream' }),
    { kind:'pdf', mime:'application/pdf' },
  );
});

test('GEN2-24 detects DOCX from canonical extension/MIME without attempting ad-hoc ZIP parsing', () => {
  const bytes = new Uint8Array([0x50,0x4b,0x03,0x04,1,2,3]);
  assert.deepEqual(
    detectDocumentType({
      bytes,
      name:'report.docx',
      mime:'application/octet-stream',
    }),
    {
      kind:'docx',
      mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
  );
});

test('GEN2-24 built-in text extraction is deterministic and checksum-bound', async () => {
  const runtime = createDocumentRuntime();
  const input = {
    bytes: encoder.encode('Line one\r\nLine two\u0000'),
    name:'notes.txt',
    mime:'text/plain',
  };
  const first = await runtime.extract(input);
  const second = await runtime.extract(input);

  assert.equal(first.schema,'mel.document-runtime/v1');
  assert.equal(first.kind,'text');
  assert.equal(first.parser,'builtin-text');
  assert.equal(first.text,'Line one\nLine two');
  assert.match(first.document_sha256,/^[0-9a-f]{64}$/);
  assert.match(first.text_sha256,/^[0-9a-f]{64}$/);
  assert.equal(first.document_sha256,second.document_sha256);
  assert.equal(first.text_sha256,second.text_sha256);
});

test('GEN2-24 HTML extraction removes scripts/styles and keeps readable text', async () => {
  const runtime = createDocumentRuntime();
  const result = await runtime.extract({
    bytes: encoder.encode('<html><style>.x{display:none}</style><script>alert(1)</script><body><p>Hello &amp; welcome</p><div>Second line</div></body></html>'),
    name:'page.html',
    mime:'text/html',
  });

  assert.equal(result.kind,'html');
  assert.equal(result.parser,'builtin-html');
  assert.match(result.text,/Hello & welcome/);
  assert.match(result.text,/Second line/);
  assert.doesNotMatch(result.text,/alert\(1\)|display:none/);
});

test('GEN2-24 PDF extraction is delegated to explicit parser and normalizes pages', async () => {
  const calls=[];
  const runtime = createDocumentRuntime({
    pdfParser: async input => {
      calls.push(input);
      return {
        parser:'pdf-test-adapter',
        pages:[
          {page_number:1,text:'First page',metadata:{rotation:0}},
          'Second page',
        ],
        metadata:{
          title:'Example PDF',
          password:'must-not-leak',
          access_token:'must-not-leak',
          author:'Ada',
        },
        warnings:['font fallback'],
      };
    },
  });

  const bytes = encoder.encode('%PDF-1.7\nmock');
  const result = await runtime.extract({
    bytes,
    name:'example.pdf',
    mime:'application/pdf',
  },{signal:AbortSignal.timeout(5000)});

  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'example.pdf');
  assert.equal(calls[0].mime,'application/pdf');
  assert.equal(result.parser,'pdf-test-adapter');
  assert.equal(result.text,'First page\n\nSecond page');
  assert.equal(result.page_count,2);
  assert.deepEqual(result.pages.map(page=>page.page_number),[1,2]);
  assert.equal(result.metadata.title,'Example PDF');
  assert.equal(result.metadata.author,'Ada');
  assert.equal('password' in result.metadata,false);
  assert.equal('access_token' in result.metadata,false);
  assert.deepEqual(result.warnings,['font fallback']);
});

test('GEN2-24 PDF and DOCX fail closed when parser adapters are unavailable', async () => {
  const runtime = createDocumentRuntime();
  await assert.rejects(
    () => runtime.extract({
      bytes:encoder.encode('%PDF-1.4\nmock'),
      name:'x.pdf',
      mime:'application/pdf',
    }),
    {code:'DOCUMENT_PDF_PARSER_UNAVAILABLE',status:503},
  );
  await assert.rejects(
    () => runtime.extract({
      bytes:new Uint8Array([0x50,0x4b,0x03,0x04]),
      name:'x.docx',
      mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    {code:'DOCUMENT_DOCX_PARSER_UNAVAILABLE',status:503},
  );
});

test('GEN2-24 parser result with no text fails instead of manufacturing content', async () => {
  const runtime = createDocumentRuntime({
    pdfParser: async () => ({ pages:[], text:'' }),
  });
  await assert.rejects(
    () => runtime.extract({
      bytes:encoder.encode('%PDF-1.4\nmock'),
      name:'empty.pdf',
      mime:'application/pdf',
    }),
    {code:'DOCUMENT_NO_TEXT_EXTRACTED',status:422},
  );
});

test('GEN2-24 unsupported binary file fails closed', async () => {
  const runtime = createDocumentRuntime();
  await assert.rejects(
    () => runtime.extract({
      bytes:new Uint8Array([0,1,2,3,4,5]),
      name:'blob.bin',
      mime:'application/octet-stream',
    }),
    {code:'DOCUMENT_TYPE_UNSUPPORTED',status:415},
  );
});

test('GEN2-24 index produces stable bounded chunks linked to document checksum', async () => {
  const runtime = createDocumentRuntime();
  const textBody = [
    'A'.repeat(900),
    'First paragraph ends here.',
    'B'.repeat(900),
    'Second paragraph ends here.',
    'C'.repeat(900),
  ].join('\n\n');

  const extraction = await runtime.extract({
    bytes:encoder.encode(textBody),
    name:'long.txt',
    mime:'text/plain',
  });

  const first = await runtime.index({
    extraction,
    chunk_chars:1200,
    overlap_chars:120,
  });
  const second = await runtime.index({
    extraction,
    chunk_chars:1200,
    overlap_chars:120,
  });

  assert.equal(first.schema,'mel.document-index/v1');
  assert.ok(first.chunk_count>=2);
  assert.deepEqual(first,second);
  assert.ok(first.chunks.every(chunk=>chunk.document_sha256===extraction.document_sha256));
  assert.ok(first.chunks.every(chunk=>/^[0-9a-f]{64}$/.test(chunk.sha256)));
  assert.ok(first.chunks.every(chunk=>chunk.id.startsWith(extraction.document_sha256.slice(0,16))));
  assert.ok(first.chunks.every(chunk=>chunk.end_char>chunk.start_char));
});

test('GEN2-24 createDocuments preserves historical fail-closed port behavior', async () => {
  const port = createDocuments();
  await assert.rejects(
    () => port.extract({}),
    error => error?.code === 'NOT_IMPLEMENTED:media/documents.extract',
  );
});

test('GEN2-24 createDocumentAdapters exposes the bounded runtime behind stable port', async () => {
  const port = createDocuments(createDocumentAdapters());
  const extraction = await port.extract({
    bytes:encoder.encode('Portable document text'),
    name:'portable.md',
    mime:'text/markdown',
  });
  const index = await port.index({extraction,chunk_chars:1000});

  assert.equal(extraction.text,'Portable document text');
  assert.equal(index.chunk_count,1);
  assert.equal(index.chunks[0].text,'Portable document text');
});


test('GEN2-24 parser failures are normalized without leaking adapter exceptions', async () => {
  const runtime = createDocumentRuntime({
    pdfParser: async () => { throw new Error('sensitive adapter detail'); },
  });
  await assert.rejects(
    () => runtime.extract({
      bytes:encoder.encode('%PDF-1.4\nmock'),
      name:'broken.pdf',
      mime:'application/pdf',
    }),
    {code:'DOCUMENT_PARSER_FAILED',status:502},
  );
});

test('GEN2-24 parser execution is bounded by timeout and caller abort', async () => {
  const runtime = createDocumentRuntime({
    pdfParser: async () => new Promise(() => {}),
    parserTimeoutMs:100,
  });
  await assert.rejects(
    () => runtime.extract({
      bytes:encoder.encode('%PDF-1.4\nmock'),
      name:'slow.pdf',
      mime:'application/pdf',
    }),
    {code:'DOCUMENT_PARSER_TIMEOUT',status:504},
  );

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => runtime.extract({
      bytes:encoder.encode('%PDF-1.4\nmock'),
      name:'aborted.pdf',
      mime:'application/pdf',
    }, {signal:controller.signal}),
    {code:'DOCUMENT_PARSER_ABORTED',status:499},
  );
});

test('GEN2-24 excessive parser pages are bounded and explicitly reported', async () => {
  const pages = Array.from({length:5001}, (_, index) => ({page_number:index+1,text:'page '+(index+1)}));
  const runtime = createDocumentRuntime({
    pdfParser: async () => ({pages}),
  });
  const result = await runtime.extract({
    bytes:encoder.encode('%PDF-1.4\nmock'),
    name:'huge.pdf',
    mime:'application/pdf',
  });
  assert.equal(result.pages.length,5000);
  assert.equal(result.page_count,5000);
  assert.ok(result.warnings.includes('DOCUMENT_PAGES_TRUNCATED:5001->5000'));
});
