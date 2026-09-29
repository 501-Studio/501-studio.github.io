"""Real-browser regression for orientation, kana, examples and settings. No verdict bypass."""
import os,json,traceback,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba037-qa'))/'learning037';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KOTOBA_TEST_URL','http://127.0.0.1:4173/')
BANK=json.loads((ROOT/'data/strokes.json').read_text())['characters'];checks=[];errors=[]
def check(name,passed):
 checks.append({'name':name,'pass':bool(passed)})
 if not passed:raise AssertionError(name)
def state(p):return p.evaluate("async()=>{const S=await import('./src/storage.js');await S.openStore();return await S.loadState();}")
def seed(p,word='山',skill='trace',kanji=False):
 p.evaluate('''async ({word,skill,kanji})=>{const E=await import('./src/course-engine.js'),C=await import('./src/catalog.js'),S=await import('./src/storage.js');await S.openStore();const old=await S.loadState(),s=E.fresh();const all=(await Promise.all(['N5','N4','N3','N2','N1'].map(l=>fetch('./data/'+l+'.json').then(r=>r.json())))).flatMap(p=>p.words);const w=all.find(x=>x.level==='N5'&&x.word===word),c=C.courses(all,'N5').find(c=>c.wordIds.includes(w.id));s.settings.kanjiOnlyPractice=kanji;s.uiRoute='lesson';s.session=E.createClass(s,c,all);while(E.current(s.session)?.phase==='survey'){const t=E.current(s.session);E.classifySurvey(s,t.id,t.wordId!==w.id,all);}s.session.index=s.session.queue.findIndex(t=>t.wordId===w.id&&t.skill===skill&&(skill==='audio'||skill==='trace'?t.phase==='learn':t.phase==='quiz'));await S.commit(s,old.revision);}''',dict(word=word,skill=skill,kanji=kanji))
 p.goto(BASE+'#lesson',wait_until='domcontentloaded');p.reload(wait_until='domcontentloaded');p.wait_for_selector('.question')
def draw(p,paths,selector='#ink-canvas'):
 canvas=p.locator(selector);canvas.scroll_into_view_if_needed();box=canvas.bounding_box();cdp=p.context.new_cdp_session(p)
 for line in paths:
  pts=[dict(x=box['x']+x*box['width'],y=box['y']+y*box['height'],id=1)for x,y in line]
  cdp.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[pts[0]]))
  for point in pts[1:]:cdp.send('Input.dispatchTouchEvent',dict(type='touchMove',touchPoints=[point]))
  cdp.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
 cdp.detach()
def accepted(p,n,selector='#ink-canvas'):
 p.wait_for_function("({s,n})=>document.querySelector(s)?.dataset.accepted===String(n)",arg={'s':selector,'n':n},timeout=6000)
