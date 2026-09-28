"""Validate final corpus cards in the real graded lesson UI, including long text.
Long text/accessibility may scroll; the fixed Next action must remain reachable.
"""
from pathlib import Path
import os,json,traceback
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba038-qa'))/'corpus038';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KOTOBA_TEST_URL','http://127.0.0.1:4173/');checks=[];errors=[];measurements=[]
def check(name,value):
 checks.append({'name':name,'pass':bool(value)})
 if not value:raise AssertionError(name)
with sync_playwright() as P:
 b=P.chromium.launch(headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':390,'height':780},has_touch=True,device_scale_factor=2);p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
 try:
  p.goto(BASE);p.wait_for_selector('.kana-entry');check('correct nonblank app and no error overlay','코토바' in p.title() and p.locator('.kana-entry').count()==1)
  targets=p.evaluate('''async()=>{const X=await import('./src/examples.js');const all=(await Promise.all(['N5','N4','N3','N2','N1'].map(l=>fetch('./data/'+l+'.json').then(r=>r.json())))).flatMap(p=>p.words);const score=w=>{const e=X.examplesFor(w)[0];return e.ja.length+(e.reading||'').length/2+e.ko.length/2};return ['N5','N4','N3','N2','N1'].flatMap(l=>{const ws=all.filter(w=>w.level===l&&X.examplesFor(w)[0]?.wordIds?.length);return [ws.reduce((a,b)=>score(a)>score(b)?a:b).id,ws.sort((a,b)=>Math.abs(score(a)-55)-Math.abs(score(b)-55))[0].id];});}''')
  for ix,wid in enumerate(targets):
   p.evaluate('''async id=>{const E=await import('./src/course-engine.js'),C=await import('./src/catalog.js'),S=await import('./src/storage.js');await S.openStore();const old=await S.loadState(),s=E.fresh(),all=(await Promise.all(['N5','N4','N3','N2','N1'].map(l=>fetch('./data/'+l+'.json').then(r=>r.json())))).flatMap(p=>p.words),w=all.find(w=>w.id===id),course=C.courses(all,w.level).find(c=>c.wordIds.includes(id));s.uiRoute='lesson';s.session=E.createClass(s,course,all);while(E.current(s.session)?.phase==='survey'){const t=E.current(s.session);E.classifySurvey(s,t.id,t.wordId!==id,all);}s.session.index=s.session.queue.findIndex(t=>t.wordId===id&&t.skill==='meaning'&&t.phase==='quiz');if(s.session.index<0)throw Error('No meaning question for '+id);await S.commit(s,old.revision);}''',wid)
   p.goto(BASE+'#lesson',wait_until='domcontentloaded');p.reload(wait_until='domcontentloaded');p.wait_for_selector('.answer-option');p.locator('.answer-option').first.click();p.locator('[data-action="answer"]').click();p.wait_for_selector('.example-card');p.wait_for_timeout(300)
   check('Japanese Korean audio feedback '+wid,p.locator('.example-ja').inner_text().strip() and p.locator('.example-ko').inner_text().strip() and p.locator('[data-action="example-audio"]').count()==2)
   check('no horizontal clipping '+wid,p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
   nextbox=p.locator('.lesson-footer').bounding_box();check('fixed next footer reachable '+wid,nextbox['y']>=0 and nextbox['y']+nextbox['height']<=780+1)
   a=p.locator('.example-controls').bounding_box();no_scroll=a['y']+a['height']<=nextbox['y']+1
   measurements.append({'wordId':wid,'sample':'longest' if ix%2==0 else 'typical','exampleAndAudioAboveFooter':no_scroll})
   if ix%2:check('typical example one screen '+wid,no_scroll)
   if ix in [0,1,8,9]:p.screenshot(path=str(OUT/f'feedback-{wid}.png'),full_page=True)
   if ix%2==0:
    p.locator('[data-action="example-stop"]').scroll_into_view_if_needed();check('long example controls reachable '+wid,p.locator('[data-action="example-stop"]').is_visible())
  p.goto(BASE+'#home');p.wait_for_timeout(500);check('no runtime JavaScript errors',not errors)
 except Exception:
  (OUT/'failure.txt').write_text(traceback.format_exc());p.screenshot(path=str(OUT/'failure.png'),full_page=True);raise
 finally:
  (OUT/'checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'measurements':measurements,'viewports':['390x780'],'voiceAudibilityTested':False},ensure_ascii=False,indent=2));b.close()
print(json.dumps(measurements,ensure_ascii=False,indent=2))
