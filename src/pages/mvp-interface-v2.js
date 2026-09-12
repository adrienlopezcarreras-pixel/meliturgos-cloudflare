import { onRequestGet as renderMvp } from './mvp-interface.js';

const PATCH = `<style id="mel-status-button-style">
#melBriefStatus{background:linear-gradient(135deg,#274f61,#182d3a)!important;color:#fff!important;border-color:rgba(230,200,117,.35)!important}
#melBriefStatus:hover{filter:brightness(1.08)}
@media(max-width:650px){.controls{grid-template-columns:1fr 1fr!important}#melBriefStatus{grid-column:auto!important}}
</style>
<script id="mel-status-button-runtime">(function(){
  function install(){
    const controls=document.querySelector('.controls');
    const input=document.getElementById('input');
    const send=document.getElementById('send');
    if(!controls||!input||!send||document.getElementById('melBriefStatus'))return;
    const b=document.createElement('button');
    b.type='button';
    b.id='melBriefStatus';
    b.textContent='Statut MEL';
    b.title='Demander à MEL un compte rendu bref de son état actuel';
    b.addEventListener('click',function(){
      if(send.disabled)return;
      input.value='Fais-moi un compte rendu TRÈS BREF de là où tu en es réellement maintenant. Réponds en 4 points maximum : 1) tâche actuelle, 2) dernier résultat vérifié, 3) blocage éventuel, 4) prochaine action. Appuie-toi sur ton état réel, tes checkpoints, Work et la roadmap disponibles. N’invente rien et ne donne pas un plan théorique.';
      input.dispatchEvent(new Event('input',{bubbles:true}));
      send.click();
    });
    controls.appendChild(b);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();</script>`;

export async function onRequestGet(context){
  const response=await renderMvp(context);
  let body=await response.text();
  body=body.includes('</body>')?body.replace('</body>',PATCH+'</body>'):body+PATCH;
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control','no-store, max-age=0');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
