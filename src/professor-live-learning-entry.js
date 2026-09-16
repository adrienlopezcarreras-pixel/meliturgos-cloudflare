import app from './ui-release-fix-entry.js';
import { requireAuth } from './core/security.js';
import { authorizeDevBridge } from './core/dev-bridge-auth.js';
import { createLearningEngine } from './learning/learning-engine.js';
import { getLiveLearningProgress } from './learning/live-progress.js';
import { enhanceThemeAvatars } from './pages/theme-avatar-enhancer.js';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
    },
  });
}

async function liveLearningProgressResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    const engine = createLearningEngine(env);
    const progress = await getLiveLearningProgress({ engine, db: env.DB });
    return json({ ok: true, ...progress });
  } catch (error) {
    return json({
      ok: false,
      error: 'LIVE_LEARNING_PROGRESS_UNAVAILABLE',
      detail: String(error?.message || 'unknown').slice(0, 180),
    }, 503);
  }
}

/**
 * Normal mode historically accumulated visual patches in ui-entry and
 * ui-release-fix-entry before the canonical theme enhancer ran. Strip only
 * those presentation-only layers at the final edge; functional cleanup and
 * cache scripts remain intact. This makes theme-avatar-enhancer the sole
 * visual owner of normal mode without rewriting lower runtime behavior.
 */
export async function stripLegacyNormalVisualLayers(response) {
  if (!(response instanceof Response)) return response;
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;
  const html = await response.text();
  const body = html
    .replace(/<style id="mel-owner-visual-fix">[\s\S]*?<\/style>/g, '')
    .replace(/<style id="mel-new-hd-scenes">[\s\S]*?<\/style>/g, '')
    .replace(/<script id="mel-normal-release-runtime">[\s\S]*?<\/script>/g, '');
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

const PROFESSOR_LIVE_LEARNING_PATCH = `<script id="mel-professor-live-learning-runtime">
(()=>{
  let timer=null;
  const q=s=>document.querySelector(s);
  const txt=(selector,value)=>{const node=q(selector);if(node)node.textContent=String(value??'—')};
  const pct=value=>value==null?'—':(Math.round(Number(value)*1000)/10)+'%';
  const xp=value=>Number(value||0).toLocaleString('fr-FR')+' XP';
  function ensureDetailRows(){
    const details=q('#learningDetails');
    const grid=details?.firstElementChild;
    if(!grid||q('#learnProjectExperience'))return;
    const rows=[
      ['Leçons projet','learnProjectExperience'],
      ['Source XP','learnXpSource'],
      ['XP observée','learnObservedXp'],
      ['Dernière mesure','learnMeasuredAt'],
    ];
    for(const [label,id] of rows){
      const span=document.createElement('span');span.style.color='#b6c2d2';span.textContent=label;
      const strong=document.createElement('strong');strong.id=id;strong.textContent='—';
      grid.append(span,strong);
    }
  }
  function render(d){
    if(!d||d.ok===false)return;
    ensureDetailRows();
    const e=d.evidence||{};
    const p=Math.max(0,Math.min(100,Number(d.level_progress_percent||0)));
    txt('#learnLevel',d.level??'—');
    txt('#learnRank',(d.rank||'')+' · '+p.toFixed(0)+'%');
    const bar=q('#learnBar');if(bar)bar.style.width=p+'%';
    txt('#learnXp',xp(d.canonical_xp??d.xp));
    const bench=e.benchmark_latest_score==null?'bench —':'bench '+pct(e.benchmark_latest_score);
    const lora=e.neural_weights_changed?'LoRA actif':'LoRA inactif';
    const lessons=d.project_experience?.available?(Number(d.project_experience.count||0)+' leçons'):'leçons —';
    txt('#learnMeta',Number(e.corrections_validated||0)+' corr. · '+lessons+' · '+bench+' · '+lora);
    txt('#learnNext',xp(d.xp_to_next_level));
    txt('#learnProjectExperience',d.project_experience?.available?(Number(d.project_experience.count||0)+' en mémoire active'):'indisponible');
    txt('#learnXpSource',d.xp_source==='verified-journal'?'journal XP vérifié':'rapport d’apprentissage courant');
    txt('#learnObservedXp',xp(d.observed_xp));
    const measured=d.measured_at?new Date(d.measured_at):null;
    txt('#learnMeasuredAt',measured&&!Number.isNaN(measured.getTime())?measured.toLocaleString('fr-FR'):'—');
    const chip=q('#learningChip');
    if(chip)chip.title='Données live · '+xp(d.canonical_xp??d.xp)+' · '+lessons+' · roadmap exclue';
  }
  async function refresh(){
    try{
      const response=await fetch('/api/learning/progress',{cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw new Error('HTTP_'+response.status);
      render(await response.json());
    }catch(error){
      const meta=q('#learnMeta');
      if(meta&&!meta.textContent.includes('indisponible'))meta.textContent+=' · live indisponible';
    }
  }
  function start(){
    ensureDetailRows();
    refresh();
    if(timer)clearInterval(timer);
    timer=setInterval(refresh,30000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
  window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)},{once:true});
})();
</script>`;

async function enhanceProfessorLearning(response, pathname) {
  const type = response.headers.get('content-type') || '';
  if (pathname !== '/professor' || !response.ok || !type.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('mel-professor-live-learning-runtime')) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const body = html.includes('</body>')
    ? html.replace('</body>', PROFESSOR_LIVE_LEARNING_PATCH + '</body>')
    : html + PROFESSOR_LIVE_LEARNING_PATCH;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/dev-bridge/')) {
      const denied = authorizeDevBridge(request, env);
      if (denied) return denied;
    }
    if (request.method === 'GET' && url.pathname === '/api/learning/progress') {
      return liveLearningProgressResponse(request, env);
    }
    let response = await app.fetch(request, env, ctx);
    if (request.method !== 'GET') return response;
    if (url.pathname === '/' || url.pathname === '/mvp') {
      response = await stripLegacyNormalVisualLayers(response);
      response = await enhanceThemeAvatars(response);
    }
    return enhanceProfessorLearning(response, url.pathname);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};
