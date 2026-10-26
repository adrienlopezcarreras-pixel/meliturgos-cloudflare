const FORMATS = Object.freeze({
  txt: { mime: 'text/plain; charset=utf-8', ext: 'txt' },
  md: { mime: 'text/markdown; charset=utf-8', ext: 'md' },
  csv: { mime: 'text/csv; charset=utf-8', ext: 'csv' },
  json: { mime: 'application/json; charset=utf-8', ext: 'json' },
  html: { mime: 'text/html; charset=utf-8', ext: 'html' },
  pdf: { mime: 'application/pdf', ext: 'pdf' },
  gdoc: { google: 'application/vnd.google-apps.document', source: 'text/html; charset=utf-8' },
  gsheet: { google: 'application/vnd.google-apps.spreadsheet', source: 'text/csv; charset=utf-8' },
  svg: { mime: 'image/svg+xml', ext: 'svg' },
  gdoc: { google: 'application/vnd.google-apps.document', source: 'text/html; charset=utf-8' },
  gsheet: { google: 'application/vnd.google-apps.spreadsheet', source: 'text/csv; charset=utf-8' },
  gdrawing: { google: 'application/vnd.google-apps.drawing', source: 'image/svg+xml' },
  gslides: { api: 'slides' },
  gform: { api: 'form' },
});

const FORMAT_ALIASES = Object.freeze({
  doc: 'gdoc',
  document: 'gdoc',
  texte: 'gdoc',
  sheet: 'gsheet',
  classeur: 'gsheet',
  tableur: 'gsheet',
  vector: 'svg',
  vectoriel: 'svg',
  dessin: 'gdrawing',
  drawing: 'gdrawing',
  slide: 'gslides',
  slides: 'gslides',
  presentation: 'gslides',
  'présentation': 'gslides',
  diaporama: 'gslides',
  form: 'gform',
  formulaire: 'gform',
});

function clean(value) {
  return String(value ?? '').replace(/\u0000/g, '');
}

export function driveFormat(value, name = '') {
  const asked = clean(value).trim().toLowerCase();
  const alias = FORMAT_ALIASES[asked] || asked;
  if (FORMATS[alias]) return alias;
  const ext = clean(name).toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] || '';
  return FORMATS[ext] ? ext : 'txt';
}

function withExtension(name, ext) {
  const base = clean(name).trim().replace(/[\r\n]/g, '') || 'document';
  if (new RegExp('\\.' + ext + '$', 'i').test(base)) return base;
  return base.replace(/\.[a-z0-9]{1,8}$/i, '') + '.' + ext;
}

function pdfEscape(value) {
  let out = '';
  for (const char of clean(value)) {
    const code = char.charCodeAt(0);
    if (char === '\\' || char === '(' || char === ')') out += '\\' + char;
    else if (code >= 32 && code <= 126) out += char;
    else if (code >= 160 && code <= 255) out += '\\' + code.toString(8).padStart(3, '0');
    else out += '?';
  }
  return out;
}

