import app from './learning-entry.js';

const OWNER_CONTRAST_STYLE = `<style id="mel-owner-contrast-fix">
html body,html body *{color:#000!important;text-shadow:none!important}
html body input::placeholder,html body textarea::placeholder{color:#000!important;opacity:1!important}
html body button,html body input[type="button"],html body input[type="submit"],html body .btn,html body [role="button"]{color:#000!important;background:#eadfcb!important;border-color:#2b2230!important}
html body button[id*="stop" i],html body button[class*="stop" i],html body [data-action*="stop" i]{background:#d71920!important;color:#000!important;border-color:#000!important}
html body a{color:#000!important;text-decoration-color:#000!important}
html body .mel-recall-last,#melRecallFull,#melRecallMvp{display:none!important}
</style>`;

const REMOVE_RECALL_SCRIPT = `<script id="mel-remove-recall-button">
(()=>{
  const removeRecall=()=>document.querySelectorAll('#melRecallFull,#melRecallMvp,.mel-recall-last').forEach(node=>node.remove());
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',removeRecall,{once:true}); else removeRecall();
  const observer=new MutationObserver(removeRecall);
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;

export async function enhanceOwnerInterface(response, pathname = '/') {
  if (!['/', '/mvp'].includes(pathname)) return response;
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;
  let html = await response.text();
  if (!html.includes('mel-owner-contrast-fix')) {
    html = html.includes('</head>')
      ? html.replace('</head>', OWNER_CONTRAST_STYLE + '</head>')
      : OWNER_CONTRAST_STYLE + html;
  }
  if (!html.includes('mel-remove-recall-button')) {
    html = html.includes('</body>')
      ? html.replace('</body>', REMOVE_RECALL_SCRIPT + '</body>')
      : html + REMOVE_RECALL_SCRIPT;
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
