"""First entry -> short help -> finish/skip -> settings replay, with real IndexedDB.
Browser plugin absent. Local Chromium download failed (EAI_AGAIN); CI Playwright
runs the actual UI. Speech requests are inspected, not physical audibility.
"""
from pathlib import Path
import json,os,traceback,time
from playwright.sync_api import sync_playwright
OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba041-qa'))/'tutorial041';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KOTOBA_TEST_URL','http://127.0.0.1:4173/')
checks=[];errors=[];console=[]
TTS="""window.__spoken=[];Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(t){this.text=t;}}});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'ja-JP',localService:true},{lang:'ko-KR',localService:true}],speak(u){window.__spoken.push(u.text);setTimeout(()=>{u.onstart?.();u.onend?.()},75)},cancel(){},addEventListener(){},removeEventListener(){}}});"""
def check(name,ok):
 checks.append({'name':name,'pass':bool(ok)})
 if not ok:raise AssertionError(name)
def step(p,n):p.wait_for_selector('.tutorial[data-step="'+str(n)+'"]')
def action(p,name):p.locator('[data-action="'+name+'"]').first.click();p.wait_for_timeout(100)
def help_state(p):return p.evaluate("async()=>{const S=await import('./src/storage.js');return S.loadTutorial();}")
def learning(p):return p.evaluate("async()=>{const S=await import('./src/storage.js');return S.rawState().then(s=>s||null);}")
def settings(p):p.locator('.appbar [data-action="settings"]').click();p.wait_for_selector('[data-action="tutorial-open"]')
def screenshot(p,name):p.screenshot(path=str(OUT/name),full_page=True)
def context(b,script=TTS):
 c=b.new_context(viewport={'width':390,'height':780},has_touch=True,device_scale_factor=2)
 if script:c.add_init_script(script)
 p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
 return c,p
