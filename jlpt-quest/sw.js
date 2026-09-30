const NAME='kotoba-course-0.4.1';
const CORE=[
 './src/tutorial.js','./src/tutorial-ui.js','./tutorial.css',
 './src/advanced-ui.js','./src/learning-policy.js','./src/study-data.js','./src/example-quality.js','./src/exam-engine.js','./src/playlist.js','./data/context040.js','./data/study040-seed.js',
 './','./index.html','./styles.css','./typography.css','./course.css','./snap.css','./release.css','./learning.css','./personal.css','./advanced.css',
 './icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest',
 './privacy.html','./terms.html','./licenses.html','./CONTENT-LICENSE.md',
 './src/kana-engine.js','./src/kana-ui.js','./src/examples.js','./src/reminders.js','./data/examples.json','./data/examples-expanded.json',
 './src/statistics.js','./src/statistics-ui.js','./src/word-practice.js','./src/practice-ui.js',
 './src/session-controls.js','./src/app.js','./src/fit-text.js','./src/commerce.js','./src/catalog.js','./src/course-engine.js','./src/storage.js','./src/packs.js',
 './src/native.js','./src/shape-grader.js','./src/audio.js','./src/ink.js','./src/view.js',
 './src/ui.js','./src/motion.js','./src/stroke-match.js','./src/stroke-bank.js','./src/stroke-pad.js',
 './data/starter.js','./data/strokes.json','./data/coverage.json',
 './data/N1.json','./data/N2.json','./data/N3.json','./data/N4.json','./data/N5.json',
 './data/licenses/KanjiVG-COPYING.txt'
];
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(NAME);
  await cache.addAll(CORE);
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
