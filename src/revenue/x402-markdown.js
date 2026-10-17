// Paid service #1: public web page -> clean Markdown, for AI agents.
// Costs MEL no AI quota (pure parsing), so it is not limited by daily neurons.
//   GET /x402/markdown?url=https://example.com/article     price: X402_MARKDOWN_PRICE (default 2000 = 0.002 USDC)

import { handlePaidRequest } from './x402.js';

const MAX_HTML_BYTES = 2_000_000;
const MAX_MARKDOWN_CHARS = 200_000;

export function safePublicUrl(raw, ownHost = '') {
  let url;
  try { url = new URL(String(raw || '')); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  if (url.port && !['80', '443'].includes(url.port)) return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') || host === ownHost) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(host)) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
  }
  if (host.includes(':')) return null; // IPv6 literals: refuse rather than classify
  return url;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' };
export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function htmlToMarkdown(html, baseUrl = '') {
  let source = String(html || '');
  const title = decodeEntities((source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim());
  source = source.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|form|button|select|nav|footer|aside)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<header\b[\s\S]*?<\/header>/gi, match => /<h1\b/i.test(match) ? match : '');
  const main = source.match(/<article\b[\s\S]*<\/article>/i)?.[0] || source.match(/<main\b[\s\S]*<\/main>/i)?.[0] || source.match(/<body\b[\s\S]*<\/body>/i)?.[0] || source;
  const absolute = href => { try { return new URL(decodeEntities(href), baseUrl || undefined).href; } catch { return decodeEntities(href); } };
  let md = main
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => '\n\n```\n' + code.replace(/<[^>]+>/g, '').trim() + '\n```\n\n')
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, text) => '\n\n' + '#'.repeat(Number(level)) + ' ' + text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() + '\n\n')
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
      const label = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      return label ? (/^(#|javascript:)/i.test(href) ? label : '[' + label + '](' + absolute(href) + ')') : '';
    })
    .replace(/<img\b[^>]*alt\s*=\s*["']([^"']*)["'][^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi, (_, alt, src) => alt.trim() ? '![' + alt.trim() + '](' + absolute(src) + ')' : '')
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, text) => '\n\n' + text.replace(/<[^>]+>/g, '').trim().split('\n').map(line => '> ' + line.trim()).join('\n') + '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|ul|ol|table|tr|h[1-6])>/gi, '\n\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, '');
  md = decodeEntities(md)
    .split('\n').map(line => line.replace(/[ \t ]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
  return { title, markdown: md.slice(0, MAX_MARKDOWN_CHARS) };
}

async function readLimited(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_HTML_BYTES) { try { await reader.cancel(); } catch {} break; }
    chunks.push(value);
  }
  const all = new Uint8Array(Math.min(size, MAX_HTML_BYTES));
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk.subarray(0, all.length - offset), offset); offset += chunk.byteLength; if (offset >= all.length) break; }
  return new TextDecoder().decode(all);
}

export async function convertPage(target, fetchImpl = fetch) {
  const response = await fetchImpl(target.href, { redirect: 'manual', headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'MEL-markdown/1.0 (+x402)' }, signal: AbortSignal.timeout(10_000) });
  if (response.status >= 300 && response.status < 400) return { ok: false, status: 422, code: 'REDIRECT_NOT_FOLLOWED', location: response.headers.get('location') || null };
  if (!response.ok) return { ok: false, status: 422, code: 'UPSTREAM_HTTP_' + response.status };
  const type = response.headers.get('content-type') || '';
  if (!/html|xml|text\/plain/i.test(type)) return { ok: false, status: 415, code: 'NOT_HTML' };
  const html = await readLimited(response);
  if (/text\/plain/i.test(type)) return { ok: true, title: '', markdown: html.slice(0, MAX_MARKDOWN_CHARS) };
  return { ok: true, ...htmlToMarkdown(html, target.href) };
}

export async function handleX402Markdown(request, env, { fetchImpl = fetch } = {}) {
  const url = new URL(request.url);
  if (url.pathname !== '/x402/markdown') return null;
  if (request.method !== 'GET') return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  const target = safePublicUrl(url.searchParams.get('url'), url.hostname);
  // Validate before asking for money: an agent never pays for a request we would refuse.
  if (!target) return Response.json({ ok: false, code: 'URL_INVALID_OR_PRIVATE', usage: '/x402/markdown?url=https://example.com/page' }, { status: 400 });
  const price = Number(env.X402_MARKDOWN_PRICE);
  return handlePaidRequest({
    request, env, fetchImpl,
    product: 'markdown',
    amount: Number.isSafeInteger(price) && price > 0 ? price : 2000,
    description: 'Convert a public web page into clean Markdown (title + main content, absolute links).',
    work: async () => {
      try {
        const result = await convertPage(target, fetchImpl);
        if (!result.ok) return Response.json(result, { status: result.status });
        if (!result.markdown.trim()) return Response.json({ ok: false, code: 'EMPTY_PAGE' }, { status: 422 });
        return Response.json({ ok: true, url: target.href, title: result.title, markdown: result.markdown, chars: result.markdown.length }, { headers: { 'cache-control': 'no-store' } });
      } catch (error) {
        return Response.json({ ok: false, code: error?.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE' }, { status: 504 });
      }
    },
  });
}
