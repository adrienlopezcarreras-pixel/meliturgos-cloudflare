import { fetchValidatedRedirectChain, validateUrl } from '../devices/web-capability.js';

const MAX_BYTES = 8 * 1024 * 1024;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const decoration = /logo|favicon|sprite|emblem|stemma|coat[_-]?of|herald|seal|banner/i;

export function isWebImageRequest(text) {
  const value = String(text || '');
  return value.length <= 500 && /\b(?:photo(?:graphie)?|portrait|image)s?\b/i.test(value)
    && /\b(?:donne|montre|affiche|cherche|trouve|voir)\b/i.test(value)
    && !/\b(?:mes|mon|ma|gmail|drive|onedrive|g[ée]n[èe]re|cr[ée]e|dessine|imagine|retouche|corrige|bug|code)\b/i.test(value);
}

function matchesImageMagic(bytes, type) {
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (type === 'image/png') return [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/gif') return ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
  if (type === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (type === 'image/avif') return ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 32));
  return false;
}

export async function fetchPublicWebImage(url, { fetchImpl = fetch, maxBytes = MAX_BYTES } = {}) {
  let fetched;
  try {
    fetched = await fetchValidatedRedirectChain(url, { fetchImpl, timeoutMs: 10_000,
      httpsOnly: true, accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' });
  } catch { fail('WEB_IMAGE_URL_OR_FETCH_FAILED'); }
  const { response, finalUrl } = fetched;
  const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const length = Number(response.headers.get('content-length') || 0);
  if (!response.ok || !['image/png','image/jpeg','image/gif','image/webp','image/avif'].includes(type)) {
    await response.body?.cancel(); fail('WEB_IMAGE_CONTENT_TYPE_INVALID');
  }
  if (length > maxBytes) { await response.body?.cancel(); fail('WEB_IMAGE_TOO_LARGE'); }
  const reader = response.body?.getReader();
  if (!reader) fail('WEB_IMAGE_BODY_REQUIRED');
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); fail('WEB_IMAGE_TOO_LARGE'); }
      parts.push(part.value);
    }
  } catch (error) {
    if (error?.code === 'WEB_IMAGE_TOO_LARGE') throw error;
    fail('WEB_IMAGE_BODY_READ_FAILED');
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  if (!matchesImageMagic(bytes, type)) fail('WEB_IMAGE_MAGIC_INVALID');
  return { bytes, content_type: type, url: finalUrl };
}

function imageCandidates(service, source, preferredSlug = '') {
  const candidates = [source.image_url];
  const html = String(source.content || '');
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src || decoration.test(tag)) continue;
    try {
      const url = new URL(src.replaceAll('&amp;', '&'), source.url).href;
      if (!preferredSlug || new URL(url).pathname.toLowerCase().includes(preferredSlug)) candidates.push(url);
    } catch {}
  }
  return [...new Set(candidates.filter(url => {
    const valid = validateUrl(url);
    return valid.valid && valid.url.protocol === 'https:' && !decoration.test(valid.url.pathname)
      && !/\.svg(?:$|\?)/i.test(url);
  }))].slice(0, 5);
}

export async function researchWebImage(service, query) {
  const fetchImpl = typeof service.env?.MEL_WEB_FETCH === 'function' ? service.env.MEL_WEB_FETCH : fetch;
  let sources;
  let preferredSlug = '';
  // Resolve the incumbent from a fresh official index; never freeze a pope's identity.
  if (/\b(?:pape|pope)\b/i.test(query) && !/\b(?:fran[çc]ois|francis|jean|john|beno[iî]t|benedict)\b/i.test(query)) {
    const index = await service.fetchPage('https://www.vatican.va/content/vatican/fr/holy-father.html');
    const path = String(index.content || '').match(/href=["']((?:https:\/\/www\.vatican\.va)?\/content\/(?!vatican\/)[a-z0-9-]+\/fr\.html)["']/i)?.[1];
    if (!path) fail('WEB_IMAGE_CURRENT_POPE_SOURCE_MISSING');
    const url = new URL(path, 'https://www.vatican.va').href;
    preferredSlug = new URL(url).pathname.split('/')[2];
    const page = await service.fetchPage(url);
    sources = [service.pageSource(page, url, 'OFFICIAL_SEED')].filter(Boolean);
  } else {
    sources = (await service.research(query, null, 2)).sources || [];
  }
  for (const source of sources.slice(0, 3)) {
    for (const candidate of imageCandidates(service, source, preferredSlug)) {
      try {
        const image = await fetchPublicWebImage(candidate, { fetchImpl });
        return { ok: true, image_url: image.url.replaceAll('(', '%28').replaceAll(')', '%29'),
          image_validated: true, content_type: image.content_type, byte_length: image.bytes.length,
          source_url: source.url, title: String(source.title || 'Photographie').slice(0, 200) };
      } catch { /* Try the next genuine binary image, never return a page as an image. */ }
    }
  }
  fail('WEB_IMAGE_NOT_FOUND');
}
