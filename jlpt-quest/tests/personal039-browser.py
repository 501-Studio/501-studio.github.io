from tutorial_helpers import returning_user
"""Real Chromium UI/storage/canvas. TTS is an explicit test adapter, not audibility proof.
Flow: settings -> wordbook audio -> saved independent writing -> early review -> statistics.
Browser plugin absent; local Chromium unavailable, so CI runs standard Playwright.
"""
import os,json,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba039-qa'))/'personal039';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KOTOBA_TEST_URL','http://127.0.0.1:4173/')
BANK=json.loads((ROOT/'data/strokes.json').read_text())['characters'];checks=[];errors=[];requests=[];console_messages=[] # console health capture
TTS="""window.__speech=[];Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(text){this.text=text;}}});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'ja-JP',localService:true}],speak(u){window.__speech.push({text:u.text,rate:u.rate});setTimeout(()=>{u.onstart?.();u.onend?.();},50)},cancel(){}}});"""
def check(label,value):
 checks.append({'name':label,'pass':bool(value)})
 if not value:raise AssertionError(label)
def state(p):return p.evaluate("async()=>{const S=await import('./src/storage.js');return await S.loadState();}")
def draw(p,paths):
 c=p.locator('#practice-canvas');c.scroll_into_view_if_needed();box=c.bounding_box();cdp=p.context.new_cdp_session(p)
 for line in paths:
  pts=[dict(x=box['x']+x*box['width'],y=box['y']+y*box['height'],id=1) for x,y in line]
  cdp.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[pts[0]]))
  for point in pts[1:]:cdp.send('Input.dispatchTouchEvent',dict(type='touchMove',touchPoints=[point]))
  cdp.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
 cdp.detach();p.wait_for_timeout(180)
