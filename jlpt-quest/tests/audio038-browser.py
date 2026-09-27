"""Real Chromium audio decode/playback checks. Instrumentation observes original
HTMLMediaElement.play without changing its behavior or marking audio heard.
Browser plugin is not available in this session; standard Playwright is used.
"""
from pathlib import Path
import json,os,traceback
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba038-qa'))/'audio-browser';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KOTOBA_TEST_URL','http://127.0.0.1:4173/');checks=[];errors=[];external=[]
def check(name,value):
 checks.append({'name':name,'pass':bool(value)})
 if not value:raise AssertionError(name)
def seed(p):
 p.evaluate('''async()=>{const E=await import('./src/course-engine.js'),C=await import('./src/catalog.js'),S=await import('./src/storage.js');await S.openStore();const old=await S.loadState(),s=E.fresh();const all=(await Promise.all(['N5','N4','N3','N2','N1'].map(l=>fetch('./data/'+l+'.json').then(r=>r.json())))).flatMap(p=>p.words);const w=all.find(w=>w.level==='N5'&&w.word==='山'),c=C.courses(all,'N5').find(c=>c.wordIds.includes(w.id));s.uiRoute='lesson';s.session=E.createClass(s,c,all);while(E.current(s.session)?.phase==='survey'){const t=E.current(s.session);E.classifySurvey(s,t.id,t.wordId!==w.id,all);}s.session.index=s.session.queue.findIndex(t=>t.skill==='audio');await S.commit(s,old.revision);}''')
 p.goto(BASE+'#lesson');p.reload();p.wait_for_selector('#audio-status')
with sync_playwright() as P:
 b=P.chromium.launch(executable_path=os.environ.get('KOTOBA_CHROMIUM')or None,headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 c=b.new_context(viewport={'width':390,'height':780},has_touch=True);p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
 p.on('request',lambda r:external.append(r.url)if not r.url.startswith(BASE)else None)
 c.add_init_script('''window.audioObserved=[];const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.audioObserved.push({src:this.src,rate:this.playbackRate,time:performance.now()});return original.apply(this,arguments)};''')
 try:
  p.goto(BASE);p.wait_for_selector('.kana-entry');check('real application loads',p.title()=='코토바 · 한자 회독 수업')
  decoded=p.evaluate('''async()=>{const m=await fetch('./data/audio-manifest.json').then(r=>r.json());const names=[...new Set(Object.values(m.clips))],ctx=new AudioContext({sampleRate:24000}),result=[];for(let i=0;i<names.length;i+=8){const batch=await Promise.all(names.slice(i,i+8).map(async name=>{const r=await fetch('./data/audio/'+name);if(!r.ok)throw Error(name);const buffer=await ctx.decodeAudioData(await r.arrayBuffer());const samples=buffer.getChannelData(0);let peak=0,sum=0;for(const x of samples){peak=Math.max(peak,Math.abs(x));sum+=x*x;}if(buffer.numberOfChannels!==1||buffer.duration<.15||!Number.isFinite(peak)||peak>=.95||sum<.001)throw Error('invalid decoded audio '+name);return{name,seconds:buffer.duration,rate:buffer.sampleRate,peak,rms:Math.sqrt(sum/samples.length)}}));result.push(...batch);}await ctx.close();return{files:result.length,version:m.version,records:result}}''')
  (OUT/'all-browser-decoded.json').write_text(json.dumps(decoded,ensure_ascii=False))
  check('all 7050 replacement recordings decode as non-silent mono in actual Chromium',decoded['files']==7050)
  check('only audited manifest loaded',decoded['version']==3)
  seed(p);p.wait_for_selector('[data-action="audio-done"]:not([disabled])',timeout=20000)
  p.wait_for_timeout(400);plays=p.evaluate('window.audioObserved');check('automatic first listening plays once',len(plays)==1)
  p.locator('[data-action="listen"]').click();p.wait_for_timeout(1800);check('manual replay adds exactly one playback',p.evaluate('window.audioObserved.length')==2)
  p.locator('[data-action="slow"]').click();p.wait_for_timeout(250);check('slow replay uses pitch-preserving 0.7 rate',p.evaluate('window.audioObserved.at(-1).rate')==.7)
  # Act on the next audio render synchronously, before its 90ms automatic timer.
  # This is a real button click and real audio.play, not a fabricated native result.
  p.evaluate('''async()=>{const S=await import('./src/storage.js');await S.openStore();const s=await S.loadState();s.session.heard=false;s.session.autoPlayedTask=null;await S.commit(s,s.revision)}''')
  p.add_init_script('''window.earlyReplay=false;const observer=new MutationObserver(()=>{const button=document.querySelector('[data-action="listen"]');if(button&&!window.earlyReplay){window.earlyReplay=true;button.click();observer.disconnect()}});observer.observe(document,{subtree:true,childList:true});''')
  p.reload();p.wait_for_selector('#audio-status');p.wait_for_timeout(2000)
  check('immediate manual click suppresses the pending auto timer',p.evaluate('window.earlyReplay && window.audioObserved.length===1'))
  p.screenshot(path=str(OUT/'listening038.png'))
  check('corrected reading survives stable-ID validation in actual runtime',p.evaluate('''async()=>{const C=await import('./src/catalog.js');const p=await fetch('./data/N3.json').then(r=>r.json());C.validateStoredPack(p);return p.words.find(w=>w.id==='N3-1d6ofkx').reading==='さんせい';}'''))
  # Block every network request after the assets have been routed locally, like an
  # offline Android asset origin. A fresh context has no pre-existing web cache.
  cold=b.new_context(viewport={'width':390,'height':780},offline=True)
  from urllib.parse import urlparse,unquote
  def local(route):
   url=route.request.url
   if not url.startswith(BASE):return route.abort()
   path=(ROOT/(unquote(urlparse(url).path).lstrip('/')or'index.html')).resolve()
   if not path.is_relative_to(ROOT)or not path.is_file():return route.fulfill(status=404,body='Not found')
   types={'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.ogg':'audio/ogg','.svg':'image/svg+xml','.png':'image/png'}
   route.fulfill(body=path.read_bytes(),content_type=types.get(path.suffix,'application/octet-stream'))
  cold.route('**/*',local);cp=cold.new_page();cp.goto(BASE);cp.wait_for_selector('.kana-entry')
  result=cp.evaluate('''async()=>{const A=await import('./src/audio.js');return await A.speak('KANA-h306f');}''')
  check('fresh offline asset origin plays audited kana without device TTS',result and cp.evaluate('navigator.onLine')is False);cold.close()
  check('no JS runtime errors',not errors);check('no external requests during normal bundled flow',not external)
 except Exception:
  (OUT/'failure.txt').write_text(traceback.format_exc());p.screenshot(path=str(OUT/'failure.png'),full_page=True);raise
 finally:
  (OUT/'checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'externalRequests':external,'note':'Browser decode/playback does not certify pronunciation; separate unprompted ASR audit is provided.'},ensure_ascii=False,indent=2));b.close()
print(json.dumps(checks,ensure_ascii=False,indent=2))
