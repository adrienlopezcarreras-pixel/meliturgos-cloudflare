import app from './learning-entry.js';
import { requireAuth } from './core/security.js';
import { migrate } from './persistence/migrations.js';
import { createConversationService } from './conversations/conversation-service.js';
import { buildActivitySnapshot } from './activity/activity-snapshot.js';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function safeRows(db, sql, limit) {
  try {
    const result = await db.prepare(sql).bind(limit).all();
    return result?.results || [];
  } catch {
    return [];
  }
}

function deployedBuild() {
  const sha = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined' ? String(MEL_DEPLOYED_GIT_SHA) : null;
  const branch = typeof MEL_DEPLOYED_GIT_BRANCH !== 'undefined' ? String(MEL_DEPLOYED_GIT_BRANCH) : null;
  if (!sha && !branch) return null;
  return {
    sha,
    branch,
    worker: 'meliturgos',
    source: 'wrangler-build-define',
    explanation: 'Version réellement injectée au build Cloudflare ; aucune progression ou date n’est inventée.',
  };
}

async function activityResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    await migrate(env.DB);
    const [jobs, audits, lessons, backups] = await Promise.all([
      safeRows(env.DB, 'SELECT * FROM dev_jobs ORDER BY updated_at DESC LIMIT ?', 50),
      safeRows(env.DB, 'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?', 80),
      safeRows(env.DB, 'SELECT * FROM mentor_lessons ORDER BY created_at DESC LIMIT ?', 30),
      safeRows(env.DB, 'SELECT * FROM backup_objects ORDER BY created_at DESC LIMIT ?', 30),
    ]);
    return json({ ok: true, ...buildActivitySnapshot({ jobs, audits, lessons, backups, deployment: deployedBuild(), limit: 100 }) });
  } catch (error) {
    return json({ ok: false, error: 'ACTIVITY_UNAVAILABLE', detail: String(error?.message || 'unknown').slice(0, 180) }, 503);
  }
}

async function latestConversationResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    const service = createConversationService(env);
    const rows = await service.list({ owner: env.MELITURGOS_USER || '' });
    const active = rows.filter((row) => String(row?.status || 'active').toLowerCase() !== 'archived');
    const latest = active[0] || rows[0] || null;
    if (!latest?.id) return json({ ok: true, conversation: null, messages: [], source: 'global-archive' });
    const messages = await service.getMessages(latest.id, { limit: 1000 });
    return json({
      ok: true,
      conversation: {
        id: latest.id,
        title: latest.title,
        status: latest.status,
        created_at: latest.created_at,
        updated_at: latest.updated_at,
      },
      messages: messages.slice(-80),
      source: 'global-archive',
    });
  } catch (error) {
    return json({ ok: false, error: 'LATEST_CONVERSATION_UNAVAILABLE', detail: String(error?.message || 'unknown').slice(0, 180) }, 503);
  }
}

// Final owner-facing cleanup layer. Keep this deliberately small: the real UI
// lives below in the canonical page/enhancer modules. This wrapper only applies
// owner-approved presentation reconciliation after every lower layer has run.
const NORMAL_PAGE_STYLE = `<style id="mel-owner-approved-backgrounds">
html[data-theme="crusade"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-crusade.webp')!important}
html[data-theme="religious"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-religious.webp')!important}
html[data-theme="granada"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-granada.webp')!important}
html[data-theme="aviation"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-aviation.webp')!important}
html[data-theme="paladin"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-paladin.webp')!important}
html[data-theme="amazon"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-amazon.webp')!important}
</style>`;

const NORMAL_PAGE_CLEANUP = `<script id="mel-normal-page-cleanup">
(()=>{
  const removeRedundantRecall=()=>{
    const selectors=['#melRecallMvp','#melRecallLatest','.mel-recall-last'];
    document.querySelectorAll(selectors.join(',')).forEach(node=>node.remove());
    document.querySelectorAll('button,a,[role="link"],span').forEach(node=>{
      const text=String(node.textContent||'').trim();
      if(text==='Rappeler la dernière conversation'||text==='Reprendre la dernière conversation') node.remove();
    });
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',removeRedundantRecall,{once:true});
  else removeRedundantRecall();
  const observer=new MutationObserver(removeRedundantRecall);
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;

const FULL_MODE_CLEANUP = `<script id="mel-full-page-cleanup">
(()=>{
  const clean=()=>{
    // The full-mode control enhancer owns the single canonical global recall.
    // Remove only the older control-center duplicate injected below it.
    document.querySelectorAll('#melRecallFull').forEach(node=>node.remove());
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',clean,{once:true}); else clean();
  const observer=new MutationObserver(clean);observer.observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;

export async function enhanceOwnerInterface(response, pathname = '/') {
  if (!['/', '/mvp', '/professor'].includes(pathname)) return response;
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;
  let html = await response.text();

  if (pathname === '/professor') {
    // Full mode alone uses the new generated MEL. Normal-mode theme portraits
    // are intentionally left untouched.
    html = html.replaceAll('/meliturgos-avatar-fille.png', '/assets/avatars/mel-full.webp');
    if (!html.includes('mel-full-page-cleanup')) {
      html = html.includes('</body>') ? html.replace('</body>', FULL_MODE_CLEANUP + '</body>') : html + FULL_MODE_CLEANUP;
    }
  } else {
    if (!html.includes('mel-owner-approved-backgrounds')) {
      html = html.includes('</head>')
        ? html.replace('</head>', NORMAL_PAGE_STYLE + '</head>')
        : NORMAL_PAGE_STYLE + html;
    }
    if (!html.includes('mel-normal-page-cleanup')) {
      html = html.includes('</body>')
        ? html.replace('</body>', NORMAL_PAGE_CLEANUP + '</body>')
        : html + NORMAL_PAGE_CLEANUP;
    }
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/mel/activity') return activityResponse(request, env);
    if (request.method === 'GET' && url.pathname === '/api/mel/conversations/latest') return latestConversationResponse(request, env);
    const response = await app.fetch(request, env, ctx);
    if (request.method !== 'GET') return response;
    return enhanceOwnerInterface(response, url.pathname);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};
