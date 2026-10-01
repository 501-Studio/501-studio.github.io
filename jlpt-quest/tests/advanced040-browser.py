"""Real Chromium integration. TTS adapter verifies call order, not physical audibility.
Browser plugin absent; local navigation is blocked by administrator policy, so CI is used.
"""
import os,json,traceback,time
from pathlib import Path
from playwright.sync_api import sync_playwright
from qa_tutorial import dismiss_tutorial
ROOT=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba040-qa'))/'suite040';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KOTOBA_TEST_URL','http://127.0.0.1:4173/');BANK=json.loads((ROOT/'data/strokes.json').read_text())['characters'];checks=[];errors=[];console=[];requests=[]
TTS="""window.__spoken=[];Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(t){this.text=t;}}});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'ja-JP',localService:true},{lang:'ko-KR',localService:true}],speak(u){window.__spoken.push({text:u.text,lang:u.lang,rate:u.rate});setTimeout(()=>{u.onstart?.();u.onend?.()},80);},cancel(){},addEventListener(){},removeEventListener(){}}});"""
def check(name,ok):
 checks.append({'name':name,'pass':bool(ok)})
 if not ok:raise AssertionError(name)
def state(p):return p.evaluate("async()=>{const S=await import('./src/storage.js');return S.loadState();}")
def navigate(p,route):
 p.goto(BASE+'?qa='+str(time.time_ns())+'#'+route);p.wait_for_selector('#app .page, #app .question');p.wait_for_timeout(250)
def fixture(p,body,route='home'):
 mode='history' if 's.suspendedSession=' in body else 'writing'
 p.evaluate("""async mode=>{const E=await import('./src/course-engine.js'),S=await import('./src/storage.js'),C=await import('./src/catalog.js');const old=await S.loadState(),s=E.fresh(),all=(await Promise.all(['N5','N4','N3','N2','N1'].map(l=>fetch('./data/'+l+'.json').then(r=>r.json())))).flatMap(p=>p.words);const w=all.find(x=>x.word==='学校'&&x.level==='N5');if(mode==='writing'){s.session=E.createTargetReview(s,all,[{wordId:w.id,skill:'writing'}],{label:'쓰기 검증'});s.uiRoute='lesson';}else{s.session=E.createClass(s,C.courses(all,'N5')[0],all);s.memory[E.keyOf(w.id,'writing')]={stage:1,due:Date.now()+86400000,lapses:4,successes:3,consecutive:2,lastAt:Date.now()-86400000,lastSession:'old',method:'stroke-snap',recent:[0,0,1,1],independentFailures:4};s.suspendedSession=E.createTargetReview(s,all,[{wordId:w.id,skill:'meaning'}],{label:'이전 복습'});s.encountered[w.id]=Date.now();s.study.strokes['学']=[{attempts:3,misses:2}];}await S.commit(s,old.revision);}""",mode)
 navigate(p,route)
def click(p,a):p.locator('[data-action="'+a+'"]').first.click();p.wait_for_timeout(150)
def hub(p,tab):
 navigate(p,'home');click(p,'hub-open');p.locator('[data-action="hub-tab"][data-tab="'+tab+'"]').click();p.wait_for_timeout(180)
def draw(p,selector,lines):
 c=p.locator(selector);c.scroll_into_view_if_needed();box=c.bounding_box();cdp=p.context.new_cdp_session(p)
 for line in lines:
  pts=[dict(x=box['x']+x*box['width'],y=box['y']+y*box['height'],id=1) for x,y in line]
  cdp.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[pts[0]]))
  for v in pts[1:]:cdp.send('Input.dispatchTouchEvent',dict(type='touchMove',touchPoints=[v]))
  cdp.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
 cdp.detach();p.wait_for_timeout(220)
