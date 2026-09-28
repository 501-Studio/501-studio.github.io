"""Interaction/viewport evidence: real Chromium, no hand-written verdict bypass.
Voice controls use a clearly identified offline-voice mock; actual device audibility is not claimed.
"""
import os,json,traceback,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba038-qa'))/'study038';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KOTOBA_TEST_URL','http://127.0.0.1:4173/');BANK=json.loads((ROOT/'data/strokes.json').read_text())['characters'];checks=[];errors=[]
def check(name,value):
 checks.append({'name':name,'pass':bool(value)})
 if not value:raise AssertionError(name)
def state(p):return p.evaluate("async()=>{const S=await import('./src/storage.js');await S.openStore();return await S.loadState();}")
def seed(p,skill='meaning'):
 p.evaluate('''async skill=>{const E=await import('./src/course-engine.js'),C=await import('./src/catalog.js'),S=await import('./src/storage.js');await S.openStore();const old=await S.loadState(),s=E.fresh(),all=(await Promise.all(['N5','N4','N3','N2','N1'].map(l=>fetch('./data/'+l+'.json').then(r=>r.json())))).flatMap(p=>p.words),w=all.find(x=>x.level==='N5'&&x.word==='山'),c=C.courses(all,'N5').find(c=>c.wordIds.includes(w.id));s.uiRoute='lesson';s.session=E.createClass(s,c,all);while(E.current(s.session)?.phase==='survey'){const t=E.current(s.session);E.classifySurvey(s,t.id,t.wordId!==w.id,all);}s.session.index=s.session.queue.findIndex(t=>t.wordId===w.id&&t.skill===skill&&t.phase===(skill==='trace'?'learn':'quiz'));s.memory[E.keyOf(w.id,'meaning')]=E.schedule(undefined,false,'earlier',Date.now()-700000);await S.commit(s,old.revision);}''',skill)
 p.goto(BASE+'#lesson',wait_until='domcontentloaded');p.reload(wait_until='domcontentloaded');p.wait_for_selector('.question')
def draw(p,paths):
 canvas=p.locator('#ink-canvas');canvas.scroll_into_view_if_needed();box=canvas.bounding_box();cdp=p.context.new_cdp_session(p)
 for line in paths:
  points=[dict(x=box['x']+x*box['width'],y=box['y']+y*box['height'],id=1) for x,y in line]
  cdp.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[points[0]]))
  for point in points[1:]:cdp.send('Input.dispatchTouchEvent',dict(type='touchMove',touchPoints=[point]))
  cdp.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
 cdp.detach()
