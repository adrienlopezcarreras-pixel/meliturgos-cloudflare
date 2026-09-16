export const ROADMAP_LIVE_REFRESH_PATCH = `<script id="mel-roadmap-live-refresh-runtime">
(function(){
  const REFRESH_MS=30000;
  let timer=null,busy=false;

  function patchRoadmapFetch(){
    if(window.__melRoadmapFetchPatched||!window.fetch)return;
    const nativeFetch=window.fetch.bind(window);
    window.__melRoadmapFetchPatched=true;
    window.fetch=function(resource,options){
      const path=typeof resource==='string'?resource:String(resource?.url||'');
      if(path.includes('/api/gen2/roadmap'))return nativeFetch(resource,{...(options||{}),cache:'no-store'});
      return nativeFetch(resource,options);
    };
  }

  async function refreshRoadmap(){
    if(busy)return;
    const panel=document.querySelector('[data-panel="roadmap"]');
    if(!panel)return;
    busy=true;
    try{
      if(typeof roadmapCache!=='undefined')roadmapCache=null;
      if(typeof loadRoadmap==='function')await loadRoadmap();
      const source=typeof roadmapCache!=='undefined'&&roadmapCache?roadmapCache.source:null;
      const revision=source&&source.revision?String(source.revision):'';
      let stamp=document.getElementById('melRoadmapRevision');
      if(!stamp){
        stamp=document.createElement('div');
        stamp.id='melRoadmapRevision';
        stamp.className='muted';
        stamp.style.cssText='font-size:.75rem;margin:-6px 0 12px';
        const list=document.getElementById('roadmapList');
        list?.parentNode?.insertBefore(stamp,list);
      }
      if(stamp)stamp.textContent=revision?'Registre '+revision+' · actualisation automatique':'Actualisation automatique';
    }catch(error){
      const stamp=document.getElementById('melRoadmapRevision');
      if(stamp)stamp.textContent='Actualisation roadmap indisponible · '+String(error?.message||'ERREUR');
    }finally{busy=false}
  }

  function install(){
    if(window.__melRoadmapLiveRefresh)return;
    window.__melRoadmapLiveRefresh=true;
    patchRoadmapFetch();
    const button=document.querySelector('#nav button[data-view="roadmap"]');
    if(button)button.addEventListener('click',()=>setTimeout(refreshRoadmap,0));
    timer=setInterval(()=>{
      const panel=document.querySelector('[data-panel="roadmap"]');
      if(panel?.classList.contains('active'))refreshRoadmap();
    },REFRESH_MS);
    const panel=document.querySelector('[data-panel="roadmap"]');
    if(panel?.classList.contains('active'))refreshRoadmap();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)},{once:true});
})();
</script>`;

export async function enhanceRoadmapLiveRefresh(response) {
  if (!(response instanceof Response)) return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  const html=await response.text();
  if(!html.includes('data-panel="roadmap"')||!html.includes('id="roadmapList"'))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  if(html.includes('mel-roadmap-live-refresh-runtime'))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const body=html.includes('</body>')?html.replace('</body>',ROADMAP_LIVE_REFRESH_PATCH+'</body>'):html+ROADMAP_LIVE_REFRESH_PATCH;
  const headers=new Headers(response.headers);
  headers.set('content-length',String(new TextEncoder().encode(body).length));
  headers.set('cache-control','no-store');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
