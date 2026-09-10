const THEME_AVATAR_SCRIPT = `<script id="mel-theme-avatar-runtime">
(function(){
  const avatars={
    classic:'/assets/avatars/mel-classic.webp',
    crusade:'/assets/avatars/mel-crusade.webp',
    religious:'/assets/avatars/mel-religious-andalusian.webp'
  };
  function theme(){const value=document.documentElement.dataset.theme;return avatars[value]?value:'classic'}
  function syncAvatar(){const img=document.querySelector('.avatar img');if(!img)return;const src=avatars[theme()];if(img.getAttribute('src')!==src)img.setAttribute('src',src)}
  function recentIntentContext(){
    try{
      return Array.from(document.querySelectorAll('#messages .msg')).slice(-8).map(function(node){
        const role=node.classList.contains('user')?'USER':'MEL';
        return role+': '+String(node.textContent||'').replace(/\s+/g,' ').trim().slice(0,1200);
      }).join('\n').slice(-8000);
    }catch{return ''}
  }
  syncAvatar();
  new MutationObserver(syncAvatar).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(resource,init){
    try{
      const path=typeof resource==='string'?resource:resource&&resource.url;
      if(path&&path.includes('/api/chat')&&init&&typeof init.body==='string'){
        const body=JSON.parse(init.body);
        if(body&&typeof body==='object'){
          let changed=false;
          if(!body.ui_theme){body.ui_theme=theme();changed=true}
          if(!body.intent_context){const context=recentIntentContext();if(context){body.intent_context=context;changed=true}}
          if(changed)init={...init,body:JSON.stringify(body)};
        }
      }
    }catch{}
    return nativeFetch(resource,init);
  };
})();
</script>`;

export async function enhanceThemeAvatars(response) {
  if (!(response instanceof Response)) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  if (!html.includes('data-theme=') || html.includes('mel-theme-avatar-runtime')) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const body = html.includes('</body>') ? html.replace('</body>', `${THEME_AVATAR_SCRIPT}</body>`) : html + THEME_AVATAR_SCRIPT;
  const headers = new Headers(response.headers);
  headers.set('content-length', String(new TextEncoder().encode(body).length));
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export { THEME_AVATAR_SCRIPT };
