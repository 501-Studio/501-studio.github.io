"""Flow: first launch -> five-step tour -> close -> settings replay, preserving study state.
Browser plugin absent; real Playwright Chromium. No production onboarding bypass.
"""
from pathlib import Path
import os,json,traceback,time
from playwright.sync_api import sync_playwright
OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba041-qa'))/'tutorial041';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KOTOBA_TEST_URL','http://127.0.0.1:4173/');checks=[];errors=[];console=[];requests=[]
TTS="""window.__spoken=[];Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(t){this.text=t;}}});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'ja-JP',localService:true}],speak(u){window.__spoken.push(u.text);setTimeout(()=>u.onend?.(),60);},cancel(){}}});"""
def check(name,value):
 checks.append({'name':name,'pass':bool(value)})
 if not value:raise AssertionError(name)
def state(p):return p.evaluate("async()=>{const S=await import('./src/storage.js');return S.loadState();}")
def stable(s):return {k:v for k,v in s.items() if k not in ['revision','tutorial']}
def tour(p):return p.locator('#function-tutorial[open]')
def click(p,a):
 tour(p).locator('[data-tour-action="'+a+'"]').click();p.wait_for_timeout(120)
def title(p):return tour(p).locator('#tour-title').inner_text()
def shot(p,n):p.screenshot(path=str(OUT/n),full_page=False)
def ready(p):p.wait_for_selector('#function-tutorial[open][aria-busy="false"]')
with sync_playwright() as P:
 b=P.chromium.launch(executable_path=os.environ.get('KOTOBA_CHROMIUM') or None,headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':390,'height':780},has_touch=True);c.add_init_script(TTS);p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.on('console',lambda m:console.append(m.text) if m.type=='error' else None);p.on('request',lambda r:requests.append(r.url))
 try:
  p.goto(BASE);ready(p)
  check('correct page, nonblank home behind real first-run tutorial','코토바' in p.title() and p.locator('.level-progress-grid').count()==1 and tour(p).count()==1)
  check('no framework or fatal error overlay',p.locator('.fatal,vite-error-overlay').count()==0)
  check('first step describes home and curriculum','급수' in title(p));baseline=stable(state(p));shot(p,'first-launch.png')
  tour(p).locator('[data-tour-demo="known"]').click();check('demo reports no real learning writes','실제 기록은 저장하지 않았습니다' in p.locator('#tour-demo-status').inner_text());check('demo cannot classify or award XP',stable(state(p))==baseline)
  for _ in range(9):p.keyboard.press('Tab')
  check('keyboard focus stays within dialog',p.evaluate("document.activeElement.closest('#function-tutorial')!==null"))
  click(p,'next');check('next shows writing and one-time speech guidance','한 글자' in title(p));click(p,'prev');check('previous returns to first step','급수' in title(p))
  tour(p).locator('[data-tour-step="2"]').click();p.wait_for_timeout(150);check('step dots navigate and persist',state(p)['tutorial']['step']==2)
  p.reload();ready(p);check('interrupted guide resumes after reload',state(p)['tutorial']['step']==2 and '복습' in title(p))
  check('tutorial does not speak unsolicited demo audio',p.evaluate('window.__spoken.length')==0)
  click(p,'next');check('wordbook step explains repeat count','1~20' in tour(p).inner_text());click(p,'next');check('last step includes intensity backup and replay','백업' in tour(p).inner_text() and '튜토리얼 다시 보기' in tour(p).inner_text());shot(p,'last-step.png');click(p,'next')
  check('finish closes without starting or modifying a lesson',tour(p).count()==0 and stable(state(p))==baseline and state(p)['tutorial']['status']=='completed')
  p.reload();p.wait_for_selector('.level-progress-grid');p.wait_for_timeout(200);check('completed guide not shown on next launch',tour(p).count()==0)
  p.locator('.appbar [data-action="settings"]').click();p.locator('[data-action="tutorial-start"]').scroll_into_view_if_needed();shot(p,'settings-entry.png');p.locator('[data-action="tutorial-start"]').click();ready(p)
  check('settings replay starts from step one','급수' in title(p));before=state(p)['tutorial'];click(p,'next');check('replay does not undo first-run completion',state(p)['tutorial']==before)
  p.keyboard.press('Escape');p.wait_for_selector('#sheet-title');check('escape returns to settings and restores acknowledged state',tour(p).count()==0 and p.locator('#sheet-title').inner_text()=='설정' and state(p)['tutorial']==before)
  p.locator('[data-action="tutorial-start"]').click();ready(p);p.evaluate("window.dispatchEvent(new CustomEvent('kotoba-back'))");p.wait_for_selector('#sheet-title');check('Android back dismisses only tour and returns to settings',tour(p).count()==0 and p.locator('#sheet-title').inner_text()=='설정' and p.locator('[data-action="confirm-reset"]').count()==0)
  p.locator('[data-action="close-modal"]').click()
  p.evaluate("""async()=>{const S=await import('./src/storage.js'),E=await import('./src/course-engine.js');const s=await S.loadState(),words=(await fetch('./data/N5.json').then(r=>r.json())).words,w=words.find(w=>w.word==='学校');s.xp=245;s.known[w.id]=Date.now();s.memory[E.keyOf(w.id,'meaning')]=E.schedule(null,true,'prior',Date.now());s.session=E.createTargetReview(s,words,[{wordId:w.id,skill:'meaning'}]);s.session.selection=w.meaning;s.session.contentRevision='036-editorial-1';s.session.queue[0].autoSpeech=1;s.uiRoute='home';delete s.tutorial;await S.commit(s,s.revision);}""")
  p.goto(BASE+'#home');ready(p);snapshot=stable(state(p));click(p,'skip');check('skip on upgraded data preserves session answers and SRS',stable(state(p))==snapshot and state(p)['tutorial']['status']=='skipped')
  p.reload();p.wait_for_selector('.level-progress-grid');p.wait_for_timeout(150);check('skip is persisted across app restart',tour(p).count()==0)
  p.goto(BASE+'#words');p.wait_for_selector('.wordbook-item');p.locator('.appbar [data-action="settings"]').click();p.locator('[data-action="tutorial-start"]').click();ready(p)
  for width,height in [(320,640),(360,680),(390,780),(412,846),(1440,950),(640,360)]:
   p.set_viewport_size({'width':width,'height':height})
   for step in [0,1,4]:
    tour(p).locator('[data-tour-step="'+str(step)+'"]').click();p.wait_for_timeout(90)
    box=tour(p).bounding_box();nextbox=tour(p).locator('[data-tour-action="next"]').bounding_box()
    check(f'{width}x{height} step {step+1}: frame and navigation remain on-screen',box['x']>=-1 and box['y']>=-1 and box['x']+box['width']<=width+1 and box['y']+box['height']<=height+1 and nextbox['y']+nextbox['height']<=height+1)
    check(f'{width}x{height} step {step+1}: no horizontal clipping',tour(p).evaluate('(e)=>e.scrollWidth<=e.clientWidth+1') and p.locator('.tour-body').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'))
   shot(p,f'layout-{width}x{height}.png')
  p.set_viewport_size({'width':390,'height':780});p.emulate_media(reduced_motion='reduce');check('reduced motion does not prevent navigation',tour(p).locator('[data-tour-action="next"]').is_enabled());click(p,'skip');check('closing preserves wordbook route',p.url.endswith('#words') and p.locator('#sheet-title').inner_text()=='설정')
  with p.expect_download() as d:p.locator('[data-action="export"]').click()
  backup=json.loads(Path(d.value.path()).read_text());check('actual exported backup preserves tutorial and original session',backup['state']['tutorial']['status']=='skipped' and backup['state']['session']['id']==snapshot['session']['id'])
  p.locator('[data-action="close-modal"]').click()
  p.evaluate("async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;}")
  p.reload();p.wait_for_selector('.wordbook-item');c.set_offline(True);p.reload();p.wait_for_selector('.wordbook-item');p.locator('.appbar [data-action="settings"]').click();p.locator('[data-action="tutorial-start"]').click();ready(p);check('offline reload and replay use cached assets',p.evaluate('navigator.onLine') is False and '급수' in title(p));click(p,'skip');c.set_offline(False)
  check('no runtime JavaScript errors',not errors);check('no console errors',not console);check('no prerecorded audio requests',not any('/data/audio/' in r for r in requests))
 except Exception:
  (OUT/'failure.txt').write_text(traceback.format_exc())
  try:shot(p,'failure.png');(OUT/'failure.html').write_text(p.content())
  except Exception as error:(OUT/'capture-error.txt').write_text(str(error))
  raise
 finally:
  (OUT/'checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'console':console,'physicalAudioVerified':False},ensure_ascii=False,indent=2));b.close()
print('Tutorial checks',len(checks))
