const NAME='kotoba-course-0.3.5';
const CORE=[
 './','./index.html','./styles.css','./typography.css','./course.css','./snap.css',
 './icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest',
 './privacy.html','./terms.html','./licenses.html','./CONTENT-LICENSE.md',
 './src/app.js','./src/catalog.js','./src/course-engine.js','./src/storage.js','./src/packs.js',
 './src/native.js','./src/shape-grader.js','./src/audio.js','./src/ink.js','./src/view.js',
 './src/ui.js','./src/motion.js','./src/stroke-match.js','./src/stroke-bank.js','./src/stroke-pad.js',
 './data/starter.js','./data/strokes.json','./data/coverage.json','./data/audio-manifest.json',
 './data/N1.json','./data/N2.json','./data/N3.json','./data/N4.json','./data/N5.json',
 './data/licenses/KanjiVG-COPYING.txt'
];
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(NAME);
  await cache.addAll(CORE);
  const manifest=await fetch(new URL('./data/audio-manifest.json',self.registration.scope)).then(r=>r.json());
  const audio=[...new Set(Object.values(manifest.clips||{}))].map(name=>'./data/audio/'+name);
  for(let i=0;i<audio.length;i+=180)await cache.addAll(audio.slice(i,i+180));
 })());
});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kotoba-course-')&&k!==NAME).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url),scope=new URL(self.registration.scope);
 if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
   if(response.ok){const copy=response.clone();event.waitUntil(caches.open(NAME).then(c=>c.put(event.request,copy)));}return response;
 }).catch(()=>event.request.mode==='navigate'?caches.match(new URL('index.html',scope)):new Response('Offline',{status:503}))));
});
