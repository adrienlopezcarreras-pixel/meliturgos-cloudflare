import app from './learning-entry.js';

// Final owner-facing cleanup layer. Keep this deliberately small: the real UI
// lives below in the canonical page/enhancer modules. This wrapper only applies
// owner-approved presentation reconciliation after every lower layer has run.
const NORMAL_PAGE_STYLE = `<style id="mel-owner-approved-backgrounds">
html[data-theme="crusade"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-crusade.webp')!important}
html[data-theme="religious"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-religious.webp')!important}
html[data-theme="granada"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-granada.webp')!important}
html[data-theme="aviation"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-aviation.webp')!important}
html[data-theme="paladin"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-paladin.webp')!important}
html[data-theme="amazon"]{--mel-hd-bg:url('/assets/backgrounds/mel-bg-amazon.webp')!important}
</style>`;

const NORMAL_PAGE_CLEANUP = `<script id="mel-normal-page-cleanup">
(()=>{
  const removeRedundantRecall=()=>{
    const selectors=['#melRecallMvp','#melRecallLatest','.mel-recall-last'];
    document.querySelectorAll(selectors.join(',')).forEach(node=>node.remove());
    document.querySelectorAll('button,a,[role="link"],span').forEach(node=>{
      const text=String(node.textContent||'').trim();
      if(text==='Rappeler la dernière conversation'||text==='Reprendre la dernière conversation') node.remove();
    });
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',removeRedundantRecall,{once:true});
  else removeRedundantRecall();
  const observer=new MutationObserver(removeRedundantRecall);
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;

export async function enhanceOwnerInterface(response, pathname = '/') {
  if (!['/', '/mvp', '/professor'].includes(pathname)) return response;
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;
  let html = await response.text();

  if (pathname === '/professor') {
    // Full mode alone uses the new generated MEL. Normal-mode theme portraits
    // are intentionally left untouched.
    html = html.replaceAll('/meliturgos-avatar-fille.png', '/assets/avatars/mel-full.webp');
  } else {
    if (!html.includes('mel-owner-approved-backgrounds')) {
      html = html.includes('</head>')
        ? html.replace('</head>', NORMAL_PAGE_STYLE + '</head>')
        : NORMAL_PAGE_STYLE + html;
    }
    if (!html.includes('mel-normal-page-cleanup')) {
      html = html.includes('</body>')
        ? html.replace('</body>', NORMAL_PAGE_CLEANUP + '</body>')
        : html + NORMAL_PAGE_CLEANUP;
    }
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    if (request.method !== 'GET') return response;
    return enhanceOwnerInterface(response, new URL(request.url).pathname);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};
