"""Automatic word-pronunciation regression in the actual lesson UI.
Browser plugin is not available in this session, so CI Playwright is used.
The speech adapter verifies requests, not physical speaker audibility.
"""
from pathlib import Path
import os,json,time,traceback
from playwright.sync_api import sync_playwright
OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba040-qa'))/'autopronounce041';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KOTOBA_TEST_URL','http://127.0.0.1:4173/')
checks=[];errors=[]
TTS="""window.__spoken=[];Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(t){this.text=t;}}});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'ja-JP',localService:true},{lang:'ko-KR',localService:true}],speak(u){window.__spoken.push({text:u.text,lang:u.lang,rate:u.rate});setTimeout(()=>{u.onstart?.();u.onend?.()},70);},cancel(){},addEventListener(){},removeEventListener(){}}});"""
def check(name,value):
 checks.append({'name':name,'pass':bool(value)})
 if not value:raise AssertionError(name)
def nav(p,route):
 p.goto(BASE+'?auto='+str(time.time_ns())+'#'+route);p.wait_for_selector('#app .page,#app .question,#app .result');p.wait_for_timeout(260)
def spoken(p):return p.evaluate('window.__spoken.slice()')
def state(p):return p.evaluate("async()=>{const S=await import('./src/storage.js');return S.loadState();}")
def seed(p,mode):
 return p.evaluate("""async mode=>{
  const E=await import('./src/course-engine.js'),S=await import('./src/storage.js'),C=await import('./src/catalog.js');
  const old=await S.loadState(),s=E.fresh(),all=(await Promise.all(['N5','N4','N3','N2','N1'].map(l=>fetch('./data/'+l+'.json').then(r=>r.json())))).flatMap(p=>p.words);
  const w=all.find(x=>x.word==='学校'&&x.level==='N5');
  if(mode==='survey'){const c=C.courses(all,'N5').find(c=>c.wordIds.includes(w.id));s.session=E.createClass(s,c,all);s.session.index=s.session.queue.findIndex(t=>t.wordId===w.id&&t.skill==='survey');}
  else s.session=E.createTargetReview(s,all,[{wordId:w.id,skill:mode}],{label:'자동 발음 검증'});
  s.uiRoute='lesson';await S.commit(s,old.revision);return {word:w.word,reading:w.reading,meaning:w.meaning};
 }""",mode)
with sync_playwright() as P:
 b=P.chromium.launch(headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':390,'height':780},has_touch=True);c.add_init_script(TTS);p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
 try:
  nav(p,'home');check('real app loads','코토바' in p.title() and p.locator('.level-progress-grid').count()==1)
  target=seed(p,'survey');p.evaluate('window.__spoken=[]');nav(p,'lesson')
  check('survey auto-plays current word once',len(spoken(p))==1 and spoken(p)[0]['text']==target['reading'])
  p.locator('[data-action="furigana"]').click();p.wait_for_timeout(220)
  check('survey rerender does not replay',len(spoken(p))==1)
  before=len(spoken(p));p.locator('[data-action="unknown-word"]').click();p.wait_for_timeout(220)
  check('moving to a new survey word gets one new pronunciation',len(spoken(p))==before+1)

  target=seed(p,'writing');p.evaluate('window.__spoken=[]');nav(p,'lesson')
  check('writing prompt auto-plays word once',len(spoken(p))==1 and spoken(p)[0]['text']==target['reading'])
  p.locator('[data-action="furigana"]').click();p.wait_for_timeout(220)
  check('writing rerender does not replay',len(spoken(p))==1)

  target=seed(p,'meaning');p.evaluate('window.__spoken=[]');nav(p,'lesson')
  check('meaning multiple-choice auto-plays word once',len(spoken(p))==1 and spoken(p)[0]['text']==target['reading'])
  correct=p.locator('.answer-option').filter(has_text=target['meaning']).first
  correct.click();p.locator('[data-action="answer"]').click();p.wait_for_selector('.example-card');p.wait_for_timeout(220)
  check('entering answer/example feedback auto-plays the word once again',len(spoken(p))==2 and spoken(p)[1]['text']==target['reading'])
  p.locator('[data-action="furigana"]').click();p.wait_for_timeout(220)
  check('feedback rerender does not replay',len(spoken(p))==2)
  p.screenshot(path=str(OUT/'feedback-auto-pronunciation.png'),full_page=True)

  target=seed(p,'listening');p.evaluate('window.__spoken=[]');nav(p,'lesson');p.wait_for_timeout(120)
  check('listening keeps its existing automatic pronunciation',len(spoken(p))==1 and spoken(p)[0]['text']==target['reading'])
  check('successful automatic listening unlocks choices',state(p)['session']['heard'] is True)
  p.locator('[data-action="furigana"]').click();p.wait_for_timeout(220)
  check('listening rerender also stays one-time',len(spoken(p))==1)
  check('no runtime page errors',not errors)
 except Exception:
  (OUT/'failure.txt').write_text(traceback.format_exc());p.screenshot(path=str(OUT/'failure.png'),full_page=True);raise
 finally:
  (OUT/'checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'physicalVoiceAudibilityVerified':False},ensure_ascii=False,indent=2));b.close()
print('Auto pronunciation checks',len(checks))
