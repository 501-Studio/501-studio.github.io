"""CI browser QA. Real navigation, Canvas, IndexedDB and device TTS adapter. No billing grants.
No authenticated browser/Play Console automation. Test adapters never ship with the app.
"""
import json,os,math,re,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba036-qa'));OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KOTOBA_TEST_URL','http://127.0.0.1:4173/')
BANK=json.loads((ROOT/'data/strokes.json').read_text())['characters'];checks=[];errors=[]
def check(name,ok):
 checks.append({'name':name,'pass':bool(ok)})
 if not ok:raise AssertionError(name)
def seed(page,word='おまわりさん',skill='audio'):
 page.evaluate('''async ({word,skill})=>{
 const E=await import('./src/course-engine.js'),C=await import('./src/catalog.js'),S=await import('./src/storage.js');await S.openStore();
 const existing=await S.loadState(),state=E.fresh();const all=(await Promise.all(['N5','N4','N3','N2','N1'].map(l=>fetch('./data/'+l+'.json').then(r=>r.json())))).flatMap(p=>p.words);
 const w=all.find(w=>w.level==='N5'&&w.word===word),c=C.courses(all,'N5').find(c=>c.wordIds.includes(w.id));state.session=E.createClass(state,c,all);
 if(skill==='survey')state.session.index=state.session.queue.findIndex(t=>t.wordId===w.id);
 else {while(E.current(state.session)?.phase==='survey'){const t=E.current(state.session);E.classifySurvey(state,t.id,t.wordId!==w.id,all);}state.session.index=state.session.queue.findIndex(t=>t.wordId===w.id&&t.skill===skill&&(skill==='meaning'||skill==='listening'||skill==='writing'?t.phase==='quiz':t.phase==='learn'));}
 await S.commit(state,existing.revision);
 }''',{'word':word,'skill':skill})
 page.goto(BASE+'#lesson',wait_until='domcontentloaded');page.reload(wait_until='domcontentloaded');page.wait_for_selector('.question',timeout=15000)
def fit_info(page):
 return page.locator('[data-fit-word]').first.evaluate('''e=>{const r=e.getBoundingClientRect();return {text:e.textContent,scroll:e.scrollWidth,host:e.parentElement.clientWidth,height:r.height,font:parseFloat(getComputedStyle(e).fontSize),nowrap:getComputedStyle(e).whiteSpace,x:r.x,y:r.y,width:r.width}}''')
