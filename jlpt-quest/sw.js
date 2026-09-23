const CACHE='kotoba-quest-v0.1.0';
const FILES=['./','./index.html','./styles.css','./icon.svg','./icon-192.png','./manifest.webmanifest','./src/app.js','./src/engine.js','./src/content.js','./src/ui.js','./src/audio.js','./src/handwriting.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));});
// No skipWaiting: a newer shell must not replace a live lesson mid-session.
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('kotoba-quest-')&&key!==CACHE).map(key=>caches.delete(key)))));});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
  if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  event.respondWith(fetch(request).then(response=>{if(response.ok&&FILES.some(path=>new URL(path,self.registration.scope).pathname===url.pathname)){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));}return response;}).catch(async()=>{const cached=await caches.match(request);if(cached)return cached;if(request.mode==='navigate')return caches.match(new URL('./index.html',self.registration.scope));throw new Error('Offline resource unavailable');}));
});
