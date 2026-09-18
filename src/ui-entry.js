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
  if (pathname !== '/professor') return response;
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;

  let html = await response.text();
  const fullAvatarSrc = 'src="/assets/avatars/mel-full.webp?v=20260915-r2" onerror="this.onerror=null;this.src=\'/assets/avatars/mel-classic.webp?v=20260915-r2\'"';
  html = html.replaceAll('src="/meliturgos-avatar-fille.png"', fullAvatarSrc);
  html = html.replaceAll('src="/assets/avatars/mel-full.webp"', fullAvatarSrc);
  if (!html.includes('mel-full-avatar-fix')) html = html.includes('</head>') ? html.replace('</head>', FULL_MODE_STYLE + '</head>') : FULL_MODE_STYLE + html;
  if (!html.includes('mel-full-page-cleanup')) html = html.includes('</body>') ? html.replace('</body>', FULL_MODE_CLEANUP + '</body>') : html + FULL_MODE_CLEANUP;

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