def draw_fast(page,paths):
 box=page.locator('#ink-canvas').bounding_box();cdp=page.context.new_cdp_session(page)
 for line in paths:
  pts=[{'x':box['x']+x*box['width'],'y':box['y']+y*box['height'],'id':1} for x,y in line]
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[pts[0]]})
  for point in pts[1:]:cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[point]})
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 cdp.detach()
with sync_playwright() as P:
 b=P.chromium.launch(executable_path=os.environ.get('KOTOBA_CHROMIUM') or None,headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
 c=b.new_context(viewport={'width':390,'height':780},has_touch=True,device_scale_factor=2);c.add_init_script("window.__deviceTestSpeech=[];Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(t){this.text=t;}}});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'ja-JP',localService:true}],speak(u){window.__deviceTestSpeech.push(u.text);setTimeout(()=>u.onend?.(),50)},cancel(){}}});");p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
 try:
  p.goto(BASE);p.wait_for_selector('.level-progress-grid',timeout=15000)
  check('all five level summaries render',p.locator('.level-progress').count()==5)
  for width,height in [(320,740),(390,780),(412,846),(768,900),(1440,900)]:
   p.set_viewport_size({'width':width,'height':height});p.wait_for_timeout(100);check('home fits '+str(width),p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  p.set_viewport_size({'width':390,'height':780})
  seed(p,skill='survey');p.wait_for_timeout(180);a=fit_info(p);check('long survey word remains complete on one line',a['text']=='おまわりさん' and a['nowrap']=='nowrap' and a['scroll']<=a['host']+1)
  p.locator('[data-action="survey-meaning"]').click();p.wait_for_timeout(120);check('policeman meaning is corrected',p.locator('.survey-meaning').inner_text()=='경찰관, 순경');p.screenshot(path=str(OUT/'survey.png'))
  seed(p,skill='audio');p.wait_for_selector('[data-fit-word]');p.wait_for_timeout(200)
  for width,height in [(320,740),(390,780),(412,846),(768,900)]:
   p.set_viewport_size({'width':width,'height':height});p.wait_for_timeout(200);a=fit_info(p)
   check('listening Japanese one line '+str(width),a['scroll']<=a['host']+1 and a['text']=='おまわりさん')
   head=p.locator('.listening-headword').bounding_box();btn=p.locator('.audio-main').bounding_box();meaning=p.locator('.listening-stage .word-meaning').bounding_box()
   check('Japanese then speaker then meaning '+str(width),head['y']+head['height']<=btn['y']+1 and btn['y']+btn['height']<=meaning['y']+1)
   check('no vertical text squeezing '+str(width),meaning['width']>=width*.4 and p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  p.set_viewport_size({'width':390,'height':780});p.wait_for_timeout(200)
  check('speaker button has no visible text',p.locator('.audio-main').inner_text().strip()=='')
  check('speaker has accessible label',bool(p.locator('.audio-main').get_attribute('aria-label')))
  p.wait_for_function("()=>document.querySelector('[data-action=\"audio-done\"]')?.disabled===false",timeout=15000)
  check('device TTS adapter completes listening (not audibility)',not p.locator('[data-action="audio-done"]').is_disabled())
  check('autoplay debug message invisible',p.locator('#audio-status').bounding_box()['height']<=1)
  p.screenshot(path=str(OUT/'listening.png'))
  p.locator('[data-action="audio-done"]').click();p.wait_for_selector('#ink-canvas')
  check('first practice is labeled 1 of 3','1/3' in p.locator('.heading').inner_text())
  seed(p,'山','trace');p.locator('#ink-canvas').scroll_into_view_if_needed()
  draw_fast(p,BANK['山']);p.wait_for_function("()=>document.querySelector('#ink-canvas').dataset.accepted==='3'",timeout=5000)
  check('rapid consecutive strokes are not lost during snap animation',p.locator('#ink-canvas').get_attribute('data-accepted')=='3')
  check('completed word enables continuation',not p.locator('[data-action="ink-done"]').is_disabled());p.screenshot(path=str(OUT/'handwriting.png'))
  p.locator('[data-action="ink-done"]').click();p.wait_for_function("()=>document.querySelector('.heading')?.textContent.includes('2/3')",timeout=10000);check('second repetition before exam','2/3' in p.locator('.heading').inner_text())
  draw_fast(p,BANK['山']);p.wait_for_selector('[data-action="ink-done"]:not([disabled])');p.locator('[data-action="ink-done"]').click();p.wait_for_selector('#ink-canvas')
  p.wait_for_function("()=>document.querySelector('.heading')?.textContent.includes('3/3')",timeout=10000);check('third repetition is recall','3/3' in p.locator('.heading').inner_text() and '힌트 없이' in p.locator('.heading').inner_text())
  check('third practice no answer headword',p.locator('.ink-prompt p').inner_text()=='□')
  seed(p,'山','meaning');p.wait_for_selector('.answer-option')
  check('all four choices visible together',p.locator('.answer-option').count()==4)
  f=p.locator('.lesson-footer').bounding_box()['y'];rects=p.locator('.answer-option').evaluate_all('(els)=>els.map(e=>{const r=e.getBoundingClientRect();return {y:r.y,b:r.bottom}})');check('choices above submit footer',all(r['b']<=f+1 for r in rects))
  p.goto(BASE+'#home');p.locator('[data-action="settings"]:visible').first.click();p.wait_for_selector('.sheet');check('settings has no pack installation/download','다운로드' not in p.locator('.sheet').inner_text() and '내장 데이터' not in p.locator('.sheet').inner_text())
  p.locator('[data-action="premium"]').click();p.wait_for_selector('.premium-plans');check('three intended prices visible',all(x in p.locator('.premium-plans').inner_text() for x in ['1,800','9,000','14,000']))
  check('no purchase grant without Play and verifier',p.locator('[data-action^="purchase-"]:not([disabled])').count()==0)
  check('recurring terms and one-time distinction visible','자동 갱신' in p.locator('.subscription-disclosure').inner_text() and '일회성 구매' in p.locator('.subscription-disclosure').inner_text());p.screenshot(path=str(OUT/'premium.png'))
  p.locator('[data-action="close-modal"]').click();p.goto(BASE+'#words');p.wait_for_selector('#search');p.locator('#search').fill('おまわりさん');p.wait_for_timeout(120);check('wordbook uses corrected built-in meaning','경찰관, 순경' in p.locator('#word-results').inner_text())
  check('no browser JS errors',not errors)
  # Offline routes emulate AssetLoader; installed device TTS is mocked, never the grader.
  offline=b.new_context(viewport={'width':390,'height':780},has_touch=True,offline=True)
  offline.add_init_script("Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(t){this.text=t;}}});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'ja-JP',localService:true}],speak(u){setTimeout(()=>u.onend?.(),50)},cancel(){}}});")
  from urllib.parse import urlparse,unquote
  def local(route):
   u=urlparse(route.request.url);path=(ROOT/(unquote(u.path).lstrip('/') or 'index.html')).resolve()
   if not path.is_relative_to(ROOT) or not path.is_file():return route.fulfill(status=404,body='Not found')
   types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.ogg':'audio/ogg','.png':'image/png','.svg':'image/svg+xml'}
   route.fulfill(status=200,body=path.read_bytes(),content_type=types.get(path.suffix,'text/plain'))
  offline.route(BASE+'**',local);o=offline.new_page();o.goto(BASE);o.wait_for_selector('.level-progress-grid',timeout=10000);seed(o,skill='audio');o.wait_for_function("()=>document.querySelector('[data-action=\"audio-done\"]')?.disabled===false",timeout=15000)
  check('offline UI works with installed-device TTS adapter (not physical audio)',o.evaluate('navigator.onLine') is False)
  offline.close()
 except Exception:
  (OUT/'failure.txt').write_text(traceback.format_exc())
  try:
   p.screenshot(path=str(OUT/'failure.png'),full_page=True)
   (OUT/'failure-dom.html').write_text(p.content())
  except Exception: pass
  raise
 finally:
  (OUT/'browser-checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'scope':'Actual Chromium UI/Canvas/IndexedDB/audio; offline routes mimic Android asset loader. No physical Android, real Play purchase or real ad display claim.'},ensure_ascii=False,indent=2));b.close()
print(json.dumps(checks,ensure_ascii=False,indent=2))
