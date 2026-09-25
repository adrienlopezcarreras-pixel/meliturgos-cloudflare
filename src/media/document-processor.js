import { DomainError, requireValue } from '../core/contracts.js';

export const DOCUMENT_KINDS = Object.freeze([
  'TEXT',
  'MARKDOWN',
  'CSV',
  'JSON',
  'HTML',
  'PDF',
  'DOCX',
  'DOC',
]);

const ABSOLUTE_MAX_BYTES = 10_000_000;
const DEFAULT_MAX_BYTES = 8_000_000;
const ABSOLUTE_MAX_TEXT_CHARS = 2_000_000;
const DEFAULT_MAX_TEXT_CHARS = 1_000_000;
const ABSOLUTE_MAX_PAGES = 1000;
const DEFAULT_MAX_PAGES = 300;
const DEFAULT_CHUNK_CHARS = 4000;
const MAX_CHUNKS = 5000;

const MIME_KIND = new Map([
  ['text/plain', 'TEXT'],
  ['text/markdown', 'MARKDOWN'],
  ['text/csv', 'CSV'],
  ['application/json', 'JSON'],
  ['text/json', 'JSON'],
  ['text/html', 'HTML'],
  ['application/xhtml+xml', 'HTML'],
  ['application/pdf', 'PDF'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'DOCX'],
  ['application/msword', 'DOC'],
]);

const EXT_KIND = new Map([
  ['txt', 'TEXT'],
  ['md', 'MARKDOWN'],
  ['markdown', 'MARKDOWN'],
  ['csv', 'CSV'],
  ['json', 'JSON'],
  ['html', 'HTML'],
  ['htm', 'HTML'],
  ['pdf', 'PDF'],
  ['docx', 'DOCX'],
  ['doc', 'DOC'],
]);

const BINARY_KINDS = new Set(['PDF', 'DOCX', 'DOC']);

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clone = value => value == null ? value : structuredClone(value);

function boundedInt(value, fallback, max, code) {
  const parsed = value == null ? fallback : Number(value);
  requireValue(Number.isInteger(parsed) && parsed > 0 && parsed <= max, code, 400);
  return parsed;
}

function fileExtension(filename) {
  const name = String(filename || '').trim().toLowerCase();
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1) : '';
}

function signatureKind(bytes) {
  if (bytes.length >= 5
      && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return 'PDF';
  }
  if (bytes.length >= 4
      && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return 'DOCX';
  }
  if (bytes.length >= 8
      && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
      && bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1) {
    return 'DOC';
  }
  return null;
}

export function detectDocumentKind({ bytes, mime_type = '', filename = '' } = {}) {
  requireValue(bytes instanceof Uint8Array && bytes.length > 0, 'DOCUMENT_BYTES_REQUIRED', 400);
  const mime = String(mime_type || '').split(';')[0].trim().toLowerCase();
  const byMime = MIME_KIND.get(mime) || null;
  const byExt = EXT_KIND.get(fileExtension(filename)) || null;
  const bySignature = signatureKind(bytes);

  const declared = byMime || byExt;
  if (bySignature && declared && bySignature !== declared) {
    throw new DomainError('DOCUMENT_SIGNATURE_MISMATCH', 400);
  }
  if (declared && BINARY_KINDS.has(declared) && bySignature !== declared) {
    throw new DomainError('DOCUMENT_SIGNATURE_MISMATCH', 400);
  }
  if (!declared && bySignature) return bySignature;
  requireValue(declared, 'DOCUMENT_TYPE_UNSUPPORTED', 415);
  return declared;
}

function jsonSafe(value, depth = 0) {
  if (depth > 5) return '[TRUNCATED]';
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 50).map(item => jsonSafe(item, depth + 1));
  if (isRecord(value)) {
    const out = {};
    for (const [key, child] of Object.entries(value).slice(0, 60)) {
      out[String(key).slice(0, 120)] = jsonSafe(child, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 2000);
}

function normalizeWarnings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === 'string' && item.trim())
    .map(item => item.trim().slice(0, 300))
    .slice(0, 50);
}

