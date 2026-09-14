import app from './learning-entry.js';
import { requireAuth } from './core/security.js';
import { migrate } from './persistence/migrations.js';
import { createConversationService } from './conversations/conversation-service.js';
import { buildActivitySnapshot } from './activity/activity-snapshot.js';
import fullAvatar from './assets/generated/full-avatar.js';

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

const NORMAL_PAGE_STYLE = `<style id="mel-owner-visual-fix">
/* Restore the owner-approved HD scene files. The internal compressed previews
   remain available as assets but are no longer forced over these HD sources. */
html[data-theme="classic"]{--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-classic-hd-scaled.jpg?v=20260912-r4')!important;--mel-hd-pos:center center!important}
html[data-theme="crusade"]{--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-crusade-hd.jpg?v=20260912-r4')!important;--mel-hd-pos:center center!important}
html[data-theme="religious"]{--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-religious-hd-scaled.jpg?v=20260912-r4')!important;--mel-hd-pos:center center!important}
html[data-theme="granada"]{--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-granada-hd-scaled.jpg?v=20260912-r4')!important;--mel-hd-pos:center center!important}
html[data-theme="aviation"]{--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-aviation-hd-1-scaled.jpg?v=20260912-r4')!important;--mel-hd-pos:center center!important}
html[data-theme="paladin"]{--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-paladin-hd-scaled.jpg?v=20260912-r4')!important;--mel-hd-pos:center center!important}
html[data-theme="amazon"]{--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-amazon-hd.jpg?v=20260912-r4')!important;--mel-hd-pos:center center!important}
.avatar{overflow:hidden!important;border-radius:50%!important}
.avatar img{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important;object-position:center 23%!important;transform:scale(1.065)!important;transform-origin:center 28%!important}
.mel-owner-previous-row{min-height:22px;margin:2px 2px 4px;display:flex;align-items:center}
.mel-owner-previous-link{color:var(--accent);font-size:.82rem;font-weight:750;text-decoration:underline;cursor:pointer}
.mel-owner-previous-link[aria-busy="true"]{opacity:.55;pointer-events:none}
</style>`;

