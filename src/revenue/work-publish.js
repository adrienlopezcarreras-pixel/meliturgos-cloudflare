// MEL WORK public publishing: many paid missions say "publish it and send the
// link". MEL hosts her own deliverables on her site at /p/<slug>:
//   - Markdown/text → a clean, escaped article page;
//   - a self-contained HTML deliverable (page, demo, mini-game) → served in a
//     CSP sandbox (opaque origin: its scripts cannot reach MEL's cookies or API).
// Pages are public, read-only and unlisted; the owner can delete them from D1.

const SLUG = /^[a-z0-9]{12}$/;
const MAX_CONTENT = 200_000;

async function ensureTable(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS mel_work_publications (slug TEXT PRIMARY KEY, task_id TEXT, title TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL)').run();
}

function newSlug() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), b => alphabet[b % alphabet.length]).join('');
}

// A deliverable that is (or contains) a complete HTML document is published as HTML.
export function extractHtmlDocument(text) {
  const source = String(text || '');
  const fenced = source.match(/```html\s*\n([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : source).trim();
  return /^(<!doctype html|<html[\s>])/i.test(candidate) ? candidate : null;
}

export async function publishWork(env, { taskId = null, title, content, origin }) {
  if (!env?.DB?.prepare) throw new Error('WORK_PUBLISH_DB_REQUIRED');
  const html = extractHtmlDocument(content);
  const body = String(html || content || '').slice(0, MAX_CONTENT);
  if (!body.trim()) throw new Error('WORK_PUBLISH_EMPTY');
  await ensureTable(env.DB);
  const slug = newSlug();
  await env.DB.prepare('INSERT INTO mel_work_publications (slug,task_id,title,kind,content,created_at) VALUES (?,?,?,?,?,?)')
    .bind(slug, taskId, String(title || 'MEL').slice(0, 160), html ? 'html' : 'markdown', body, Date.now()).run();
  return { slug, url: String(origin).replace(/\/+$/, '') + '/p/' + slug, kind: html ? 'html' : 'markdown' };
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Small, safe Markdown subset: headings, lists, code blocks, links, bold/italic.
export function renderMarkdown(md) {
  const out = [];
  let list = false;
  const inline = text => esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="nofollow noopener">$1</a>');
  const blocks = String(md || '').replace(/\r/g, '').split(/```/);
  blocks.forEach((block, i) => {
    if (i % 2 === 1) { out.push('<pre><code>' + esc(block.replace(/^[a-z0-9+-]*\n/i, '')) + '</code></pre>'); return; }
    for (const raw of block.split('\n')) {
      const line = raw.trimEnd();
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      const li = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
      if (!li && list) { out.push('</ul>'); list = false; }
      if (h) out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
      else if (li) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(li[1]) + '</li>'); }
      else if (line.trim()) out.push('<p>' + inline(line) + '</p>');
    }
    if (list) { out.push('</ul>'); list = false; }
  });
  return out.join('\n');
}

export async function servePublication(request, env) {
  const url = new URL(request.url);
  const slug = url.pathname.slice(3);
  if (!SLUG.test(slug) || !env?.DB?.prepare) return new Response('Not found', { status: 404 });
  await ensureTable(env.DB);
  const row = await env.DB.prepare('SELECT title, kind, content, created_at FROM mel_work_publications WHERE slug=?').bind(slug).first();
  if (!row) return new Response('Not found', { status: 404 });
  const common = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'public, max-age=300', 'x-robots-tag': 'noindex' };
  if (row.kind === 'html') {
    return new Response(row.content, { headers: { ...common, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "sandbox allow-scripts allow-forms allow-popups allow-modals; default-src 'self' 'unsafe-inline' data: blob: https:; frame-ancestors *" } });
  }
  const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(row.title)}</title><style>body{margin:0;background:#f8fafc;color:#0f172a;font:17px/1.65 system-ui,"Segoe UI",sans-serif}main{max-width:760px;margin:0 auto;padding:32px 18px 64px}h1,h2,h3{line-height:1.25}pre{background:#0f172a;color:#e2e8f0;padding:14px;border-radius:10px;overflow:auto}code{font-family:ui-monospace,Consolas,monospace}a{color:#2563eb}footer{margin-top:40px;color:#64748b;font-size:14px}</style></head><body><main><h1>${esc(row.title)}</h1>${renderMarkdown(row.content)}<footer>Publié par MEL · ${new Date(row.created_at).toISOString().slice(0, 10)}</footer></main></body></html>`;
  return new Response(page, { headers: { ...common, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:" } });
}
