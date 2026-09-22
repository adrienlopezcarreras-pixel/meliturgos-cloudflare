import app from './ui-entry.js';
import { HD_BACKGROUNDS } from './assets/generated/hd-backgrounds.js';

const FULL_AVATAR_DATA_URL = '/assets/avatars/mel-full.webp';
function withHead(html, fragment) {
  return html.includes('</head>') ? html.replace('</head>', `${fragment}</head>`) : fragment + html;
}

const FULL_STYLE = `<style id="mel-full-release-fix">
html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
html body{background-image:linear-gradient(180deg,rgba(2,7,18,.24),rgba(2,8,18,.48)),url("${HD_BACKGROUNDS.control}")!important;background-size:cover,cover!important;background-position:center,center!important;background-repeat:no-repeat!important;background-attachment:fixed!important}
.sidebar{background:rgba(3,9,18,.76)!important}.card{background:linear-gradient(180deg,rgba(20,32,52,.90),rgba(8,18,34,.84))!important;backdrop-filter:blur(12px)}
.brand img,.hero img{display:block!important;object-fit:cover!important;object-position:center 28%!important;background:#07111f!important;transform:none!important;transform-origin:center!important;border-radius:50%!important;overflow:hidden!important}
.brand img{width:58px!important;height:58px!important;min-width:58px!important;min-height:58px!important;max-width:58px!important;max-height:58px!important}
.hero img{width:126px!important;height:126px!important;min-width:126px!important;min-height:126px!important;max-width:126px!important;max-height:126px!important}
.brand img~img,.hero img~img{display:none!important}
.mel-live-explanation{margin-top:7px;color:#dbeafe;line-height:1.45;font-size:.92rem}.mel-live-narrative{margin:0 0 12px;padding:12px 14px;border:1px solid rgba(96,165,250,.20);border-radius:14px;background:rgba(4,15,30,.62);color:#e0f2fe;line-height:1.45}.mel-live-narrative strong{color:#7dd3fc}
@media(max-width:1200px){html body{background-attachment:scroll!important}.shell{display:block!important}.sidebar{position:fixed!important;z-index:100!important;left:0!important;right:0!important;top:auto!important;bottom:0!important;width:100%!important;height:auto!important;border-right:0!important;border-top:1px solid var(--line)!important;padding:7px 7px calc(7px + env(safe-area-inset-bottom))!important}.main{margin-left:0!important;width:100%!important;padding:18px 11px calc(104px + env(safe-area-inset-bottom))!important}.brand,.home{display:none!important}.nav{display:flex!important;overflow-x:auto!important;gap:4px!important}.nav button{min-width:84px!important;flex:0 0 auto!important;flex-direction:column!important;text-align:center!important;font-size:.70rem!important;padding:7px!important}.top{width:100%!important}.card,.card.third,.card.wide{grid-column:1/-1!important}.hero{grid-template-columns:94px minmax(0,1fr)!important}.hero img{width:90px!important;height:90px!important;min-width:90px!important;min-height:90px!important;max-width:90px!important;max-height:90px!important}}
</style>`;

async function enhance(response, pathname) {
  if (pathname !== '/professor') return response;
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;

  let html = await response.text();
  html = html.replaceAll('src="/meliturgos-avatar-fille.png"', `src="${FULL_AVATAR_DATA_URL}"`);
  html = html.replaceAll('src="/assets/avatars/mel-full.webp"', `src="${FULL_AVATAR_DATA_URL}"`);
  html = withHead(html, FULL_STYLE);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control','no-store, no-cache, must-revalidate');
  headers.set('pragma','no-cache');
  headers.set('expires','0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    if (request.method !== 'GET') return response;
    return enhance(response, new URL(request.url).pathname);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};
