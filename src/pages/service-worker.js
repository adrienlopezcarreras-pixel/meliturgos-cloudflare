export const SERVICE_WORKER_SOURCE = `
const CACHE='meliturgos-static-v6';
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting())});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING'||event.data?.type==='SKIP_WAITING')self.skipWaiting()});
async function staleWhileRevalidate(request){
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request);
  const network=fetch(request).then(response=>{
    if(response&&response.ok)cache.put(request,response.clone()).catch(()=>{});
    return response;
  }).catch(()=>null);
  if(cached){network.catch(()=>{});return cached}
  const response=await network;if(response)return response;throw new Error('STATIC_RESOURCE_UNAVAILABLE');
}
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/')||url.pathname==='/sw.js')return;
  if(request.mode==='navigate'||(request.headers.get('accept')||'').includes('text/html'))return;
  if(url.pathname.startsWith('/assets/')||url.pathname==='/normal-runtime.js')event.respondWith(staleWhileRevalidate(request));
});
`;