with sync_playwright() as P:
 b=P.chromium.launch(headless=True,args=['--no-sandbox']);c,p=context(b)
 try:
  p.goto(BASE);step(p,0)
  check('correct app identity and meaningful home behind guide','코토바' in p.title() and p.url.startswith(BASE) and p.locator('.level-progress-grid').count()==1)
  check('no startup error overlay',p.locator('.fatal,vite-error-overlay,nextjs-portal').count()==0)
  check('first launch focuses guide title and blocks underlying input',p.evaluate("document.activeElement.id==='sheet-title' && document.querySelector('#app').inert"))
  check('dialog name and description point to existing text',p.locator('.sheet').get_attribute('aria-modal')=='true' and p.locator('.sheet').get_attribute('aria-describedby')=='tour-description')
  check('tour previews do not trigger automatic speech',p.evaluate('window.__spoken.length')==0)
  before=learning(p);screenshot(p,'first-launch.png')
  p.keyboard.press('Shift+Tab');check('reverse tab from heading stays inside guide',p.evaluate("document.activeElement.dataset.action==='tutorial-next'"))
  p.keyboard.press('Tab');check('tab wraps from last action to skip',p.evaluate("document.activeElement.dataset.action==='tutorial-skip'"))
  p.evaluate("document.querySelector('[data-action=\"start-course\"]').click()")
  check('even programmatic background click cannot start a lesson during tour',learning(p)==before and p.locator('.tutorial').count()==1)
  action(p,'tutorial-next');step(p,1);screenshot(p,'writing-help.png');action(p,'tutorial-next');step(p,2)
  check('next persists current help step',help_state(p)=={'version':1,'status':'active','step':2})
  action(p,'tutorial-previous');step(p,1);check('previous step is persisted',help_state(p)['step']==1)
  p.reload();step(p,1);check('interrupted first-run guide resumes on next launch',help_state(p)['status']=='active')
  action(p,'tutorial-next');action(p,'tutorial-next');action(p,'tutorial-next');step(p,4)
  check('last step has a start button',p.locator('[data-action="tutorial-finish"]').inner_text()=='시작하기')
  check('viewing every step does not change study record',learning(p)==before)
  action(p,'tutorial-finish');p.wait_for_selector('.tutorial',state='detached')
  check('complete is stored and home becomes usable',help_state(p)['status']=='completed' and not p.evaluate('document.querySelector("#app").inert'))
  p.reload();p.wait_for_selector('.level-progress-grid');check('completed guide is not auto-shown again',p.locator('.tutorial').count()==0)
  settings(p);screenshot(p,'settings-replay.png');action(p,'tutorial-open');step(p,0)
  check('settings replay always starts at step one',p.locator('.tutorial').get_attribute('data-replay')=='true')
  action(p,'tutorial-next');p.keyboard.press('Escape');p.wait_for_selector('[data-action="tutorial-open"]')
  check('Escape returns to settings and restores button focus',p.evaluate("document.activeElement.dataset.action==='tutorial-open'") and p.locator('.tutorial').count()==0)
  check('replay does not downgrade completed preference',help_state(p)['status']=='completed')
  action(p,'tutorial-open');step(p,0);p.evaluate("window.dispatchEvent(new Event('kotoba-back'))")
  check('Android back event closes replay into settings',p.locator('[data-action="tutorial-open"]').count()==1 and p.locator('.tutorial').count()==0)
  action(p,'tutorial-open')
  for width,height in [(320,640),(360,680),(390,780),(412,846),(740,360),(1440,950)]:
   p.set_viewport_size({'width':width,'height':height});p.wait_for_timeout(90)
   check(f'guide has no horizontal overflow at {width}x{height}',p.evaluate('document.documentElement.scrollWidth<=innerWidth+1') and p.locator('.tutorial').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
   box=p.locator('.tour-footer').bounding_box();check(f'navigation stays in viewport at {width}x{height}',box['y']>=0 and box['y']+box['height']<=height+1)
   if width in [320,1440]:screenshot(p,f'tutorial-{width}.png')
  p.set_viewport_size({'width':320,'height':640});p.add_style_tag(content='.tour-content h2{font-size:40px}.tour-content>p{font-size:26px}')
  box=p.locator('.tour-footer').bounding_box();check('enlarged text scrolls without covering navigation',box['y']+box['height']<=641 and p.locator('.tour-content').evaluate('e=>e.scrollHeight>e.clientHeight'))
  action(p,'tutorial-skip');action(p,'close-modal');c.close()
  c,p=context(b);p.goto(BASE);step(p,0);action(p,'tutorial-skip')
  check('skip is stored without a learning record',help_state(p)['status']=='skipped' and learning(p) is None)
  p.reload();p.wait_for_selector('.level-progress-grid');check('skipped guide does not return next launch',p.locator('.tutorial').count()==0)
  # Preserve a realistic previous-version main/review/XP record. Clear only help preference.
  p.evaluate("""async()=>{const E=await import('./src/course-engine.js'),S=await import('./src/storage.js');const all=(await fetch('./data/N5.json').then(r=>r.json())).words;const old=await S.loadState(),s=E.fresh(),w=all.find(w=>w.word==='学校');s.xp=71;s.known[w.id]=Date.now();s.session=E.createTargetReview(s,all,[{wordId:w.id,skill:'meaning'}]);s.suspendedSession=E.createTargetReview(s,all,[{wordId:w.id,skill:'writing'}]);s.uiRoute='lesson';await S.commit(s,old.revision);await new Promise((resolve,reject)=>{const r=indexedDB.open('kotoba-learning-v3',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readwrite');tx.objectStore('state').delete('tutorial-v1');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});}""")
  p.goto(BASE+'#lesson');p.wait_for_selector('.answer-option');p.wait_for_timeout(250)
  check('upgrading never interrupts an existing lesson with first-run help',p.locator('.tutorial').count()==0)
  p.goto(BASE+'#home');step(p,0);before=learning(p);action(p,'tutorial-skip')
  check('deferred home help preserves saved lesson review and XP',learning(p)==before and before['xp']==71 and before['suspendedSession'] is not None)
  settings(p);action(p,'tutorial-open');step(p,0);action(p,'tutorial-next');action(p,'tutorial-skip')
  check('settings replay does not touch any saved learning field',learning(p)==before)
  action(p,'close-modal')
  result=p.evaluate("async()=>{const S=await import('./src/storage.js');await S.storeTutorial({version:1,status:'completed',step:4});await S.storeTutorial({version:1,status:'active',step:1});return S.loadTutorial();}")
  check('transactional stale-tab protection preserves completion',result['status']=='completed')
  c.close()
  c,p=context(b,TTS+"const originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(key==='tutorial-v1')throw new DOMException('Help preference quota','QuotaExceededError');return originalPut.call(this,value,key);};")
  p.goto(BASE);step(p,0);p.wait_for_selector('.tour-storage-status:not(:empty)')
  check('help storage failure is explained without corrupting study state','저장하지 못했습니다' in p.locator('.tour-storage-status').inner_text() and learning(p) is None)
  action(p,'tutorial-skip');p.locator('[data-action="start-course"]').first.click();p.wait_for_selector('.survey-card')
  check('study remains usable when only help preference writes fail',learning(p)['session'] is not None)
  c.close()
  # Actual service-worker caching: guide resources survive a real offline reload.
  c,p=context(b);p.goto(BASE);step(p,0)
  p.evaluate("async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;}")
  p.reload();step(p,0);c.set_offline(True);p.reload();step(p,0)
  check('guide renders from service-worker cache while offline',p.evaluate('navigator.onLine') is False)
  action(p,'tutorial-next');step(p,1);check('offline steps still save locally',help_state(p)['step']==1)
  check('no runtime JavaScript errors',not errors)
  check('no console errors',not console)
 except Exception:
  (OUT/'failure.txt').write_text(traceback.format_exc());p.screenshot(path=str(OUT/'failure.png'),full_page=True);(OUT/'failure.html').write_text(p.content());raise
 finally:
  (OUT/'checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'console':console,'browser':'Chromium','viewports':['320x640','360x680','390x780','412x846','740x360','1440x950'],'physicalVoiceAudibilityVerified':False},ensure_ascii=False,indent=2));b.close()
print('Tutorial checks',len(checks))
