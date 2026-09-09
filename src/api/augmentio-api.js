import { Augmentio } from '../augmentio/augmentio.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { buildTeacherEscalation } from '../augmentio/teacher-escalation.js';

function labPage() {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MEL Lab</title><style>
  body{font-family:system-ui,sans-serif;background:#111827;color:#f9fafb;margin:0;padding:24px}main{max-width:860px;margin:auto}textarea{width:100%;min-height:140px;padding:14px;border-radius:12px;border:1px solid #374151;background:#1f2937;color:#fff;font:inherit;box-sizing:border-box}button,select,label{font:inherit}button{padding:12px 18px;border:0;border-radius:10px;cursor:pointer}section{background:#1f2937;padding:16px;border-radius:14px;margin-top:16px}.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.best{white-space:pre-wrap;line-height:1.5}.alt{white-space:pre-wrap;padding:10px;border-top:1px solid #374151}.muted{color:#9ca3af}input[type=number]{width:70px;padding:8px;border-radius:8px;border:1px solid #4b5563;background:#111827;color:#fff}</style></head><body><main>
  <h1>MEL Lab · .augmentio</h1><p class="muted">Interface temporaire pour utiliser le moteur multi-IA pendant que l'interface complète continue d'évoluer.</p>
  <textarea id="q" placeholder="Demande quelque chose à MEL…"></textarea><div class="row"><label>Cerveaux <input id="n" type="number" min="1" max="12" value="4"></label><label><input id="teacher" type="checkbox" checked> préparer la revue Teacher</label><button id="go">Demander</button></div>
  <p id="status" class="muted"></p><section><h2>Meilleure réponse</h2><div id="best" class="best muted">Aucune réponse pour le moment.</div></section><section><h2>Autres réponses</h2><div id="alts" class="muted">—</div></section>
<script>
const q=document.getElementById('q'),go=document.getElementById('go'),status=document.getElementById('status'),best=document.getElementById('best'),alts=document.getElementById('alts');
async function run(){const input=q.value.trim();if(!input)return;go.disabled=true;status.textContent='MEL consulte les ressources disponibles…';best.textContent='';alts.textContent='';try{const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input,maxCandidates:Number(document.getElementById('n').value||4),teacherReview:document.getElementById('teacher').checked})});const d=await r.json();if(!r.ok)throw new Error(d.error||d.code||'Erreur');best.textContent=d.best?.text||'Aucune réponse';const list=(d.candidates||[]).slice(1);alts.innerHTML='';for(const c of list){const el=document.createElement('div');el.className='alt';el.textContent=(c.model||c.provider||'IA')+'\n'+(c.text||'');alts.appendChild(el)}if(!list.length)alts.textContent='Aucune alternative.';status.textContent=(d.candidates?.length||0)+' réponse(s), '+(d.failures||0)+' échec(s)'+(d.cacheHit?' · cache':'')+(d.teacherRequest?' · dossier Teacher prêt':'');}catch(e){status.textContent='Erreur : '+e.message;best.textContent='';}finally{go.disabled=false}}
go.addEventListener('click',run);q.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))run()});
</script></main></body></html>`;
}

export default async function handleAugmentio(request, env) {
  if (request.method === 'GET') {
    return new Response(labPage(), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'METHOD_NOT_ALLOWED', code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }

  const body = await request.json().catch(() => ({}));
  const input = body.input ?? body.prompt ?? body.messages;
  if (!input) {
    return Response.json({ error: 'input required', code: 'MISSING_INPUT' }, { status: 400 });
  }

  const capability = String(body.capability || 'GENERAL').toUpperCase();
  const maxCandidates = Math.min(12, Math.max(1, Number(body.maxCandidates || 4)));
  const pool = createDefaultAugmentioPool(env);
  const augmentio = new Augmentio({ pool });
  const result = await augmentio.fanOut({ capability, input, context: body.context || {}, maxCandidates });

  const response = {
    ok: true,
    mode: 'augmentio',
    capability,
    best: result.best,
    candidates: result.candidates,
    failures: result.failures,
    providersAttempted: result.providersAttempted,
    cacheHit: result.cacheHit,
  };

  if (body.teacherReview === true) {
    response.teacherRequest = buildTeacherEscalation({ input, capability, result });
  }

  return Response.json(response);
}
