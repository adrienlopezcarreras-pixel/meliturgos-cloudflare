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

  async function refreshEvolution(){
    const panel=document.querySelector('[data-panel="roadmap"]');
    const list=document.getElementById('roadmapList');
    if(!panel||!list)return;
    let section=document.getElementById('melEvolutionDevelopment');
    if(!section){
      section=document.createElement('section');
      section.id='melEvolutionDevelopment';
      section.setAttribute('aria-label','Évolution et développement');
      section.style.cssText='margin:18px 0;padding:16px;border:1px solid var(--border,#7774);border-radius:12px';
      const heading=document.createElement('h3');
      heading.textContent='Évolution & Développement';
      const status=document.createElement('p');
      status.id='melEvolutionStatus';
      status.className='muted';
      const entries=document.createElement('ul');
      entries.id='melEvolutionEntries';
      section.append(heading,status,entries);
      list.insertAdjacentElement('afterend',section);
    }
    const status=document.getElementById('melEvolutionStatus');
    const entries=document.getElementById('melEvolutionEntries');
    if(!status||!entries)return;
    try{
      const response=await fetch('/api/gen2/capabilities/execute',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({id:'evolution.list',input:{}})
      });
      if(!response.ok)throw new Error('HTTP_'+response.status);
      const payload=await response.json();
      if(!payload?.ok||payload.capability!=='evolution.list'||!payload.result)throw new Error('EVOLUTION_RESPONSE_INVALID');
      const result=payload.result;
      const initial=result.initial||{};
      const archive=result.archive;
      const archiveLabel=result.initial_scope==='ARCHIVED_VERIFIED'&&archive
        ?'Roadmap initiale archivée et certifiée'
        :'Roadmap initiale : registre courant, clôture non archivée';
      const evolution=result.evolution||{};
      const health=result.health||{};
      const operationalHealth=health.status==='CONNECTED'&&Number.isInteger(health.active_incidents)
        ?String(health.active_incidents)+' incident(s) actif(s)'
        :'Santé opérationnelle non raccordée';
      const knownRegressions=Number.isInteger(health.regressed_items)?health.regressed_items:0;
      status.textContent=archiveLabel+' · '+String(initial.verified??'?')+'/'+String(initial.total??'?')+
        ' vérifiés · '+String(evolution.total??0)+' développements évolutifs · '+
        operationalHealth+' · '+String(knownRegressions)+' régression(s) enregistrée(s)';
      entries.replaceChildren();
      for(const item of (Array.isArray(result.items)?result.items:[]).slice(0,30)){
        const li=document.createElement('li');
        li.textContent=String(item.id||'')+' · '+String(item.title||'')+' — '+String(item.status||'UNKNOWN');
        const actionStatus=String(item.status||'');
        const options=actionStatus==='PROPOSED'
          ? [{next:'TRIAGED',label:'Examiner'}]
          : actionStatus==='TRIAGED'
            ? [{next:'APPROVED',label:'Approuver'},{next:'REJECTED',label:'Rejeter'}]
            : [];
        for(const action of options){
          const button=document.createElement('button');
          button.type='button';
          button.textContent=action.label;
          button.setAttribute('aria-label',action.label+' : '+String(item.title||''));
          button.style.cssText='margin-left:8px;padding:4px 8px';
          button.addEventListener('click',async()=>{
            if(!Number.isSafeInteger(item.revision)||item.revision<1){
              status.textContent='Révision D1 inconnue : action refusée, actualisez le panneau';
              return;
            }
            if(!window.confirm(action.label+' ce développement : '+String(item.title||'')+' ?'))return;
            button.disabled=true;
            try{
              const reply=await fetch('/api/gen2/capabilities/execute',{
                method:'POST',credentials:'same-origin',cache:'no-store',
                headers:{'content-type':'application/json','x-mel-approve-capability':'evolution.review'},
                body:JSON.stringify({id:'evolution.review',input:{id:item.id,expected_revision:item.revision,next:action.next}})
              });
              if(!reply.ok)throw new Error('HTTP_'+reply.status);
              const data=await reply.json();
              if(data?.ok!==true||data?.capability!=='evolution.review'||data?.result?.item?.status!==action.next)throw new Error('EVOLUTION_REVIEW_NOT_CONFIRMED');
              await refreshEvolution();
            }catch(error){
              status.textContent='Examen non enregistré (permission, approbation ou révision) : '+String(error?.message||'UNKNOWN');
            }finally{button.disabled=false}
          });
          li.appendChild(button);
        }
        entries.appendChild(li);
      }
    }catch(error){
      status.textContent='Bac de développement indisponible ou non encore déployé : '+String(error?.message||'UNKNOWN');
      entries.replaceChildren();
    }
  }

  async function refreshRoadmap(){
    if(busy)return;
    const panel=document.querySelector('[data-panel="roadmap"]');
    if(!panel)return;
    busy=true;
    try{
      if(typeof roadmapCache!=='undefined')roadmapCache=null;
      if(typeof loadRoadmap==='function')await loadRoadmap();
      await refreshEvolution();
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
      if(document.hidden)return;
      const panel=document.querySelector('[data-panel="roadmap"]');
      if(panel?.classList.contains('active'))refreshRoadmap();
    },REFRESH_MS);
    const panel=document.querySelector('[data-panel="roadmap"]');
    if(panel?.classList.contains('active'))refreshRoadmap();
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden&&document.querySelector('[data-panel="roadmap"]')?.classList.contains('active'))refreshRoadmap();
    });
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
