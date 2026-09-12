import { onRequestGet as renderMvp } from './mvp-interface.js';
import { enhanceMvpBehavior } from './mvp-behavior-enhancer.js';

export async function onRequestGet(context){
  let response=await renderMvp(context);
  response=await enhanceMvpBehavior(response);
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control','no-store, max-age=0');
  return new Response(await response.text(),{status:response.status,statusText:response.statusText,headers});
}