function decodeEntities(value) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, token) => {
    const lower = token.toLowerCase();
    if (lower.startsWith('#x')) {
      const cp = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    }
    if (lower.startsWith('#')) {
      const cp = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    }
    return Object.hasOwn(named, lower) ? named[lower] : match;
  });
}

function normalizePlainText(value, maxChars) {
  requireValue(typeof value === 'string', 'DOCUMENT_TEXT_INVALID', 500);
  const normalized = value
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '');
  requireValue(normalized.trim().length > 0, 'DOCUMENT_TEXT_EMPTY', 422);
  requireValue(normalized.length <= maxChars, 'DOCUMENT_TEXT_TOO_LARGE', 413);
  return normalized.trim();
}

function extractHtmlText(html, maxChars) {
  const withoutActive = html
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template)\b[^>]*>[^]*?<\/\1>/gi, ' ');
  const withBreaks = withoutActive
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|table)>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
  return normalizePlainText(
    decodeEntities(stripped)
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n'),
    maxChars,
  );
}

function decodeUtf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new DomainError('DOCUMENT_UTF8_INVALID', 422);
  }
}

async function sha256Hex(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function extractorFor(extractors, kind) {
  const value = extractors?.[kind] ?? extractors?.[kind.toLowerCase()];
  if (typeof value === 'function') return value;
  if (value && typeof value.extract === 'function') return value.extract.bind(value);
  return null;
}

function normalizeAdapterPages(result, maxPages, maxChars) {
  const pages = Array.isArray(result?.pages)
    ? result.pages.map((page, index) => {
        const number = Number.isInteger(page?.number) && page.number > 0 ? page.number : index + 1;
        const text = normalizePlainText(String(page?.text ?? ''), maxChars);
        return { number, text };
      })
    : [];

  if (pages.length) {
    requireValue(pages.length <= maxPages, 'DOCUMENT_PAGE_LIMIT_EXCEEDED', 413);
    const text = normalizePlainText(pages.map(page => page.text).join('\n\n'), maxChars);
    return { pages, text, page_count: pages.length };
  }

  const text = normalizePlainText(String(result?.text ?? ''), maxChars);
  const pageCount = Number.isInteger(result?.page_count) && result.page_count > 0 ? result.page_count : 1;
  requireValue(pageCount <= maxPages, 'DOCUMENT_PAGE_LIMIT_EXCEEDED', 413);
  return {
    pages: [{ number: 1, text }],
    text,
    page_count: pageCount,
  };
}

function segmentText(text, maxChars) {
  const paragraphs = text.split(/\n{2,}/).map(value => value.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  const flush = () => {
    if (!current) return;
    chunks.push(current);
    current = '';
  };

  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    if (paragraph.length > maxChars) {
      flush();
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        chunks.push(paragraph.slice(offset, offset + maxChars));
      }
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars) flush();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  flush();
  return chunks;
}

export function createDocumentProcessor({ extractors = {} } = {}) {
  async function extract(input = {}) {
    const maxBytes = boundedInt(input.max_bytes, DEFAULT_MAX_BYTES, ABSOLUTE_MAX_BYTES, 'DOCUMENT_MAX_BYTES_INVALID');
    const maxChars = boundedInt(input.max_chars, DEFAULT_MAX_TEXT_CHARS, ABSOLUTE_MAX_TEXT_CHARS, 'DOCUMENT_MAX_CHARS_INVALID');
    const maxPages = boundedInt(input.max_pages, DEFAULT_MAX_PAGES, ABSOLUTE_MAX_PAGES, 'DOCUMENT_MAX_PAGES_INVALID');
    const bytes = input.bytes instanceof Uint8Array
      ? input.bytes
      : typeof input.text === 'string'
        ? new TextEncoder().encode(input.text)
        : null;
    requireValue(bytes instanceof Uint8Array && bytes.length > 0, 'DOCUMENT_BYTES_REQUIRED', 400);
    requireValue(bytes.length <= maxBytes, 'DOCUMENT_TOO_LARGE', 413);

    const filename = String(input.filename || 'document').slice(0, 255);
    const mimeType = String(input.mime_type || 'application/octet-stream').slice(0, 200);
    const kind = detectDocumentKind({ bytes, mime_type: mimeType, filename });
    const contentSha256 = await sha256Hex(bytes);
    let text;
    let pages;
    let pageCount;
    let metadata = {};
    let warnings = [];

    if (BINARY_KINDS.has(kind)) {
      const extractor = extractorFor(extractors, kind);
      requireValue(extractor, `DOCUMENT_${kind}_EXTRACTOR_REQUIRED`, 503);
      const result = await extractor({
        bytes: new Uint8Array(bytes),
        filename,
        mime_type: mimeType,
        max_pages: maxPages,
        max_chars: maxChars,
      });
      requireValue(isRecord(result), 'DOCUMENT_EXTRACTOR_RESULT_INVALID', 502);
      const normalized = normalizeAdapterPages(result, maxPages, maxChars);
      text = normalized.text;
      pages = normalized.pages;
      pageCount = normalized.page_count;
      metadata = jsonSafe(isRecord(result.metadata) ? result.metadata : {});
      warnings = normalizeWarnings(result.warnings);
    } else {
      const decoded = decodeUtf8(bytes);
      if (kind === 'HTML') {
        text = extractHtmlText(decoded, maxChars);
      } else if (kind === 'JSON') {
        let parsed;
        try { parsed = JSON.parse(decoded); } catch { throw new DomainError('DOCUMENT_JSON_INVALID', 422); }
        text = normalizePlainText(JSON.stringify(parsed, null, 2), maxChars);
      } else {
        text = normalizePlainText(decoded, maxChars);
      }
      pages = [{ number: 1, text }];
      pageCount = 1;
    }

    const textSha256 = await sha256Hex(text);
    return Object.freeze({
      kind,
      filename,
      mime_type: mimeType,
      size: bytes.length,
      content_sha256: contentSha256,
      text_sha256: textSha256,
      page_count: pageCount,
      char_count: text.length,
      text,
      pages: Object.freeze(pages.map(page => Object.freeze({ ...page }))),
      metadata: Object.freeze(metadata),
      warnings: Object.freeze(warnings),
    });
  }

  async function index(input = {}) {
    const extraction = input.extraction || await extract(input);
    requireValue(isRecord(extraction) && typeof extraction.text === 'string', 'DOCUMENT_EXTRACTION_REQUIRED', 400);
    const chunkChars = boundedInt(input.chunk_chars, DEFAULT_CHUNK_CHARS, 12000, 'DOCUMENT_CHUNK_SIZE_INVALID');
    const pageRows = Array.isArray(extraction.pages) && extraction.pages.length
      ? extraction.pages
      : [{ number: 1, text: extraction.text }];
    const chunks = [];
    let sequence = 0;

    for (const page of pageRows) {
      for (const chunkText of segmentText(String(page.text || ''), chunkChars)) {
        requireValue(chunks.length < MAX_CHUNKS, 'DOCUMENT_TOO_MANY_CHUNKS', 413);
        const textSha256 = await sha256Hex(chunkText);
        chunks.push(Object.freeze({
          id: `${extraction.text_sha256 || await sha256Hex(extraction.text)}:${sequence}`,
          sequence,
          page: Number(page.number || 1),
          char_count: chunkText.length,
          text_sha256: textSha256,
          text: chunkText,
        }));
        sequence += 1;
      }
    }

    return Object.freeze({
      document_text_sha256: extraction.text_sha256 || await sha256Hex(extraction.text),
      chunk_count: chunks.length,
      chunks: Object.freeze(chunks),
    });
  }

  return Object.freeze({ extract, index });
}

export const DOCUMENT_LIMITS = Object.freeze({
  absolute_max_bytes: ABSOLUTE_MAX_BYTES,
  default_max_bytes: DEFAULT_MAX_BYTES,
  absolute_max_text_chars: ABSOLUTE_MAX_TEXT_CHARS,
  default_max_text_chars: DEFAULT_MAX_TEXT_CHARS,
  absolute_max_pages: ABSOLUTE_MAX_PAGES,
  default_max_pages: DEFAULT_MAX_PAGES,
  default_chunk_chars: DEFAULT_CHUNK_CHARS,
  max_chunks: MAX_CHUNKS,
});
