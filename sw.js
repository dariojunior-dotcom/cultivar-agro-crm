/* Cultivar Agro: somente cache da interface, nunca de dados privados ou APIs. */
const CACHE='cultivar-shell-v3';
const SHELL=['./','./index.html','./offline.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]))});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const asset=req.url.includes('unpkg.com/leaflet@1.9.4/dist/leaflet.')||req.url.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
 if(asset){event.respondWith(caches.open(CACHE).then(async cache=>{try{const response=await fetch(req);if(response.ok||response.type==='opaque')cache.put(req,response.clone()).catch(()=>{});return response}catch(e){const cached=await cache.match(req);if(cached)return cached;throw e}}));return}
 if(req.mode!=='navigate')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;
 event.respondWith(fetch(req).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy)).catch(()=>{})}return response}).catch(()=>caches.match('./index.html')));
});
