const NAME='kotoba-course-0.3.3';
const FILES=['./','./index.html','./styles.css','./typography.css','./course.css','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest','./privacy.html','./snap.css','./data/strokes.json','./data/licenses/KanjiVG-COPYING.txt','./src/stroke-match.js','./src/stroke-bank.js','./src/stroke-pad.js','./src/app.js','./src/catalog.js','./src/course-engine.js','./src/storage.js','./src/packs.js','./src/native.js','./src/shape-grader.js','./src/audio.js','./src/ink.js','./src/view.js','./src/ui.js','./src/motion.js','./data/starter.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(NAME).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kotoba-course-')&&k!==NAME).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{const url=new URL(e.request.url),scope=new URL(self.registration.scope);if(e.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).catch(()=>e.request.mode==='navigate'?caches.match(new URL('index.html',scope)):new Response('Offline',{status:503}))));
});
