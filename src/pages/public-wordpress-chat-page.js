export function renderPublicWordPressChatPage() {
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MEL — Vérité Interdite</title>
<style>
:root{font-family:Inter,system-ui,sans-serif;color:#172033;background:#f7f3e8}*{box-sizing:border-box}body{margin:0;padding:16px;background:#f7f3e8}.wrap{max-width:760px;margin:auto}textarea{width:100%;min-height:110px;resize:vertical;padding:12px;border:1px solid #9b8b65;border-radius:10px;background:#fff;color:#172033}button{width:100%;margin-top:10px;min-height:44px;border:0;border-radius:10px;background:#173a63;color:#fff;font-weight:700;cursor:pointer}button:disabled{opacity:.6}.status{min-height:22px;margin:10px 0;color:#5b6470}.answer{white-space:pre-wrap;line-height:1.5;background:#fff;border:1px solid #d5c8a7;border-radius:10px;padding:12px;min-height:60px}.sources{padding-left:20px}.sources a{color:#173a63}
</style></head><body><main class="wrap">
<form id="f"><label for="q"><strong>Votre question à MEL</strong></label><textarea id="q" maxlength="1200" required placeholder="Posez une question sur un article, un numéro, un guide, un livre ou le site."></textarea><button id="send" type="submit">Demander à MEL</button></form>
<p class="status" id="status" role="status" aria-live="polite"></p><div class="answer" id="answer" aria-live="polite"></div><ul class="sources" id="sources"></ul>
</main><script>
(()=>{const f=document.getElementById('f'),q=document.getElementById('q'),s=document.getElementById('status'),a=document.getElementById('answer'),list=document.getElementById('sources'),btn=document.getElementById('send');
f.addEventListener('submit',async e=>{e.preventDefault();const message=String(q.value||'').trim();if(!message)return;btn.disabled=true;s.textContent='MEL cherche dans les contenus publics…';a.textContent='';list.replaceChildren();
try{const r=await fetch('/api/public/wordpress/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message})});const p=await r.json().catch(()=>({}));if(!r.ok||!p.ok)throw new Error(p.error||'PUBLIC_CHAT_FAILED');a.textContent=String(p.answer||'');for(const source of Array.isArray(p.sources)?p.sources:[]){try{const u=new URL(String(source.url||''));if(u.origin!=='https://verite-interdite.fr')continue;const li=document.createElement('li'),link=document.createElement('a');link.href=u.href;link.target='_blank';link.rel='noopener';link.textContent=String(source.title||u.pathname);li.appendChild(link);list.appendChild(li)}catch{}}s.textContent='Réponse fondée sur les résultats publics de Vérité Interdite.'}
catch{s.textContent='MEL publique est momentanément indisponible. Réessayez un peu plus tard.'}finally{btn.disabled=false}});})();
</script></body></html>`;
}
