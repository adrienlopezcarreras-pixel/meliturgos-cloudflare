const FORMATS = Object.freeze({
  txt: { mime: 'text/plain; charset=utf-8', ext: 'txt' },
  md: { mime: 'text/markdown; charset=utf-8', ext: 'md' },
  csv: { mime: 'text/csv; charset=utf-8', ext: 'csv' },
  json: { mime: 'application/json; charset=utf-8', ext: 'json' },
  html: { mime: 'text/html; charset=utf-8', ext: 'html' },
  pdf: { mime: 'application/pdf', ext: 'pdf' },
});

function clean(value) {
  return String(value ?? '').replace(/\u0000/g, '');
}

export function driveFormat(value, name = '') {
  const asked = clean(value).trim().toLowerCase();
  if (FORMATS[asked]) return asked;
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

export function buildDriveUpload({ name, content, format } = {}) {
  const kind = driveFormat(format, name);
  const spec = FORMATS[kind];
  const fileName = withExtension(name, spec.ext);
  const source = clean(content);
  return {
    format: kind,
    name: fileName,
    mimeType: spec.mime,
    body: kind === 'pdf' ? buildTextPdf(source) : source,
  };
}
