import { onRequestGet as controlRoom } from './control-room.js';

export async function onRequestGet(context) {
  const response = await controlRoom(context);
  const html = await response.text();
  const patch = `<script id="mel-control-room-supervised-queue">
(function(){
  async function json(url,opt){var r=await fetch(url,opt);var d=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(d.error||d.code||('HTTP '+r.status));return d}
  async function supervisedContinue(button){
    var old=button.textContent;button.disabled=true;button.textContent='Préparation du travail…';
    try{
      var state=await json('/api/professor/dev/autonomy/status');
      var next=state&&state.next;
      if(!next){button.textContent='Roadmap sans étape disponible';return}
      var goal='['+next.id+'] '+next.title+(next.next?' — '+next.next:'');
      var result=await json('/api/gen2/capabilities/execute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'evolution.enqueue',input:{goal:goal,conversationId:'control-room',requestKey:'roadmap-'+next.id}})});
      button.textContent=result&&result.result&&result.result.created?'Travail lancé':'Travail déjà en cours';
      setTimeout(function(){location.reload()},900);
    }catch(e){button.textContent='Erreur : '+e.message;setTimeout(function(){button.textContent=old;button.disabled=false},2600)}
  }
  document.addEventListener('click',function(event){
    var button=event.target&&event.target.closest&&event.target.closest('#continueRoadmap,#continueRoadmapTop,#continueRoadmapWork');
    if(!button)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    supervisedContinue(button);
  },true);
})();
</script>`;
  const body = html.includes('</body>') ? html.replace('</body>', patch + '</body>') : html + patch;
  const headers = new Headers(response.headers); headers.delete('content-length');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
