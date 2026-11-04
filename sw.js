/* Cultivar Agro: somente cache da interface, nunca de dados privados ou APIs. */
const CACHE='cultivar-shell-v2';
const SHELL=['./','./index.html','./offline.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]))});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||req.mode!=='navigate')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;
 event.respondWith(fetch(req).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy)).catch(()=>{})}return response}).catch(()=>caches.match('./index.html')));
});
