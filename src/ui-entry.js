import app from './learning-entry.js';
import { requireAuth } from './core/security.js';
import { migrate } from './persistence/migrations.js';
import { createConversationService } from './conversations/conversation-service.js';
import { buildActivitySnapshot } from './activity/activity-snapshot.js';
import { getEcosystemCapabilityWatchStatus, runEcosystemCapabilityWatch } from './evaluation/capability-watch-runtime.js';

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

async function capabilityWatchResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    return json(await getEcosystemCapabilityWatchStatus(env));
  } catch (error) {
    return json({
      ok: false,
      error: 'CAPABILITY_WATCH_UNAVAILABLE',
      detail: String(error?.code || error?.message || 'unknown').slice(0, 180),
    }, 503);
  }
}

async function capabilityWatchRunResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  let body = {};
  try { body = await request.clone().json(); } catch {}
  const force = body?.force === true;
  if (force && String(env.MEL_PREVIEW_ISOLATED || '').toLowerCase() !== 'true') {
    return json({ ok: false, error: 'WATCH_FORCE_PREVIEW_ONLY' }, 403);
  }
  try {
    const build = deployedBuild();
    const result = await runEcosystemCapabilityWatch(env, {
      force,
      sourceSha: build?.sha || null,
    });
    return json({ ok: true, result });
  } catch (error) {
    return json({
      ok: false,
      error: 'CAPABILITY_WATCH_RUN_FAILED',
      detail: String(error?.code || error?.message || 'unknown').slice(0, 180),
    }, 503);
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
/* Use the generated Worker-served scenes directly. This removes the dependency
   on stale WordPress copies for the six generated theme backgrounds. */
html[data-theme="classic"]{--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-classic-hd-scaled.jpg?v=20260915-r1')!important;--mel-hd-pos:center center!important}
html[data-theme="crusade"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-crusade.webp?v=20260915-r1')!important;--mel-hd-pos:center center!important}
html[data-theme="religious"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-religious.webp?v=20260915-r1')!important;--mel-hd-pos:center center!important}
html[data-theme="granada"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-granada.webp?v=20260915-r1')!important;--mel-hd-pos:center center!important}
html[data-theme="aviation"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-aviation.webp?v=20260915-r1')!important;--mel-hd-pos:center center!important}
html[data-theme="paladin"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-paladin.webp?v=20260915-r1')!important;--mel-hd-pos:center center!important}
html[data-theme="amazon"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-amazon.webp?v=20260915-r1')!important;--mel-hd-pos:center center!important}
html body{background-image:linear-gradient(180deg,rgba(8,6,5,.10),rgba(8,5,3,.22) 48%,rgba(6,3,2,.40)),var(--mel-hd-bg)!important;background-size:cover,cover!important;background-position:center center,var(--mel-hd-pos,center center)!important;background-repeat:no-repeat,no-repeat!important;background-attachment:fixed,fixed!important}
.avatar{overflow:hidden!important;border-radius:50%!important}
.avatar img{display:block!important;width:100%!important;height:100%!important;min-width:100%!important;min-height:100%!important;object-fit:cover!important;object-position:center 21%!important;transform:scale(1.14)!important;transform-origin:center 26%!important}
.mel-owner-previous-row{min-height:22px;margin:2px 2px 4px;display:flex;align-items:center}
.mel-owner-previous-link{color:var(--accent);font-size:.82rem;font-weight:750;text-decoration:underline;cursor:pointer}
.mel-owner-previous-link[aria-busy="true"]{opacity:.55;pointer-events:none}
@media(max-width:700px){html body{background-attachment:scroll,scroll!important}.avatar img{object-position:center 20%!important;transform:scale(1.17)!important}}
</style>`;

const NORMAL_PAGE_CLEANUP = `<script id="mel-normal-page-cleanup">
(()=>{
  const addMessage=(role,text)=>{const messages=document.getElementById('messages');if(!messages)return;messages.querySelector('.empty')?.remove();const node=document.createElement('div');node.className='msg '+(role==='user'?'user':'mel');const who=document.createElement('span');who.className='who';who.textContent=role==='user'?'Adrien':'MEL';const body=document.createElement('div');body.textContent=String(text??'');node.append(who,body);messages.appendChild(node)};
  const removeObsolete=()=>{
    document.getElementById('melTitle')?.remove();
    document.querySelectorAll('.mel-mode-label').forEach(node=>node.remove());
    document.querySelectorAll('#melRecallMvp,#melRecallLatest,.mel-recall-last,.mel-continue-row').forEach(node=>node.remove());
    document.querySelectorAll('button,a,[role="link"],span').forEach(node=>{const text=String(node.textContent||'').trim();if(text==='Rappeler la dernière conversation'||text==='Reprendre la dernière conversation'||text==='Continuer depuis la dernière phrase')node.remove()});
  };
  async function resumePrevious(link){const status=document.getElementById('status');link?.setAttribute('aria-busy','true');try{const r=await fetch('/api/mel/conversations/latest',{cache:'no-store',credentials:'same-origin'});const data=await r.json();if(!r.ok)throw new Error(data?.error||('HTTP_'+r.status));const latest=data?.conversation,rows=Array.isArray(data?.messages)?data.messages:[];if(!latest?.id)throw new Error('AUCUNE_CONVERSATION');localStorage.setItem('mel.conversation',String(latest.id));const messages=document.getElementById('messages');if(messages)messages.innerHTML='';for(const row of rows.slice(-60)){const role=String(row?.role||'').toLowerCase();if(role==='user'||role==='assistant'||role==='mel')addMessage(role==='user'?'user':'mel',row?.content||row?.text||'')}if(messages)messages.scrollTop=messages.scrollHeight;if(status)status.textContent=rows.length?'Échange précédent repris.':'Conversation précédente reprise.'}catch(e){if(status)status.textContent='Reprise impossible : '+(e?.message||'ERREUR')}finally{link?.setAttribute('aria-busy','false')}}
  const installPrevious=()=>{const input=document.getElementById('input');if(!input||document.getElementById('melOwnerPreviousMessage'))return;const row=document.createElement('div');row.className='mel-owner-previous-row';const link=document.createElement('span');link.id='melOwnerPreviousMessage';link.className='mel-owner-previous-link';link.tabIndex=0;link.setAttribute('role','link');link.textContent='Message précédent';row.appendChild(link);input.insertAdjacentElement('afterend',row);const run=()=>resumePrevious(link);link.onclick=run;link.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();run()}}};
  const apply=()=>{removeObsolete();installPrevious()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;

const FULL_MODE_STYLE = `<style id="mel-full-avatar-fix">
.brand img,.hero img{display:block!important;object-fit:cover!important;object-position:center 20%!important;background:#07111f!important;border-radius:50%!important;overflow:hidden!important}
.brand img{width:58px!important;height:58px!important;min-width:58px!important;min-height:58px!important;flex:0 0 58px!important}
.hero{grid-template-columns:132px minmax(0,1fr)!important;align-items:center!important}
.hero img{width:126px!important;height:126px!important;min-width:126px!important;min-height:126px!important;max-width:126px!important;max-height:126px!important;transform:scale(1.03)!important;transform-origin:center 25%!important}
.mel-live-owner-explain{border:1px solid rgba(96,165,250,.24);background:rgba(8,23,43,.82);border-radius:14px;padding:12px 14px;margin:0 0 14px;line-height:1.48;color:#dbeafe}
.mel-live-owner-explain strong{color:#fff}.mel-live-owner-explain .mel-line{margin-top:5px}.mel-live-owner-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.mel-live-owner-actions button{min-height:38px}.mel-live-owner-note{font-size:.78rem;color:#94a3b8;margin-top:7px}
@media(max-width:700px){.hero{grid-template-columns:94px minmax(0,1fr)!important}.hero img{width:90px!important;height:90px!important;min-width:90px!important;min-height:90px!important;max-width:90px!important;max-height:90px!important}}
</style>`;

const FULL_MODE_CLEANUP = `<script id="mel-full-page-cleanup">
(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const explainStatus=(job,state)=>{const s=String(job?.status||'').toUpperCase();if(s==='WAITING_TEACHER')return state?.control?.max_autonomy?'Teacher reste suivi ; le mode MAX autorisé poursuit les étapes compatibles sans geler toute la file.':'Teacher reste suivi et MEL poursuit les autres travaux compatibles pendant l’attente.';if(s==='READY_FOR_REVIEW')return 'La candidate est prête : MEL vérifie CI et preuve de completion avant de poursuivre.';if(s==='QUEUED')return 'Ce travail est prêt dans la file.';if(s==='CLAIMED')return 'MEL travaille actuellement sur cette étape.';if(s==='TEACHER_APPROVED')return 'Le plan est validé et peut passer à l’implémentation candidate.';if(s==='COUNCIL_COMPLETE')return 'La consultation multi-IA est terminée et passe aux preuves suivantes.';if(s==='FAILED')return 'Cette étape a échoué et reste visible pour diagnostic.';return 'État réel observé : '+(s||'INCONNU')+'.'};
  const nextText=state=>{const job=(state?.active_jobs||[])[0];if(job)return (job.roadmap_id||job.id||'travail')+' · '+String(job.status||'').toUpperCase();if(state?.next?.id)return state.next.id+' · '+(state.next.title||state.next.status||'prochaine étape');return 'aucun travail actif détecté'};
  async function getJson(url){const r=await fetch(url,{cache:'no-store',credentials:'same-origin'});const t=await r.text();let d;try{d=JSON.parse(t)}catch{throw new Error('REPONSE_INVALIDE')}if(!r.ok)throw new Error(d?.error||d?.code||('HTTP_'+r.status));return d}
  function ensureBox(){const panel=document.querySelector('[data-panel="live"]');if(!panel)return null;let box=document.getElementById('melLiveOwnerExplain');if(box)return box;box=document.createElement('div');box.id='melLiveOwnerExplain';box.className='mel-live-owner-explain';const grid=panel.querySelector('.mel-live-grid');(grid||panel.firstElementChild)?.insertAdjacentElement(grid?'beforebegin':'afterend',box);return box}
  async function refreshNarrative(){const box=ensureBox();if(!box)return;try{const [state,activity]=await Promise.all([getJson('/api/gen2/autonomy/state'),getJson('/api/mel/activity')]);const job=Array.isArray(state?.active_jobs)?state.active_jobs[0]:null;const last=Array.isArray(activity?.events)?activity.events[0]:null;box.innerHTML='<strong>Ce que MEL fait maintenant</strong><div class="mel-line">'+esc(job?explainStatus(job,state):'Aucun travail autonome actif : MEL surveille la file, les réponses Teacher et les preuves disponibles.')+'</div><div class="mel-line"><b>Prochaine cible :</b> '+esc(nextText(state))+'</div>'+(last?'<div class="mel-line"><b>Dernière trace réelle :</b> '+esc(last.title||last.category||'activité')+' — '+esc(last.explanation||last.status||'enregistrée')+'</div>':'')+'<div class="mel-live-owner-note">Pour lancer manuellement un cycle, utilise l’unique bouton « ▶ Démarrer cycle MEL » du bandeau supérieur.</div>'}catch(e){box.innerHTML='<strong>Ce que MEL fait maintenant</strong><div class="mel-line">État indisponible : '+esc(e?.message||'ERREUR')+'</div>'}}
  const init=()=>{ensureBox();refreshNarrative()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();setInterval(refreshNarrative,15000);
})();
</script>`;

export async function enhanceOwnerInterface(response, pathname = '/') {
  if (!['/', '/mvp', '/professor'].includes(pathname)) return response;
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;
  let html = await response.text();

  if (pathname === '/professor') {
    const fullAvatarSrc = 'src="/assets/avatars/mel-full.webp?v=20260915-r2" onerror="this.onerror=null;this.src=\'/assets/avatars/mel-classic.webp?v=20260915-r2\'"';
    html = html.replaceAll('src="/meliturgos-avatar-fille.png"', fullAvatarSrc);
    html = html.replaceAll('src="/assets/avatars/mel-full.webp"', fullAvatarSrc);
    if (!html.includes('mel-full-avatar-fix')) html = html.includes('</head>') ? html.replace('</head>', FULL_MODE_STYLE + '</head>') : FULL_MODE_STYLE + html;
    if (!html.includes('mel-full-page-cleanup')) html = html.includes('</body>') ? html.replace('</body>', FULL_MODE_CLEANUP + '</body>') : html + FULL_MODE_CLEANUP;
  } else {
    if (!html.includes('mel-owner-visual-fix')) html = html.includes('</head>') ? html.replace('</head>', NORMAL_PAGE_STYLE + '</head>') : NORMAL_PAGE_STYLE + html;
    if (!html.includes('mel-normal-page-cleanup')) html = html.includes('</body>') ? html.replace('</body>', NORMAL_PAGE_CLEANUP + '</body>') : html + NORMAL_PAGE_CLEANUP;
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
    if (request.method === 'GET' && url.pathname === '/api/mel/capability-watch') return capabilityWatchResponse(request, env);
    if (request.method === 'POST' && url.pathname === '/api/mel/capability-watch/run') return capabilityWatchRunResponse(request, env);
    if (request.method === 'GET' && url.pathname === '/api/mel/conversations/latest') return latestConversationResponse(request, env);
    const response = await app.fetch(request, env, ctx);
    if (request.method !== 'GET') return response;
    return enhanceOwnerInterface(response, url.pathname);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};
