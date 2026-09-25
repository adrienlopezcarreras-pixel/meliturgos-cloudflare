import { DomainError, requireValue } from '../core/contracts.js';

export const DOCUMENT_RUNTIME_SCHEMA = 'mel.document-runtime/v1';

const MAX_INPUT_BYTES = 25_000_000;
const MAX_OUTPUT_CHARS = 1_500_000;
const MAX_PAGES = 5000;
const DEFAULT_CHUNK_CHARS = 4000;
const DEFAULT_CHUNK_OVERLAP = 400;

function docError(code, status = 400) {
  return new DomainError(code, status);
}

function text(value) {
  return String(value ?? '');
}

function cleanText(value, max = MAX_OUTPUT_CHARS) {
  return text(value)
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, max);
}

function bytesFromInput(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw docError('DOCUMENT_BYTES_REQUIRED');
}

function safeName(value) {
  return text(value || 'document')
    .replace(/[\\/\0\r\n]+/g, '_')
    .slice(0, 240) || 'document';
}

function extension(name) {
  const match = safeName(name).toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return match?.[1] || '';
}

function startsWithAscii(bytes, prefix) {
  if (bytes.byteLength < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[i] !== prefix.charCodeAt(i)) return false;
  }
  return true;
}

export function detectDocumentType({
  bytes,
  name = '',
  mime = '',
} = {}) {
  const data = bytesFromInput(bytes);
  const ext = extension(name);
  const normalizedMime = text(mime).toLowerCase().split(';')[0].trim();

  if (startsWithAscii(data, '%PDF-') || normalizedMime === 'application/pdf' || ext === 'pdf') {
    return Object.freeze({ kind: 'pdf', mime: 'application/pdf' });
  }

  const zipMagic = data.length >= 4
    && data[0] === 0x50
    && data[1] === 0x4b
    && [0x03, 0x05, 0x07].includes(data[2])
    && [0x04, 0x06, 0x08].includes(data[3]);
  if (
    normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || ext === 'docx'
    || (zipMagic && ext === 'docx')
  ) {
    return Object.freeze({
      kind: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  if (normalizedMime === 'text/html' || ['html', 'htm'].includes(ext)) {
    return Object.freeze({ kind: 'html', mime: 'text/html' });
  }

  if (
    normalizedMime.startsWith('text/')
    || ['txt','md','markdown','json','csv','tsv','xml','yaml','yml','toml','ini','log','sql','js','mjs','cjs','ts','tsx','jsx','css','py','sh','ps1','java','c','h','cpp','hpp','rs','go','php','rb'].includes(ext)
  ) {
    return Object.freeze({ kind: 'text', mime: normalizedMime || 'text/plain' });
  }

  if (
    normalizedMime === 'application/json'
    || normalizedMime === 'application/xml'
    || normalizedMime === 'application/javascript'
  ) {
    return Object.freeze({ kind: 'text', mime: normalizedMime });
  }

  return Object.freeze({
    kind: 'binary',
    mime: normalizedMime || 'application/octet-stream',
  });
}

function stripHtml(input) {
  return cleanText(input)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizedPage(page, index) {
  if (typeof page === 'string') {
    return Object.freeze({
      page_number: index + 1,
      text: cleanText(page),
      metadata: {},
    });
  }
  requireValue(page && typeof page === 'object' && !Array.isArray(page), 'DOCUMENT_PAGE_INVALID', 502);
  const number = Number(page.page_number ?? page.page ?? index + 1);
  return Object.freeze({
    page_number: Number.isInteger(number) && number > 0 ? number : index + 1,
    text: cleanText(page.text ?? page.content ?? ''),
    metadata: page.metadata && typeof page.metadata === 'object' && !Array.isArray(page.metadata)
      ? structuredClone(page.metadata)
      : {},
  });
}

function normalizeParserResult(result, parserId) {
  requireValue(result && typeof result === 'object', 'DOCUMENT_PARSER_RESULT_INVALID', 502);
  const rawPages = Array.isArray(result.pages) ? result.pages.slice(0, MAX_PAGES) : [];
  const pages = rawPages.map(normalizedPage);
  let extracted = cleanText(result.text ?? result.content ?? '');
  if (!extracted && pages.length) {
    extracted = cleanText(pages.map(page => page.text).join('\n\n'));
  }
  requireValue(extracted.trim().length > 0, 'DOCUMENT_NO_TEXT_EXTRACTED', 422);

  return {
    text: extracted,
    pages,
    metadata: result.metadata && typeof result.metadata === 'object' && !Array.isArray(result.metadata)
      ? structuredClone(result.metadata)
      : {},
    warnings: Array.isArray(result.warnings)
      ? result.warnings.map(value => cleanText(value, 1000)).slice(0, 100)
      : [],
    parser: text(result.parser || parserId).slice(0, 120),
  };
}

async function sha256Bytes(bytes) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Text(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function safeMetadata(value = {}) {
  const output = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
  for (const [key, child] of Object.entries(value).slice(0, 100)) {
    if (/token|secret|password|authorization|cookie|credential|api[_-]?key/i.test(key)) continue;
    if (['string','number','boolean'].includes(typeof child) || child == null) {
      output[String(key).slice(0, 120)] = typeof child === 'string' ? child.slice(0, 2000) : child;
    }
  }
  return output;
}

function makeChunkId(documentSha256, index, textSha256) {
  return `${documentSha256.slice(0,16)}:${String(index + 1).padStart(5,'0')}:${textSha256.slice(0,16)}`;
}

export function chunkDocumentText(value, {
  documentSha256,
  chunkChars = DEFAULT_CHUNK_CHARS,
  overlapChars = DEFAULT_CHUNK_OVERLAP,
} = {}) {
  const body = cleanText(value);
  const size = Math.max(500, Math.min(20_000, Number(chunkChars) || DEFAULT_CHUNK_CHARS));
  const overlap = Math.max(0, Math.min(Math.floor(size / 2), Number(overlapChars) || 0));
  if (!body) return [];

  const chunks = [];
  let offset = 0;
  let index = 0;
  while (offset < body.length) {
    let end = Math.min(body.length, offset + size);
    if (end < body.length) {
      const windowStart = Math.max(offset + Math.floor(size * 0.55), end - 600);
      const paragraph = body.lastIndexOf('\n\n', end);
      const sentence = body.lastIndexOf('. ', end);
      const candidate = Math.max(paragraph, sentence >= 0 ? sentence + 1 : -1);
      if (candidate >= windowStart) end = candidate;
    }
    if (end <= offset) end = Math.min(body.length, offset + size);
    const chunkText = body.slice(offset, end).trim();
    if (chunkText) {
      chunks.push({
        index,
        start_char: offset,
        end_char: end,
        text: chunkText,
      });
      index += 1;
    }
    if (end >= body.length) break;
    offset = Math.max(offset + 1, end - overlap);
  }

  return chunks.map(chunk => Object.freeze({
    ...chunk,
    document_sha256: documentSha256 || null,
  }));
}

export class DocumentRuntime {
  constructor({
    pdfParser = null,
    docxParser = null,
    maxInputBytes = MAX_INPUT_BYTES,
  } = {}) {
    if (pdfParser != null && typeof pdfParser !== 'function') throw new Error('DOCUMENT_PDF_PARSER_INVALID');
    if (docxParser != null && typeof docxParser !== 'function') throw new Error('DOCUMENT_DOCX_PARSER_INVALID');
    this.pdfParser = pdfParser;
    this.docxParser = docxParser;
    this.maxInputBytes = Math.max(1_000_000, Math.min(MAX_INPUT_BYTES, Number(maxInputBytes) || MAX_INPUT_BYTES));
  }

  async extract(input = {}, context = {}) {
    const bytes = bytesFromInput(input.bytes);
    requireValue(bytes.byteLength > 0, 'DOCUMENT_EMPTY');
    requireValue(bytes.byteLength <= this.maxInputBytes, 'DOCUMENT_TOO_LARGE', 413);

    const name = safeName(input.name);
    const detected = detectDocumentType({
      bytes,
      name,
      mime: input.mime,
    });
    const documentSha256 = await sha256Bytes(bytes);
    let parsed;

    if (detected.kind === 'pdf') {
      requireValue(this.pdfParser, 'DOCUMENT_PDF_PARSER_UNAVAILABLE', 503);
      parsed = normalizeParserResult(
        await this.pdfParser({
          bytes,
          name,
          mime: detected.mime,
          signal: context.signal,
        }),
        'pdf-adapter',
      );
    } else if (detected.kind === 'docx') {
      requireValue(this.docxParser, 'DOCUMENT_DOCX_PARSER_UNAVAILABLE', 503);
      parsed = normalizeParserResult(
        await this.docxParser({
          bytes,
          name,
          mime: detected.mime,
          signal: context.signal,
        }),
        'docx-adapter',
      );
    } else if (detected.kind === 'html') {
      parsed = normalizeParserResult({
        text: stripHtml(new TextDecoder('utf-8', { fatal: false }).decode(bytes)),
        parser: 'builtin-html',
      }, 'builtin-html');
    } else if (detected.kind === 'text') {
      parsed = normalizeParserResult({
        text: new TextDecoder('utf-8', { fatal: false }).decode(bytes),
        parser: 'builtin-text',
      }, 'builtin-text');
    } else {
      throw docError('DOCUMENT_TYPE_UNSUPPORTED', 415);
    }

    const textSha256 = await sha256Text(parsed.text);
    return Object.freeze({
      schema: DOCUMENT_RUNTIME_SCHEMA,
      kind: detected.kind,
      mime: detected.mime,
      name,
      size_bytes: bytes.byteLength,
      document_sha256: documentSha256,
      text_sha256: textSha256,
      parser: parsed.parser,
      text: parsed.text,
      pages: Object.freeze(parsed.pages),
      page_count: parsed.pages.length || null,
      metadata: Object.freeze(safeMetadata(parsed.metadata)),
      warnings: Object.freeze(parsed.warnings),
      truncated: parsed.text.length >= MAX_OUTPUT_CHARS,
    });
  }

  async index(input = {}) {
    const extraction = input.extraction;
    requireValue(extraction && extraction.schema === DOCUMENT_RUNTIME_SCHEMA, 'DOCUMENT_EXTRACTION_REQUIRED');
    requireValue(typeof extraction.text === 'string' && extraction.text.length > 0, 'DOCUMENT_NO_TEXT_EXTRACTED', 422);
    requireValue(/^[0-9a-f]{64}$/.test(text(extraction.document_sha256)), 'DOCUMENT_SHA256_INVALID');

    const rawChunks = chunkDocumentText(extraction.text, {
      documentSha256: extraction.document_sha256,
      chunkChars: input.chunk_chars,
      overlapChars: input.overlap_chars,
    });
    const chunks = [];
    for (const chunk of rawChunks) {
      const chunkSha256 = await sha256Text(chunk.text);
      chunks.push(Object.freeze({
        id: makeChunkId(extraction.document_sha256, chunk.index, chunkSha256),
        index: chunk.index,
        start_char: chunk.start_char,
        end_char: chunk.end_char,
        text: chunk.text,
        sha256: chunkSha256,
        document_sha256: extraction.document_sha256,
        source: Object.freeze({
          name: extraction.name,
          mime: extraction.mime,
          kind: extraction.kind,
          page_count: extraction.page_count,
        }),
      }));
    }

    return Object.freeze({
      schema: 'mel.document-index/v1',
      document_sha256: extraction.document_sha256,
      text_sha256: extraction.text_sha256,
      chunk_count: chunks.length,
      chunks: Object.freeze(chunks),
    });
  }
}

export function createDocumentRuntime(options = {}) {
  return new DocumentRuntime(options);
}

export function createDocumentAdapters(options = {}) {
  const runtime = createDocumentRuntime(options);
  return Object.freeze({
    extract: (input, context) => runtime.extract(input, context),
    index: (input, context) => runtime.index(input, context),
  });
}