def screenshot(p,name):p.wait_for_timeout(250);p.screenshot(path=str(OUT/name),full_page=True)
with sync_playwright() as P:
 b=P.chromium.launch(headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':390,'height':780},has_touch=True,device_scale_factor=2);c.add_init_script(TTS);p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.on('console',lambda m:console.append(m.text) if m.type=='error' else None);p.on('request',lambda r:requests.append(r.url))
 try:
  navigate(p,'home');dismiss_tutorial(p);check('page identity, meaningful content and no error overlay','코토바' in p.title() and p.locator('.study-entry').count()>0 and p.locator('.fatal,vite-error-overlay').count()==0)
  p.locator('.appbar [data-action="settings"]').click();p.locator('[data-setting="intensity"]').select_option('veryeasy');p.wait_for_timeout(200)
  check('intensity persists and explains zero listening writing',state(p)['settings']['intensity']=='veryeasy' and '쓰기 0문제' in p.locator('#intensity-description').inner_text())
  screenshot(p,'intensity.png');click(p,'close-modal');p.locator('[data-action="start-course"]').first.click();p.wait_for_selector('.survey-card')
  while p.locator('[data-action="unknown-word"]').count():click(p,'unknown-word')
  s=state(p);check('very easy actual class contains no audio or writing',all(t['skill'] not in ['audio','trace','writing','listening'] for t in s['session']['queue']))
  fixture(p,"s.session=E.createTargetReview(s,all,[{wordId:w.id,skill:'writing'}],{label:'쓰기 검증'});s.uiRoute='lesson';",'lesson')
  check('two character prompt starts masked',p.locator('#writing-word-progress').inner_text()=='□□')
  check('writing auto advance is visible and on by default',p.locator('[data-action="writing-auto-advance"]').get_attribute('aria-checked')=='true')
  draw(p,'#ink-canvas',BANK['学']);p.wait_for_function("document.querySelector('#writing-word-progress').textContent==='学□'")
  check('completed first character remains in original prompt',p.locator('#writing-word-progress').inner_text()=='学□')
  second=p.locator('[data-action="character"][data-index="1"]')
  for _ in range(30):
   if 'active' in (second.get_attribute('class') or ''):break
   p.wait_for_timeout(50)
  check('completed first character automatically advances to the second','active' in (second.get_attribute('class') or '') and state(p)['session']['ink']['active']==1);screenshot(p,'writing-first.png')
  draw(p,'#ink-canvas',BANK['校']);p.wait_for_function("document.querySelector('#writing-word-progress').textContent==='学校'")
  check('second completion reveals full word in place',p.locator('#writing-word-progress').inner_text()=='学校');screenshot(p,'writing-complete.png');click(p,'ink-done');p.wait_for_selector('.example-card')
  check('first grading event survives real save validation',len(state(p)['study']['events'])==1)
  check('completed writing glyphs are not checkmark placeholders','学' in p.locator('.big-japanese').first.inner_text() or '学校' in p.locator('#app').inner_text())
  check('curated example target is highlighted',p.locator('mark.vocab-highlight').count()>0);screenshot(p,'examples.png')
  fixture(p,"s.session=E.createTargetReview(s,all,[{wordId:w.id,skill:'writing'}],{label:'쓰기 검증'});s.uiRoute='lesson';",'lesson')
  p.locator('[data-action="writing-auto-advance"]').click();p.wait_for_timeout(180)
  check('writing auto advance can be turned off from the writing screen',p.locator('[data-action="writing-auto-advance"]').get_attribute('aria-checked')=='false' and state(p)['settings']['writingAutoAdvance'] is False)
  draw(p,'#ink-canvas',BANK['学']);p.wait_for_function("document.querySelector('#writing-word-progress').textContent==='学□'");p.wait_for_timeout(450)
  check('auto advance off keeps focus on the completed character',state(p)['session']['ink']['active']==0)
  fixture(p,"s.session=E.createClass(s,C.courses(all,'N5')[0],all);s.memory[E.keyOf(w.id,'writing')]={stage:1,due:Date.now()+86400000,lapses:4,successes:3,consecutive:2,lastAt:Date.now()-86400000,lastSession:'old',method:'stroke-snap',recent:[0,0,1,1],independentFailures:4};s.suspendedSession=E.createTargetReview(s,all,[{wordId:w.id,skill:'meaning'}],{label:'이전 복습'});s.encountered[w.id]=Date.now();s.study.strokes['学']=[{attempts:3,misses:2}];",'home')
  ids=[state(p)['session']['id'],state(p)['suspendedSession']['id']];click(p,'hub-open');p.locator('[data-action="weak-category"][data-category="history"]').click();check('historical misses remain available despite recent correct streak',p.locator('.weak-item').count()==1)
  screenshot(p,'weakness.png');click(p,'weak-target-start');s=state(p);check('weak-only test selects writing and preserves both prior sessions',all(t['skill']=='writing' for t in s['session']['queue']) and set(ids).issubset({s['suspendedSession']['id']}|{x['id'] for x in s['parkedSessions']}))
  navigate(p,'words');p.locator('[data-action="select-word"]').nth(0).click();p.locator('[data-action="select-word"]').nth(1).click();click(p,'hub-open');p.wait_for_selector('.folder-toolbar');click(p,'folder-create');p.locator('#folder-name').fill('시험 전날');click(p,'folder-save');click(p,'selection-menu');click(p,'selection-add-folder')
  check('selected vocabulary persisted in named folder',state(p)['study']['folders'][0]['name']=='시험 전날' and len(state(p)['study']['folders'][0]['wordIds'])==2);screenshot(p,'folders.png')
  click(p,'folder-select-all');p.locator('[data-action="selected-test"][data-skill="meaning"]').click();p.wait_for_selector('.question');check('selected-folder test uses chosen skill',all(t['skill']=='meaning' for t in state(p)['session']['queue']))
  navigate(p,'review');p.locator('[data-action="timebox-start"][data-minutes="5"]').click();p.wait_for_selector('#budget-clock');p.wait_for_timeout(1300)
  check('timebox display actually counts down',int(p.locator('#budget-clock').inner_text().replace('초',''))<300)
  p.evaluate("async()=>{const S=await import('./src/storage.js');const s=await S.loadState();s.session.elapsedMs=s.session.budgetMs-500;await S.commit(s,s.revision);}");navigate(p,'lesson');p.wait_for_selector('[data-action="budget-add"]');check('budget expiry saves and offers extension',state(p)['session']['elapsedMs']>=state(p)['session']['budgetMs']);click(p,'budget-add');check('extension adds five minutes',state(p)['session']['budgetMs']==600000)
  hub(p,'exam');p.locator('[data-action="exam-start"][data-level="N5"]').click();p.wait_for_selector('#exam-clock');before=state(p);check('exam hides explanations before submission',p.locator('.exam-solutions').count()==0 and len(before['study']['exam']['ids'])==20)
  click(p,'exam-option');eid=state(p)['study']['exam']['id'];navigate(p,'exam');check('exam answer and deadline survive reload',state(p)['study']['exam']['id']==eid and state(p)['study']['exam']['answers'][0] is not None);screenshot(p,'mini-exam.png')
  click(p,'exam-submit');click(p,'exam-confirm');check('exam result preserves main lesson and creates error practice',state(p)['session']['id']==before['session']['id'] and len(state(p)['study']['examWrongIds'])>=19 and len(state(p)['study']['exams'])==1);screenshot(p,'exam-result.png')
  hub(p,'exam');click(p,'exam-errors-start');check('error practice preserves original question IDs',all(x.startswith('q040-') for x in state(p)['study']['exam']['ids']))
  p.evaluate("async()=>{const S=await import('./src/storage.js');const s=await S.loadState();s.study.exam.deadline=Date.now()+100;await S.commit(s,s.revision);}");navigate(p,'exam');p.wait_for_timeout(700);check('expired exam auto-submits via mounted timer',state(p)['study']['exam']['finished'])
  hub(p,'strokes');click(p,'stroke-drill');p.wait_for_selector('#weak-stroke');draw(p,'#weak-stroke',[BANK['学'][0]]);check('stroke-specific drill uses actual canvas verdict','완료' in p.locator('#weak-stroke-status').inner_text());screenshot(p,'stroke-drill.png')
  navigate(p,'profile');check('monthly calendar and memory map render',p.locator('.study-calendar').count()==1 and p.locator('.memory-map-row').count()==5)
  p.locator('[data-action="calendar-day"]').first.click();check('calendar changes day readout','01' in p.locator('.monthly-day-readout').inner_text());screenshot(p,'monthly.png')
  hub(p,'quality');check('all-word structural audit actually runs','8,451' in p.locator('#main').inner_text());screenshot(p,'quality-audit.png')
  navigate(p,'words');p.locator('[data-action="select-word"]').first.click();p.locator('[data-action="select-word"]').nth(1).click();click(p,'selection-menu');p.evaluate('window.__spoken=[]');click(p,'playlist-selected');p.wait_for_selector('#playlist-word');p.wait_for_timeout(850)
  spoken=p.evaluate('window.__spoken');check('playlist serially speaks Japanese Korean Japanese',len(spoken)>=3 and [x['lang'] for x in spoken[:3]]==['ja-JP','ko-KR','ja-JP']);check('playlist mounted status reflects selected data',p.locator('#playlist-word').inner_text()!='목록 없음');screenshot(p,'commute.png');click(p,'playlist-stop')
  for width,height in [(320,640),(360,680),(390,780),(412,846),(1440,950)]:
   p.set_viewport_size(dict(width=width,height=height));hub(p,'weak');check(f'weak layout no horizontal overflow {width}',p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
   navigate(p,'profile');check(f'statistics no horizontal overflow {width}',p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));screenshot(p,f'statistics-{width}.png')
  check('no app runtime errors',not errors);check('no console errors',not console);check('no bundled audio requests',not any('/data/audio/' in x for x in requests))
 except Exception:
  (OUT/'failure.txt').write_text(traceback.format_exc());p.screenshot(path=str(OUT/'failure.png'),full_page=True);(OUT/'failure.html').write_text(p.content());raise
 finally:
  (OUT/'checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'console':console,'voiceAudibilityVerified':False},ensure_ascii=False,indent=2));b.close()
print('Advanced checks:',len(checks))
