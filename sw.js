/* Cultivar Agro: cache da interface, nunca de APIs ou dados privados. */
const CACHE='cultivar-shell-v5';
const SHELL=['./','./index.html','./offline.js','./manifest.webmanifest','./icons/cultivar.svg','./Cultivar_logo.png'];
const LIBS=['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js','https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await cache.addAll(SHELL);
 await Promise.all(LIBS.map(url=>cache.add(new Request(url,{mode:'cors'}))));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await Promise.all((await caches.keys()).filter(k=>k.startsWith('cultivar-shell-')&&k!==CACHE).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);
 const local=url.origin===self.location.origin;
 if(local&&req.mode==='navigate'){
 event.respondWith((async()=>{const c=await caches.open(CACHE);try{const r=await fetch(req);if(r.ok&&r.headers.get('content-type')?.includes('text/html'))await c.put('./index.html',r.clone());return r}catch(e){return await c.match('./index.html')||Response.error()}})());return;
 }
 const asset=LIBS.includes(req.url)||(local&&SHELL.some(p=>new URL(p,self.registration.scope).pathname===url.pathname));
 if(asset)event.respondWith((async()=>{const c=await caches.open(CACHE);try{const r=await fetch(req);if(r.ok||r.type==='opaque')await c.put(req,r.clone());return r}catch(e){return await c.match(req,{ignoreSearch:true})||Response.error()}})());
});
