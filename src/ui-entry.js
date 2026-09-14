import app from './learning-entry.js';

// Final owner-facing cleanup layer. Keep this deliberately small: the real UI
// lives below in the canonical page/enhancer modules. This wrapper only removes
// the obsolete normal-page recall control that older layers can still inject.
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
  if (!['/', '/mvp'].includes(pathname)) return response;
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;
  let html = await response.text();
  if (!html.includes('mel-normal-page-cleanup')) {
    html = html.includes('</body>')
      ? html.replace('</body>', NORMAL_PAGE_CLEANUP + '</body>')
      : html + NORMAL_PAGE_CLEANUP;
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
