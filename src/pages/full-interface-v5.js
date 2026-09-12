import { onRequestGet as handleFullModeBase } from "./full-interface-v5-base.js";

const GET_JSON_SOURCE = "async function getJson(url){const r=await fetch(url,{headers:{accept:'application/json'}});const d=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(d.error||d.code||('HTTP '+r.status));return d}";
const GET_JSON_PATCH = "async function getJson(url){const c=new AbortController();const t=setTimeout(function(){c.abort()},8000);try{const r=await fetch(url,{headers:{accept:'application/json'},signal:c.signal});const d=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(d.error||d.code||('HTTP '+r.status));return d}catch(e){if(e&&e.name==='AbortError')throw new Error('Délai dépassé : '+url);throw e}finally{clearTimeout(t)}}";
const POST_JSON_SOURCE = "async function postJson(url,body){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});const d=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(d.error||d.code||('HTTP '+r.status));return d}";
const POST_JSON_PATCH = "async function postJson(url,body){const c=new AbortController();const t=setTimeout(function(){c.abort()},30000);try{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{}),signal:c.signal});const d=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(d.error||d.code||('HTTP '+r.status));return d}catch(e){if(e&&e.name==='AbortError')throw new Error('Délai dépassé : '+url);throw e}finally{clearTimeout(t)}}";
const FAILSAFE = `<script>setTimeout(function(){const label=document.getElementById('liveText');if(!label)return;const pending=/Vérification|Connexion/.test(label.textContent||'');if(!pending)return;const dot=document.getElementById('liveDot');if(dot)dot.className='dot warn';label.textContent='Connexion partielle · réessayer';},9000);</script>`;

export async function onRequestGet(context) {
  const base = await handleFullModeBase(context);
  let body = await base.text();
  const getPatched = body.includes(GET_JSON_SOURCE);
  const postPatched = body.includes(POST_JSON_SOURCE);
  body = body
    .replace(GET_JSON_SOURCE, GET_JSON_PATCH)
    .replace(POST_JSON_SOURCE, POST_JSON_PATCH)
    .replace('<span id="liveText">Vérification…</span>', '<span id="liveText">Connexion…</span>')
    .replace('</body>', `${FAILSAFE}</body>`);

  if (!getPatched || !postPatched) {
    throw new Error('FULL_MODE_TIMEOUT_PATCH_NOT_APPLIED');
  }

  const headers = new Headers(base.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-mel-full-mode', 'v5-timeout-hotfix');
  return new Response(body, { status: base.status, statusText: base.statusText, headers });
}