const NORMAL_PAGE_CLEANUP = `<script id="mel-normal-page-cleanup">
(()=>{
  const escText=v=>String(v??'');
  const addMessage=(role,text)=>{
    const messages=document.getElementById('messages');if(!messages)return;
    messages.querySelector('.empty')?.remove();
    const node=document.createElement('div');node.className='msg '+(role==='user'?'user':'mel');
    const who=document.createElement('span');who.className='who';who.textContent=role==='user'?'Adrien':'MEL';
    const body=document.createElement('div');body.textContent=escText(text);node.append(who,body);messages.appendChild(node);
  };
  const removeObsolete=()=>{
    document.getElementById('melTitle')?.remove();
    document.querySelectorAll('.mel-mode-label').forEach(node=>node.remove());
    document.querySelectorAll('#melRecallMvp,#melRecallLatest,.mel-recall-last,.mel-continue-row').forEach(node=>node.remove());
    document.querySelectorAll('button,a,[role="link"],span').forEach(node=>{
      const text=String(node.textContent||'').trim();
      if(text==='Rappeler la dernière conversation'||text==='Reprendre la dernière conversation'||text==='Continuer depuis la dernière phrase') node.remove();
    });
  };
  async function resumePrevious(link){
    const status=document.getElementById('status');link?.setAttribute('aria-busy','true');
    try{
      const r=await fetch('/api/mel/conversations/latest',{cache:'no-store',credentials:'same-origin'});
      const data=await r.json();if(!r.ok)throw new Error(data?.error||('HTTP_'+r.status));
      const latest=data?.conversation,rows=Array.isArray(data?.messages)?data.messages:[];
      if(!latest?.id)throw new Error('AUCUNE_CONVERSATION');
      localStorage.setItem('mel.conversation',String(latest.id));
      const messages=document.getElementById('messages');if(messages)messages.innerHTML='';
      for(const row of rows.slice(-60)){
        const role=String(row?.role||'').toLowerCase();
        if(role==='user'||role==='assistant'||role==='mel')addMessage(role==='user'?'user':'mel',row?.content||row?.text||'');
      }
      if(messages)messages.scrollTop=messages.scrollHeight;
      if(status)status.textContent=rows.length?'Échange précédent repris.':'Conversation précédente reprise.';
    }catch(e){if(status)status.textContent='Reprise impossible : '+(e?.message||'ERREUR')}
    finally{link?.setAttribute('aria-busy','false')}
  }
  const installPrevious=()=>{
    const input=document.getElementById('input');if(!input||document.getElementById('melOwnerPreviousMessage'))return;
    const row=document.createElement('div');row.className='mel-owner-previous-row';
    const link=document.createElement('span');link.id='melOwnerPreviousMessage';link.className='mel-owner-previous-link';link.tabIndex=0;link.setAttribute('role','link');link.textContent='Message précédent';
    row.appendChild(link);input.insertAdjacentElement('afterend',row);
    const run=()=>resumePrevious(link);link.onclick=run;link.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();run()}};
  };
  const apply=()=>{removeObsolete();installPrevious()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  const observer=new MutationObserver(apply);observer.observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;

const FULL_MODE_STYLE = `<style id="mel-full-avatar-fix">
.brand img,.hero img{display:block!important;object-fit:cover!important;object-position:center 24%!important;background:#07111f!important}
.hero img{transform:scale(1.02);transform-origin:center center}
</style>`;

const FULL_MODE_CLEANUP = `<script id="mel-full-page-cleanup">
(()=>{
  const explain={
    WAITING_TEACHER:'MEL a préparé la demande et l’a transmise au canal Teacher. Elle surveille la réponse et peut poursuivre les autres travaux compatibles.',
    READY_FOR_REVIEW:'La candidate est prête. MEL vérifie la CI et la preuve de completion ; dès qu’elles arrivent, la réconciliation est relancée sans attendre un nouveau travail.',
    TEACHER_APPROVED:'Le Teacher a validé le plan. MEL peut poursuivre l’implémentation sur la branche candidate.',
    COUNCIL_COMPLETE:'Les IA prévues ont été consultées et leur synthèse est prête pour le contrôle Teacher.',
    QUEUED:'Le travail est enregistré et attend son tour d’exécution.',
    CLAIMED:'MEL a pris ce travail en charge.',
    COMPLETED:'Le travail est terminé avec preuve corrélée.',
    FAILED:'Une erreur réelle a interrompu ce travail ; MEL doit diagnostiquer ou réparer avant de le considérer terminé.'
  };
  const clean=()=>{
    document.querySelectorAll('#melRecallFull').forEach(node=>node.remove());
    const log=document.getElementById('melLiveLog');
    if(log){
      log.querySelectorAll('.mel-live-entry').forEach(entry=>{
        const text=String(entry.textContent||'').toUpperCase();
        const key=Object.keys(explain).find(k=>text.includes(k));
        if(key&&!entry.querySelector('.mel-live-explanation')){
          const p=document.createElement('div');p.className='mel-live-explanation';p.style.marginTop='6px';p.style.lineHeight='1.45';p.style.color='#dbeafe';p.textContent=explain[key];entry.appendChild(p);
        }
      });
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',clean,{once:true});else clean();
  const observer=new MutationObserver(clean);observer.observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;

const FULL_AVATAR_DATA_URL = `data:image/webp;base64,${fullAvatar}`;

export async function enhanceOwnerInterface(response, pathname = '/') {
  if (!['/', '/mvp', '/professor'].includes(pathname)) return response;
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;
  let html = await response.text();

  if (pathname === '/professor') {
    // Use the generated full-mode portrait inline so a broken asset route can
    // never leave the full control room with an empty avatar.
    html = html.replaceAll('src="/meliturgos-avatar-fille.png"', `src="${FULL_AVATAR_DATA_URL}"`);
    html = html.replaceAll('src="/assets/avatars/mel-full.webp"', `src="${FULL_AVATAR_DATA_URL}"`);
    if (!html.includes('mel-full-avatar-fix')) {
      html = html.includes('</head>') ? html.replace('</head>', FULL_MODE_STYLE + '</head>') : FULL_MODE_STYLE + html;
    }
    if (!html.includes('mel-full-page-cleanup')) {
      html = html.includes('</body>') ? html.replace('</body>', FULL_MODE_CLEANUP + '</body>') : html + FULL_MODE_CLEANUP;
    }
  } else {
    if (!html.includes('mel-owner-visual-fix')) {
      html = html.includes('</head>') ? html.replace('</head>', NORMAL_PAGE_STYLE + '</head>') : NORMAL_PAGE_STYLE + html;
    }
    if (!html.includes('mel-normal-page-cleanup')) {
      html = html.includes('</body>') ? html.replace('</body>', NORMAL_PAGE_CLEANUP + '</body>') : html + NORMAL_PAGE_CLEANUP;
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