def accepted(p,n):p.wait_for_function('n=>document.querySelector("#ink-canvas")?.dataset.accepted===String(n)',arg=n)
with sync_playwright() as P:
 b=P.chromium.launch(headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required']);c=b.new_context(viewport={'width':390,'height':780},has_touch=True,device_scale_factor=2);p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
 try:
  p.goto(BASE);p.wait_for_selector('.kana-entry');seed(p)
  check('unanswered exam keeps examples hidden',p.locator('[data-action="examples"]').count()==0 and p.locator('.example-card').count()==0)
  answer=p.evaluate("async()=>{const S=await import('./src/storage.js');const s=await S.loadState();return s.session.wordSnapshots.find(w=>w.id===s.session.queue[s.session.index].wordId).meaning;}")
  p.locator('.answer-option').filter(has_text=answer).first.click();p.locator('[data-action="answer"]').click();p.wait_for_selector('.example-card');check('grading replaces answer choices with inline example',p.locator('.answer-option').count()==0)
  for width,height in [(390,780),(412,846),(360,740),(320,568),(1440,900)]:
   p.set_viewport_size(dict(width=width,height=height));p.wait_for_timeout(300)
   check(f'feedback has no horizontal overflow {width}',p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
   if height>=740:check(f'answer example and next button visible without scroll {width}',p.locator('.example-controls').bounding_box()['y']+p.locator('.example-controls').bounding_box()['height']<=p.locator('.lesson-footer').bounding_box()['y']+1)
   p.screenshot(path=str(OUT/f'feedback-{width}.png'),full_page=True)
  p.set_viewport_size(dict(width=390,height=780))
  p.evaluate('''()=>{window.__spoken=[];window.__cancelled=0;Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(text){this.text=text;}}});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'ja-JP',localService:true}],speak(u){window.__spoken.push({text:u.text,rate:u.rate});setTimeout(()=>u.onend?.(),120)},cancel(){window.__cancelled++;}}});}''')
  example=p.locator('.example-ja').inner_text();p.locator('[data-action="example-audio"]').first.click();p.wait_for_timeout(250);p.locator('[data-slow="true"]').click();p.wait_for_timeout(250)
  spoken=p.evaluate('window.__spoken');check('voice boundary gets full example and 0.7 slow rate (mock)',len(spoken)==2 and spoken[0]['text']==example and spoken[1]['rate']==.7)
  p.locator('[data-action="example-stop"]').click();check('stop control updates accessible status','멈췄'in p.locator('.example-audio-status').inner_text())
  seed(p,'trace');check('guided tracing always shows hint and answer',p.locator('[data-action="hint"]').count()==1 and p.locator('[data-action="reveal-writing"]').count()==1)
  draw(p,[BANK['山'][0]]);accepted(p,1);p.wait_for_timeout(250);before=state(p)['session'];p.locator('[data-action="pause"]').click();p.wait_for_selector('.sheet');p.screenshot(path=str(OUT/'pause.png'));p.locator('[data-action="keep-learning"]').click();accepted(p,1);check('pause cancel preserves current ink',state(p)['session']['id']==before['id'])
  p.locator('[data-action="pause"]').click();p.locator('[data-action="review-start"]').click();p.wait_for_timeout(300);s=state(p);check('unfinished class can enter due review',s['session']['kind']=='review' and s['suspendedSession']['id']==before['id'])
  p.reload(wait_until='domcontentloaded');p.wait_for_selector('.question');s=state(p);check('review plus parked class survive reload',s['suspendedSession']['index']==before['index'])
  p.locator('[data-action="pause"]').click();p.locator('[data-action="switch-session"]').click();p.wait_for_selector('#ink-canvas');accepted(p,1);check('return from review restores actual pen strokes',state(p)['session']['id']==before['id'])
  p.locator('[data-action="pause"]').click();p.locator('[data-action="save-exit"]').click();p.wait_for_selector('.resume');p.screenshot(path=str(OUT/'home-two-sessions.png'),full_page=True);check('home exposes both unfinished sessions',p.locator('.resume').count()==2)
  p.locator('[data-action="restart-session"]').click();p.wait_for_selector('.sheet');p.locator('[data-action="keep-learning"]').click();check('restart cancel preserves class index',state(p)['session']['index']==before['index'])
  memory=state(p)['memory'];p.locator('[data-action="restart-session"]').click();p.locator('[data-action="confirm-restart"]').click();p.wait_for_selector('.question');s=state(p);check('restart begins same round and preserves SRS and parked review',s['session']['index']==0 and s['session']['id']==before['id'] and s['memory']==memory and s['suspendedSession']['kind']=='review')
  seed(p,'writing');p.locator('[data-action="reveal-writing"]').click();p.wait_for_selector('.writing-answer');check('writing answer reveals correct word','山'in p.locator('.writing-answer').inner_text());p.locator('[data-action="keep-learning"]').click();draw(p,BANK['山']);accepted(p,len(BANK['山']));p.locator('[data-action="ink-done"]').click();p.wait_for_selector('.example-card');s=state(p);check('revealed writing cannot pass as independent recall',s['session']['feedback']['assisted'] and not s['session']['feedback']['correct'])
  check('no JavaScript errors',not errors)
 except Exception:
  (OUT/'failure.txt').write_text(traceback.format_exc());p.screenshot(path=str(OUT/'failure.png'),full_page=True);(OUT/'failure.html').write_text(p.content());raise
 finally:
  (OUT/'checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'voiceTest':'mocked offline voice boundary, not hardware audibility'},ensure_ascii=False,indent=2));b.close()
print(json.dumps(checks,ensure_ascii=False,indent=2))
