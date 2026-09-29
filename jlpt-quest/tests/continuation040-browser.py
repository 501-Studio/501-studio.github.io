"""Mode-switch and large-folder regressions in the actual application UI.
Explicit test records only. Does not edit a user's library or relax application CSP.
"""
from pathlib import Path
import os,json,time,traceback
from playwright.sync_api import sync_playwright
OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba040-qa'))/'continuation040';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KOTOBA_TEST_URL','http://127.0.0.1:4173/')
checks=[];errors=[]
def check(name,value):
 checks.append({'name':name,'pass':bool(value)})
 if not value:raise AssertionError(name)
def state(p):return p.evaluate("async()=>{const S=await import('./src/storage.js');return S.loadState();}")
def nav(p,route):
 p.goto(BASE+'?continuation='+str(time.time_ns())+'#'+route);p.wait_for_selector('#app .page,#app .question,#app .result');p.wait_for_timeout(200)
def click(p,action):p.locator('[data-action="'+action+'"]').first.click();p.wait_for_timeout(150)
def seed(p,mode):
 return p.evaluate("""async mode=>{
  const E=await import('./src/course-engine.js'),S=await import('./src/storage.js'),C=await import('./src/catalog.js'),D=await import('./src/study-data.js');
  const old=await S.loadState(),s=E.fresh(),all=(await Promise.all(['N5','N4','N3','N2','N1'].map(l=>fetch('./data/'+l+'.json').then(r=>r.json())))).flatMap(p=>p.words),w=all.find(w=>w.word==='学校'&&w.level==='N5');
  if(mode==='preview'){
   s.memory[E.keyOf(w.id,'meaning')]=E.schedule(null,true,'old',Date.now()-86400000);
   s.memory[E.keyOf(w.id,'writing')]=E.schedule(null,true,'future',Date.now()+86400000);
   s.session=E.createClass(s,C.courses(all,'N5')[0],all);s.suspendedSession=E.createReview(s,all,'due');
  }else if(mode==='folder'){
   const f=D.createFolder(s,'大きな単語帳');D.putInFolder(s,f.id,all.filter(w=>w.level==='N5').slice(0,205).map(w=>w.id));
  }else{
   s.settings.intensity='veryeasy';const course=C.courses(all,'N5').find(c=>c.wordIds.includes(w.id));s.session=E.createClass(s,course,all);
   while(E.current(s.session)?.phase==='survey')E.classifySurvey(s,E.current(s.session).id,E.current(s.session).wordId!==w.id,all);
   let guard=0;while(!s.session.finished&&guard++<100){const t=E.current(s.session);E.submit(s,t.id,{correct:true,method:'choice'});E.next(s);}
   if(!s.session.completed)throw Error('Very-easy result fixture incomplete');s.uiRoute='lesson';
  }
  await S.commit(s,old.revision);return {ids:[s.session?.id,s.suspendedSession?.id].filter(Boolean),folder:s.study.folders[0]?.id,tail:all.filter(w=>w.level==='N5').slice(200,205).map(w=>w.id)};
 }""",mode)
with sync_playwright() as P:
 b=P.chromium.launch(headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':390,'height':780},has_touch=True);p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
 try:
  nav(p,'home');check('app identity and nonblank real UI','코토바' in p.title() and p.locator('.level-progress-grid').count()==1 and p.locator('.fatal,vite-error-overlay').count()==0)
  f=seed(p,'preview');nav(p,'review');click(p,'preview-start');p.wait_for_selector('.question');s=state(p)
  check('preview button selects future writing instead of the existing due review',s['session']['reviewMode']=='preview' and all(t['skill']=='writing' for t in s['session']['queue']))
  check('both prior sessions remain saved',set(f['ids']).issubset({s['suspendedSession']['id']}|{x['id'] for x in s['parkedSessions']}))
  nav(p,'review');click(p,'review-start');p.wait_for_selector('.question');check('due button restores matching parked due review',state(p)['session']['id']==f['ids'][1])
  f=seed(p,'folder');nav(p,'home');click(p,'hub-open');p.locator('[data-action="hub-tab"][data-tab="folders"]').click();p.locator('[data-action="folder-open"][data-id="'+f['folder']+'"]').click();p.wait_for_timeout(150)
  check('large folder first page shows 100 accessible records',p.locator('.folder-word').count()==100)
  p.locator('[data-action="folder-page"][data-page="1"]').click();p.wait_for_timeout(150);check('folder second page remains accessible',p.locator('.folder-word').count()==100 and '2 / 3' in p.locator('.folder-pagination').inner_text())
  p.locator('[data-action="folder-page"][data-page="2"]').click();p.wait_for_timeout(150);check('last five records after 200 are reachable',p.locator('.folder-word').count()==5)
  p.screenshot(path=str(OUT/'folder-last-page.png'),full_page=True);click(p,'folder-select-all');check('select page chooses the visible tail rather than first 100','5단어' in p.locator('#sheet-title').inner_text())
  p.locator('[data-action="selected-test"][data-skill="meaning"]').click();p.wait_for_selector('.question');s=state(p)
  check('last-page test contains exactly the five selected word IDs',set(s['session']['wordIds'])==set(f['tail']) and all(t['skill']=='meaning' for t in s['session']['queue']))
  seed(p,'veryeasy');nav(p,'lesson');p.wait_for_selector('.result');check('very easy completion has no misleading missing writing or listening skill badges',p.locator('.result-skills').filter(has_text='듣기').count()==0 and p.locator('.result-skills').filter(has_text='쓰기').count()==0)
  p.screenshot(path=str(OUT/'very-easy-result.png'),full_page=True)
  check('no runtime errors',not errors)
 except Exception:
  (OUT/'failure.txt').write_text(traceback.format_exc());p.screenshot(path=str(OUT/'failure.png'),full_page=True);raise
 finally:
  (OUT/'checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'voiceAudibilityVerified':False},ensure_ascii=False,indent=2));b.close()
print('Continuation checks',len(checks))