def accepted(p,n):p.wait_for_function('n=>document.querySelector("#practice-canvas")?.dataset.accepted===String(n)',arg=n)
with sync_playwright() as P:
 b=P.chromium.launch(executable_path=os.environ.get('KOTOBA_CHROMIUM') or None,headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':360,'height':680},has_touch=True,device_scale_factor=2);c.add_init_script(TTS);p=c.new_page();returning_user(p);p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:requests.append(r.url));p.on('console',lambda m:console_messages.append({'type':m.type,'text':m.text}) if m.type in ['error','warning'] else None)
 try:
  p.goto(BASE);p.wait_for_selector('.level-progress-grid');check('page identity and meaningful render','코토바' in p.title() and p.url.startswith(BASE));check('no startup error overlay',not p.locator('.fatal, vite-error-overlay, nextjs-portal').count())
  p.locator('.appbar [data-action="settings"]').click();p.wait_for_selector('.setting-switch')
  check('daily goal and voice selector removed',p.locator('[data-setting="goal"],[data-setting="audioEngine"]').count()==0)
  for setting in ['furigana','motion','kanjiOnlyPractice','reviewNotifications']:
   control=p.locator(f'.setting-switch input[data-setting="{setting}"]');was=control.is_checked();control.click();p.wait_for_timeout(180)
   check('switch state saved '+setting,state(p)['settings'][setting] is not was)
   track=control.locator('..').locator('.switch-track').bounding_box();thumb=control.locator('..').locator('i').bounding_box()
   check('thumb remains inside track '+setting,thumb['x']>=track['x'] and thumb['x']+thumb['width']<=track['x']+track['width']+.5)
   control.click();p.wait_for_timeout(180)
  p.locator('.sheet').evaluate('e=>e.scrollTop=0');p.wait_for_timeout(500);p.screenshot(path=str(OUT/'settings.png'))
  p.locator('[data-action="speech-test"]').click();p.wait_for_timeout(180);check('settings voice test uses Japanese device TTS',p.evaluate('window.__speech.at(-1).text')=='こんにちは。日本語の音声テストです。')
  p.evaluate("window.speechSynthesis.getVoices=()=>[{lang:'en-US',localService:true}]")
  p.locator('[data-action="speech-test"]').click();p.wait_for_function("document.querySelector('#toast').textContent.includes('일본어 오프라인 음성이 없습니다')")
  check('missing Japanese voice produces visible settings guidance','설치' in p.locator('#toast').inner_text())
  p.evaluate("window.speechSynthesis.getVoices=()=>[{lang:'ja-JP',localService:true}]")
  p.locator('[data-action="close-modal"]').click()
  ids=p.evaluate('''async()=>{const E=await import('./src/course-engine.js'),C=await import('./src/catalog.js'),S=await import('./src/storage.js'),A=await import('./src/session-controls.js');const old=await S.loadState(),s=Object.assign(E.fresh(),{tutorial:{version:1,status:'skipped',step:0}}),all=(await Promise.all(['N5','N4','N3','N2','N1'].map(l=>fetch('./data/'+l+'.json').then(r=>r.json())))).flatMap(p=>p.words),w=all.find(x=>x.level==='N5'&&x.word==='山'),known=all.find(x=>x.level==='N5'&&x.word==='いつも');s.known[known.id]=Date.now();s.encountered[known.id]=Date.now();s.session=E.createClass(s,C.courses(all,'N5')[0],all);s.memory[E.keyOf(w.id,'meaning')]=E.schedule(null,false,'prior',Date.now()-700000);A.enterReview(s,all,'due');s.uiRoute='words';await S.commit(s,old.revision);return {mountain:w.id,known:known.id};}''')
  p.goto(BASE+'#words');p.reload();p.wait_for_selector('.wordbook-item')
  p.locator('#search').fill('いつも');row=p.locator('.wordbook-item').first;row.locator('[data-action="word"]').click();p.wait_for_selector('.known-state');check('self-reported known state never says unlearned','아는 단어 · 직접 표시' in p.locator('.known-state').inner_text() and p.locator('.memory-row').filter(has_text='아는 단어로 분류 · 시험 전').count()==3)
  p.wait_for_timeout(500);p.screenshot(path=str(OUT/'known-word.png'));p.locator('[data-action="word-audio"]').last.click();p.wait_for_timeout(180);check('word button passes actual reading',p.evaluate('window.__speech.at(-1).text')=='いつも')
  p.locator('.sheet [data-action="word-example-audio"]').click();p.wait_for_timeout(180);check('detail example audio passes full sentence',len(p.evaluate('window.__speech.at(-1).text'))>5)
  p.locator('[data-action="close-modal"]').click();p.locator('#search').fill('山');row=p.locator('.wordbook-item').filter(has=p.locator(f'[data-action="word"][data-id="{ids["mountain"]}"]')).first
  check('wordbook has three direct actions',row.locator('.wordbook-actions button').count()==3);row.locator('[data-action="word-example-audio"]').click();p.wait_for_timeout(180);check('row example playback updates status','완료' in row.locator('.word-audio-status').inner_text())
  p.wait_for_timeout(500);p.screenshot(path=str(OUT/'wordbook.png'));before=state(p);row.locator('[data-action="practice-options"]').click();p.wait_for_selector('.repeat-options');check('repeat choices visible',p.locator('.repeat-options button').count()==5)
  p.locator('#practice-repeats').fill('2');check('custom count clears unrelated preset selection',p.locator('.repeat-options [aria-pressed="true"]').count()==0);p.wait_for_timeout(500);p.screenshot(path=str(OUT/'repeats.png'));p.locator('[data-action="practice-start"]').click();p.wait_for_selector('#practice-canvas')
  s=state(p);check('writing preserves both unfinished sessions',s['session']['id']==before['session']['id'] and s['suspendedSession']['id']==before['suspendedSession']['id']);check('custom repetition saved',s['wordPractice']['repeats']==2)
  draw(p,[BANK['山'][0]]);accepted(p,1);p.locator('[data-action="practice-exit"]').click();p.wait_for_selector('[data-action="practice-resume"]');p.reload();p.wait_for_selector('[data-action="practice-resume"]');p.locator('[data-action="practice-resume"]').click();accepted(p,1);check('real accepted ink survives exit reload resume',state(p)['wordPractice']['ink']['characters'][0]!=[])
  # settled screenshot and first-viewport help reachability
  p.wait_for_timeout(500)
  helpbox=p.locator('.writing-help').bounding_box();footbox=p.locator('.lesson-footer').bounding_box()
  check('writing help controls fit above footer without scrolling',helpbox['y']+helpbox['height']<=footbox['y']+1)
  p.screenshot(path=str(OUT/'writing.png'));draw(p,BANK['山'][1:]);accepted(p,3);p.locator('[data-action="practice-next"]').click();p.wait_for_timeout(200);check('one completed word equals one repeat',state(p)['wordPractice']['completed']==1)
  p.locator('[data-action="practice-guide"]').click();p.locator('[data-action="practice-answer"]').click();check('answer and hint always available',p.locator('[data-action="practice-hint"]').count()==1 and state(p)['wordPractice']['guide'])
  draw(p,BANK['山']);accepted(p,3);p.locator('[data-action="practice-next"]').click();p.wait_for_selector('.result');s=state(p);check('two repeats finish exactly',s['wordPractice']['completed']==2 and s['wordPractice']['finished']);check('practice cannot change tests XP or scheduling',s['memory']==before['memory'] and s['xp']==before['xp'] and s['known']==before['known']);check('practice has its own counter',sum(d['rounds'] for d in s['practiceLog'].values())==2)
  # Fresh isolated review fixture: future review plus self-known entries, no pending review.
  p.evaluate('''async()=>{const E=await import('./src/course-engine.js'),S=await import('./src/storage.js');const s=await S.loadState();s.session=s.suspendedSession;s.suspendedSession=null;const key=Object.keys(s.memory)[0];s.memory[key]={stage:3,due:Date.now()+7*E.DAY,lapses:0,consecutive:3,successes:3,lastSession:'prior',lastAt:Date.now()-E.DAY,method:'choice'};s.uiRoute='review';await S.commit(s,s.revision);}''')
  p.goto(BASE+'#review');p.reload();p.wait_for_selector('[data-action="preview-start"]');check('early review enabled before due date',not p.locator('[data-action="preview-start"]').is_disabled());p.wait_for_timeout(500);p.screenshot(path=str(OUT/'early-review.png'))
  p.locator('[data-action="preview-start"]').click();p.wait_for_selector('.question');s=state(p);check('early review actually starts with preserved class',s['session']['reviewMode']=='preview' and s['suspendedSession']['kind']=='class')
  # Fixture stats are only test data, never seeded in the production app.
  p.evaluate('''async()=>{const E=await import('./src/course-engine.js'),S=await import('./src/storage.js');const old=await S.loadState(),s=Object.assign(E.fresh(),{tutorial:{version:1,status:'skipped',step:0}}),all=(await Promise.all(['N5','N4','N3','N2','N1'].map(l=>fetch('./data/'+l+'.json').then(r=>r.json())))).flatMap(p=>p.words);const n5=all.filter(w=>w.level==='N5'),n4=all.filter(w=>w.level==='N4');for(let i=0;i<72;i++){s.known[n5[i].id]=Date.now();s.encountered[n5[i].id]=Date.now();}for(let i=72;i<95;i++){s.learned[n5[i].id]=Date.now();s.encountered[n5[i].id]=Date.now();for(const skill of E.SKILLS)s.memory[E.keyOf(n5[i].id,skill)]={stage:i%6,due:Date.now()+(i%7)*E.DAY,lapses:0,successes:3,consecutive:3,lastAt:Date.now(),lastSession:'fixture',method:'choice'};}for(let i=0;i<35;i++){const ids=Array.from({length:(i*7)%24+3},(_,j)=>(j%5===0?n4:n5)[j].id),date=E.dayKey(Date.now()-i*E.DAY);s.daily[date]={keys:ids.map(id=>E.keyOf(id,'meaning')),words:ids,xp:ids.length*10};s.xp+=ids.length*10;}s.uiRoute='profile';await S.commit(s,old.revision);}''')
  p.goto(BASE+'#profile');p.reload();p.wait_for_selector('.stats-hero');check('all six stats surfaces render',p.locator('.stats-panel').count()==5)
  check('weekly graph has seven actual days',p.locator('.activity-bar').count()==7);p.locator('[data-action="stats-range"][data-days="30"]').click();check('month selector changes graph',p.locator('.activity-bar').count()==30);p.locator('.activity-bar').first.click();check('chart day drilldown is visible',bool(p.locator('.stats-day-readout').inner_text()))
  p.locator('[data-action="stats-level"][data-level="N4"]').click();check('level filter affects metrics','N4' in p.locator('.progress-orbit').inner_text());p.locator('[data-action="stats-level"][data-level="all"]').click();p.locator('[data-action="stats-range"][data-days="7"]').click()
  for width,height in [(320,640),(360,680),(390,780),(412,846),(1440,950)]:
   p.set_viewport_size(dict(width=width,height=height));p.wait_for_timeout(150);check('stats fit viewport '+str(width),p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));p.wait_for_timeout(500);p.screenshot(path=str(OUT/f'stats-{width}.png'),full_page=True)
  p.set_viewport_size(dict(width=390,height=780));p.wait_for_timeout(500);p.screenshot(path=str(OUT/'stats-viewport.png'));p.locator('.stats-panel').nth(2).scroll_into_view_if_needed();p.wait_for_timeout(500);p.screenshot(path=str(OUT/'stats-details.png'))
  check('no prerecorded audio was requested',not any('/data/audio/'in u or 'audio-manifest.json'in u for u in requests));check('no JavaScript errors',not errors);check('no console errors',not any(m['type']=='error' for m in console_messages))
 except Exception:
  (OUT/'failure.txt').write_text(traceback.format_exc());p.wait_for_timeout(500);p.screenshot(path=str(OUT/'failure.png'),full_page=True);(OUT/'failure.html').write_text(p.content());raise
 finally:
  (OUT/'checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'console':console_messages,'voiceTest':'Mocked Japanese device TTS boundary; physical audibility not tested','statsScreenshots':'Synthetic fixture data only','viewports':['320x640','360x680','390x780','412x846','1440x950']},ensure_ascii=False,indent=2));b.close()
