const STYLE = `<style id="mel-progress-canonical-style">
#melXpCardCanonical{margin:0 0 14px;padding:14px;border:1px solid rgba(216,180,95,.28);background:linear-gradient(135deg,rgba(12,20,34,.96),rgba(5,10,20,.9));border-radius:16px}
#melXpCardCanonical .mel-xp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:10px}
#melXpCardCanonical .mel-xp-head h3{margin:0;font-size:1rem}.mel-xp-badge{display:inline-flex;padding:5px 9px;border-radius:999px;border:1px solid rgba(216,180,95,.35);font-size:.7rem;font-weight:850;color:#ffe39a}
#melXpCardCanonical .mel-xp-main{display:grid;grid-template-columns:minmax(150px,.7fr) minmax(220px,1.3fr);gap:14px;align-items:center}.mel-xp-level{font-size:2rem;font-weight:900;line-height:1}.mel-xp-rank{display:block;margin-top:5px;font-size:.76rem;color:#aebbd0}.mel-xp-total{font-size:.88rem;color:#eef3fb;margin:0 0 7px}.mel-xp-bar{height:10px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08)}.mel-xp-bar span{display:block;height:100%;width:0;background:linear-gradient(90deg,#d8b45f,#ffe39a);transition:width .25s ease}.mel-xp-next{font-size:.7rem;color:#9fb0c5;margin-top:5px}
#melXpCardCanonical .mel-xp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.mel-xp-stat{padding:9px 10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(0,0,0,.18)}.mel-xp-stat span{display:block;font-size:.67rem;color:#9fb0c5;text-transform:uppercase;letter-spacing:.05em}.mel-xp-stat strong{display:block;font-size:.93rem;margin-top:3px;color:#fff}.mel-xp-stat small{display:block;font-size:.67rem;color:#b9c5d5;margin-top:2px}.mel-xp-foot{margin-top:10px;font-size:.68rem;color:#8fa0b5;line-height:1.4}
@media(max-width:720px){#melXpCardCanonical .mel-xp-main{grid-template-columns:1fr}.mel-xp-grid{grid-template-columns:1fr!important}.mel-xp-level{font-size:1.7rem}}
</style>`;

const SCRIPT = `<script id="mel-progress-canonical-runtime">(function(){
function fmt(v){return Number(v||0).toLocaleString('fr-FR')}
function card(){return '<article id="melXpCardCanonical" class="card wide"><div class="mel-xp-head"><div><h3>Progression MEL</h3><div class="mel-xp-rank" id="melXpSource">XP calculé depuis des preuves vérifiables</div></div><span class="mel-xp-badge">Roadmap incluse</span></div><div class="mel-xp-main"><div><div class="mel-xp-level">Niv. <span id="melXpLevel">—</span></div><span class="mel-xp-rank" id="melXpRank">mesure en cours</span></div><div><p class="mel-xp-total"><strong id="melXpTotal">— XP</strong></p><div class="mel-xp-bar"><span id="melXpBar"></span></div><div class="mel-xp-next" id="melXpNext">Calcul du prochain niveau…</div></div></div><div class="mel-xp-grid"><div class="mel-xp-stat"><span>Roadmap validée</span><strong id="melXpRoadmapCount">—</strong><small id="melXpRoadmap">— XP</small></div><div class="mel-xp-stat"><span>Apprentissage prouvé</span><strong id="melXpLearning">— XP</strong><small id="melXpLearningState">preuves runtime</small></div><div class="mel-xp-stat"><span>Règle roadmap</span><strong>DONE 100 · VERIFIED 150</strong><small>PARTIAL / IN_PROGRESS = 0 XP</small></div></div><div class="mel-xp-foot">L’XP n’est pas un score d’intelligence. Il gamifie les preuves d’apprentissage disponibles et les tâches réellement terminées dans la roadmap. Une tâche simplement ajoutée à la feuille de route ne rapporte rien.</div></article>'}
async function load(){const host=document.querySelector('.view[data-panel="multi"]');const status=document.getElementById('melCanonicalStatus');if(!host||!status)return false;if(!document.getElementById('melXpCardCanonical')){const wrap=document.createElement('div');wrap.innerHTML=card();status.insertAdjacentElement('afterend',wrap.firstElementChild)}try{const r=await fetch('/api/gen2/progress',{headers:{accept:'application/json'}});const d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||d.code||('HTTP '+r.status));const e=d.evidence||{};document.getElementById('melXpLevel').textContent=d.level??'—';document.getElementById('melXpRank').textContent=(d.rank||'')+' · '+Number(d.level_progress_percent||0).toFixed(1)+'% du niveau';document.getElementById('melXpTotal').textContent=fmt(d.xp)+' XP';document.getElementById('melXpBar').style.width=Math.max(0,Math.min(100,Number(d.level_progress_percent||0)))+'%';document.getElementById('melXpNext').textContent=fmt(d.xp_to_next_level)+' XP avant le niveau suivant';document.getElementById('melXpRoadmapCount').textContent=fmt(e.roadmap_complete)+' / '+fmt(e.roadmap_total)+' · '+fmt(e.roadmap_percent_complete)+'%';document.getElementById('melXpRoadmap').textContent='+'+fmt(d.roadmap_xp)+' XP roadmap';document.getElementById('melXpLearning').textContent=fmt(d.learning_xp)+' XP';document.getElementById('melXpLearningState').textContent=d.learning_evidence_available?'preuves d’apprentissage détectées':'moteur de preuves à reconnecter sur ce runtime';return true}catch(err){const n=document.getElementById('melXpSource');if(n)n.textContent='Progression indisponible : '+String(err.message||err);return true}}
let tries=0;function boot(){load().then(function(done){if(!done&&tries++<40)setTimeout(boot,100)})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();</script>`;

export async function enhanceMelProgress(response) {
  const contentType = response?.headers?.get('content-type') || '';
  if (!response?.ok || !contentType.includes('text/html')) return response;
  const raw = await response.text();
  if (raw.includes('id="mel-progress-canonical-runtime"')) {
    return new Response(raw, { status: response.status, headers: response.headers });
  }
  const body = raw
    .replace('</head>', `${STYLE}</head>`)
    .replace('</body>', `${SCRIPT}</body>`);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
