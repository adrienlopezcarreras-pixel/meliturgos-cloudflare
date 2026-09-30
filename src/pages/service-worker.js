export const SERVICE_WORKER_SOURCE = `
const CACHE='meliturgos-static-v8';\nconst PRECACHE=['/normal-runtime.js','/assets/avatars/mel-full.webp?v=mel-techno-20260924'];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const url of PRECACHE){try{const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});if(response&&response.ok)await cache.put(url,response.clone())}catch{}}await self.skipWaiting()})())});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING'||event.data?.type==='SKIP_WAITING')self.skipWaiting()});
async function staleWhileRevalidate(request,event){
  const update=(async()=>{
    const cache=await caches.open(CACHE);
    const response=await fetch(request);
    if(response&&response.ok)await cache.put(request,response.clone());
    return response;
  })();
  event.waitUntil(update.then(()=>{}).catch(()=>{}));
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request);
  if(cached)return cached;
  const response=await update;
  if(response)return response;
  throw new Error('STATIC_RESOURCE_UNAVAILABLE');
}
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/')||url.pathname==='/sw.js'||url.pathname==='/manifest.webmanifest')return;
  if(request.mode==='navigate'||(request.headers.get('accept')||'').includes('text/html'))return;
  if(url.pathname.startsWith('/assets/')||url.pathname==='/normal-runtime.js')event.respondWith(staleWhileRevalidate(request,event));
});
`;