with sync_playwright() as P:
 b=P.chromium.launch(executable_path=os.environ.get('KOTOBA_CHROMIUM')or None,headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 c=b.new_context(viewport={'width':390,'height':780},has_touch=True,device_scale_factor=2);c.add_init_script("window.__deviceTestSpeech=[];Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(t){this.text=t;}}});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'ja-JP',localService:true}],speak(u){window.__deviceTestSpeech.push(u.text);setTimeout(()=>u.onend?.(),50)},cancel(){}}});");p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
 try:
  p.goto(BASE);p.wait_for_selector('.kana-entry')
  check('kana course appears before N5 level cards',p.locator('.kana-entry').bounding_box()['y']<p.locator('.levels-panel').bounding_box()['y'])
  p.locator('[data-action="kana-open"]').click();p.wait_for_selector('.kana-grid');check('18 hiragana rows available',p.locator('.kana-lesson').count()==18)
  p.locator('[data-action="kana-script"][data-script="k"]').click();p.wait_for_timeout(200);check('katakana rows use katakana','ア イ ウ エ オ'in p.locator('.kana-grid').inner_text())
  for width,height in [(320,740),(390,780),(768,900),(1440,900)]:
   p.set_viewport_size(dict(width=width,height=height));p.wait_for_timeout(100);check('kana grid fits '+str(width),p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));check('every kana row remains complete '+str(width),p.locator('.kana-letterline strong').evaluate_all('(els)=>els.every(e=>e.scrollWidth<=e.parentElement.clientWidth+1)'))
  p.set_viewport_size(dict(width=390,height=780));p.screenshot(path=str(OUT/'kana-course.png'),full_page=True)
  p.locator('[data-action="kana-script"][data-script="h"]').click();p.locator('[data-id="h-r"]').click();p.wait_for_selector('#kana-canvas');check('hiragana writing opens independently',p.locator('.kana-prompt>strong').inner_text()=='ら')
  diagonal=[[.33,.14],[.39,.175],[.49,.215]];draw(p,[diagonal],selector='#kana-canvas');accepted(p,1,'#kana-canvas');check('ら handwritten straight first stroke accepted through real touch',True)
  p.wait_for_timeout(250);p.set_viewport_size(dict(width=780,height=390));p.wait_for_timeout(300);accepted(p,1,'#kana-canvas');check('kana partial writing survives landscape resize',p.url.endswith('#kana-practice'))
  p.set_viewport_size(dict(width=390,height=780));p.wait_for_timeout(200);p.reload(wait_until='domcontentloaded');p.wait_for_selector('#kana-canvas');accepted(p,1,'#kana-canvas');check('ら alternate stroke survives actual reload and saved validation',True)
  draw(p,BANK['ら'][1:],'#kana-canvas');accepted(p,len(BANK['ら']),'#kana-canvas');p.locator('[data-action="kana-next"]').click();p.wait_for_function("()=>document.querySelector('.session-label').textContent.includes('2/3')")
  draw(p,BANK['ら'],'#kana-canvas');accepted(p,len(BANK['ら']),'#kana-canvas');p.locator('[data-action="kana-next"]').click();p.wait_for_function("()=>document.querySelector('.session-label').textContent.includes('3/3')");check('third kana repetition hides letter',p.locator('.kana-prompt>strong').inner_text()=='?')
  p.locator('[data-action="kana-hint"]').click();p.wait_for_timeout(150);draw(p,BANK['ら'],'#kana-canvas');accepted(p,len(BANK['ら']),'#kana-canvas');p.locator('[data-action="kana-next"]').click();p.wait_for_timeout(200);check('hinted recall cannot mark kana mastered',state(p)['kana']['progress']=={});check('hinted recall restarts without answer',p.locator('.kana-prompt>strong').inner_text()=='?')
  draw(p,BANK['ら'],'#kana-canvas');accepted(p,len(BANK['ら']),'#kana-canvas');p.locator('[data-action="kana-next"]').click();p.wait_for_timeout(250);check('unassisted recall schedules kana review',state(p)['kana']['progress']['KANA-h3089']['due']>time.time()*1000);p.screenshot(path=str(OUT/'kana-writing.png'))
  seed(p);draw(p,[BANK['山'][0]]);accepted(p,1);p.wait_for_timeout(300);before=state(p)['session'];p.set_viewport_size(dict(width=780,height=390));p.wait_for_timeout(250);accepted(p,1);check('JLPT rotation preserves question and ink',p.url.endswith('#lesson')and state(p)['session']['index']==before['index']);p.screenshot(path=str(OUT/'landscape-writing.png'),full_page=True)
  p.set_viewport_size(dict(width=390,height=780));p.wait_for_timeout(150);p.goto(BASE,wait_until='domcontentloaded');p.wait_for_selector('#ink-canvas');accepted(p,1);check('cold URL launch restores saved lesson instead of home',p.url.endswith('#lesson'))
  seed(p,word='テレビ',skill='audio',kanji=True);p.wait_for_selector('[data-action="audio-done"]:not([disabled])',timeout=20000);p.locator('[data-action="audio-done"]').click();p.wait_for_timeout(250);s=state(p);check('kana-only option skips actual training UI',s['session']['queue'][s['session']['index']]['phase']=='quiz');check('writing exam is still queued',any(t['skill']=='writing'and t['phase']=='quiz'for t in s['session']['queue']))
  seed(p,word='おまわりさん',skill='audio');p.locator('[data-action="examples"]').click();p.wait_for_selector('.example-card');check('example has Japanese, complete reading and Korean',p.locator('.example-ja').count()>0 and '경찰관'in p.locator('.example-ko').first.inner_text());p.wait_for_timeout(500);check('inline example is fully visible',p.locator('.example-pane').is_visible());check('kana example header is not duplicated',p.locator('.example-headword').count()==0);check('example reading toggle applies to header and sentence',p.evaluate("async()=>{const {exampleBody}=await import('./src/examples.js');const w={word:'山',reading:'やま'};return !exampleBody(w,false).includes('<small') && !exampleBody(w,false).includes('example-reading') && exampleBody(w,true).includes('やま');}"));p.screenshot(path=str(OUT/'example.png'));p.locator('[data-action="hide-examples"]').click();check('closing example stays in lesson',p.url.endswith('#lesson'))
  seed(p,word='山',skill='meaning');check('example does not reveal ungraded exam answer',p.locator('[data-action="examples"]').count()==0)
  p.locator('.answer-option').first.click();p.locator('[data-action="answer"]').click();p.wait_for_selector('.answer-reveal');check('inline example is offered after grading',p.locator('.example-card').count()==1)
  p.goto(BASE+'#home');p.locator('[data-action="settings"]:visible').first.click();p.wait_for_selector('.sheet');p.locator('[data-setting="kanjiOnlyPractice"]').check();p.wait_for_timeout(250);p.locator('[data-setting="reviewNotifications"]').uncheck();p.wait_for_timeout(250);check('new settings saved without changing exam content',state(p)['settings']['kanjiOnlyPractice'] and not state(p)['settings']['reviewNotifications']);p.screenshot(path=str(OUT/'settings.png'),full_page=True)
  check('no JavaScript errors',not errors)
 except Exception:
  (OUT/'failure.txt').write_text(traceback.format_exc());p.screenshot(path=str(OUT/'failure.png'),full_page=True);(OUT/'failure.html').write_text(p.content());raise
 finally:
  (OUT/'checks.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2));b.close()
print(json.dumps(checks,ensure_ascii=False,indent=2))
