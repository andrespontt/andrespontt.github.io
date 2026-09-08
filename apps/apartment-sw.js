const CACHE_NAME = 'apartment-v8';
const ASSETS = ['./apartment.html','./apartment/style.css','./apartment/world.js','./apartment/game.js','./apartment/simulation.js','./apartment-manifest.json','../assets/icons/icon.svg','./vendor/three.module.min.js'];
const urls = new Set(ASSETS.map(path => new URL(path, self.location).href));
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('apartment-')&&name!==CACHE_NAME).map(name=>caches.delete(name)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!urls.has(event.request.url))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(async()=>await caches.match(event.request)||Response.error()));
});