export function buildTextPdf(content) {
  const lines = clean(content).replace(/\r\n?/g, '\n').split('\n');
  const pages = [];
  for (let index = 0; index < lines.length; index += 48) pages.push(lines.slice(index, index + 48));
  if (!pages.length) pages.push(['']);
  const fontId = 3 + pages.length * 2;
  const kids = [];
  const objects = {
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    [fontId]: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  };
  pages.forEach((page, index) => {
    const contentId = 3 + index * 2;
    const pageId = contentId + 1;
    kids.push(pageId);
    const commands = ['BT', '/F1 11 Tf', '48 800 Td', '14 TL'];
    for (const line of page) commands.push('(' + pdfEscape(line.slice(0, 110)) + ') Tj', 'T*');
    commands.push('ET');
    const stream = commands.join('\n');
    objects[contentId] = '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream';
    objects[pageId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ' + contentId + ' 0 R /Resources << /Font << /F1 ' + fontId + ' 0 R >> >> >>';
  });
  objects[2] = '<< /Type /Pages /Kids [' + kids.map(id => id + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
  let source = '%PDF-1.4\n';
  const offsets = [];
  const ids = Object.keys(objects).map(Number).sort((a, b) => a - b);
  for (const id of ids) {
    offsets[id] = source.length;
    source += id + ' 0 obj\n' + objects[id] + '\nendobj\n';
  }
  const size = Math.max(...ids) + 1;
  const startxref = source.length;
  let xref = 'xref\n0 ' + size + '\n0000000000 65535 f \n';
  for (let id = 1; id < size; id += 1) xref += String(offsets[id] || 0).padStart(10, '0') + ' 00000 n \n';
  return source + xref + 'trailer\n<< /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + startxref + '\n%%EOF\n';
}

function escapeXml(value) {
  return clean(value)
    .replace(/&/g, '\u0026amp;')
    .replace(/</g, '\u0026lt;')
    .replace(/>/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;');
}

function htmlDocument(title, content) {
  const paragraphs = clean(content).replace(/\r\n?/g, '\n').split(/\n{2,}/).map(block =>
    '<p>' + escapeXml(block).replace(/\n/g, '<br>') + '</p>'
  ).join('');
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapeXml(title) + '</title></head><body><h1>' + escapeXml(title) + '</h1>' + paragraphs + '</body></html>';
}

function sheetCsv(content) {
  const source = clean(content).replace(/\r\n?/g, '\n').trim();
  if (!source) return 'texte\n';
  if (/[,;\t]/.test(source)) return source + '\n';
  return 'texte\n' + source.split('\n').map(line => '"' + line.replace(/"/g, '""') + '"').join('\n') + '\n';
}

export function buildSvg(title, content) {
  const lines = clean(content).replace(/\r\n?/g, '\n').split('\n').slice(0, 24);
  const height = 120 + Math.max(1, lines.length) * 28;
  const rows = lines.map((line, index) =>
    '<text x="40" y="' + (88 + index * 28) + '" font-size="18" font-family="sans-serif">' + escapeXml(line.slice(0, 90)) + '</text>'
  ).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="800" height="' + height + '" viewBox="0 0 800 ' + height + '"><rect width="100%" height="100%" fill="#f8f4ea"/><text x="40" y="46" font-size="26" font-family="sans-serif">' + escapeXml(title.slice(0, 80)) + '</text>' + rows + '</svg>\n';
}

function googleMultipart({ name, targetMime, sourceMime, body, parentId }) {
  const boundary = 'mel_google_boundary';
  const meta = { name, mimeType: targetMime };
  if (parentId) meta.parents = [parentId];
  const payload = String(body).split(boundary).join('mel-bound-ary');
  return {
    google: true,
    contentType: 'multipart/related; boundary=' + boundary,
    url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink',
    body: '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + boundary + '\r\nContent-Type: ' + sourceMime + '\r\n\r\n' + payload + '\r\n--' + boundary + '--',
  };
}

function pagesOf(content) {
  const parts = clean(content).replace(/\r\n?/g, '\n').split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
  return (parts.length ? parts : ['']).slice(0, 8).map(part => part.slice(0, 3500));
}

function slideRequests(pageObjectId, content) {
  const requests = [];
  pagesOf(content).forEach((text, index) => {
    const pageId = index === 0 ? pageObjectId : 'mel_slide_' + index;
    if (!pageId) return;
    if (index > 0) requests.push({ createSlide: { objectId: pageId, slideLayoutReference: { predefinedLayout: 'BLANK' } } });
    const boxId = 'mel_box_' + index;
    requests.push({
      createShape: {
        objectId: boxId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: pageId,
          size: { height: { magnitude: 320, unit: 'PT' }, width: { magnitude: 640, unit: 'PT' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 36, translateY: 36, unit: 'PT' },
        },
      },
    });
    if (text) requests.push({ insertText: { objectId: boxId, insertionIndex: 0, text } });
  });
  return requests;
}

function formRequests(content) {
  return clean(content).replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(Boolean).slice(0, 8)
    .map((line, index) => ({
      createItem: {
        item: { title: line.slice(0, 180), questionItem: { question: { required: false, textQuestion: {} } } },
        location: { index },
      },
    }));
}

export function buildDriveUpload({ name, content, format, parentId = '' } = {}) {
  const kind = driveFormat(format, name);
  const spec = FORMATS[kind];
  const source = clean(content);
  const title = clean(name).trim().replace(/[\r\n]/g, '') || 'document';
  if (spec.api === 'slides') {
    return { format: kind, name: title, api: 'slides', create: { title }, batch(pageObjectId) { return { requests: slideRequests(String(pageObjectId || ''), source) }; } };
  }
  if (spec.api === 'form') {
    return { format: kind, name: title, api: 'form', create: { info: { title, documentTitle: title } }, batch() { return { requests: formRequests(source) }; } };
  }
  if (spec.google) {
    const media = kind === 'gsheet' ? sheetCsv(source) : kind === 'gdrawing' ? buildSvg(title, source) : htmlDocument(title, source);
    return { format: kind, name: title, ...googleMultipart({ name: title, targetMime: spec.google, sourceMime: spec.source, body: media, parentId }) };
  }
  const fileName = withExtension(name, spec.ext);
  const body = kind === 'pdf' ? buildTextPdf(source) : kind === 'svg' ? buildSvg(fileName.replace(/\.svg$/i, ''), source) : source;
  return { format: kind, name: fileName, mimeType: spec.mime, body };
}
