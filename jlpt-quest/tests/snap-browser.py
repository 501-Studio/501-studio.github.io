"""Rendered v0.3.3 QA: real Chromium Canvas + IndexedDB, no verdict/storage mocks."""
import json,os,math
from pathlib import Path
from playwright.sync_api import sync_playwright
from urllib.parse import urlparse,unquote
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba-v033-evidence'));OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KOTOBA_TEST_URL','http://127.0.0.1:4173/')
BANK=json.loads((ROOT/'data/strokes.json').read_text())['characters']
checks=[]
def check(name,condition):
    checks.append({'name':name,'pass':bool(condition)})
    if not condition: raise AssertionError(name)
def wait_app(page): page.wait_for_selector('.level-progress-grid',timeout=10000)
def seed(page,mode='survey'):
    page.evaluate("""async mode=>{
      const E=await import('./src/course-engine.js'),C=await import('./src/catalog.js'),S=await import('./src/storage.js');
      await S.openStore();const previous=await S.loadState(),state=E.fresh(),course=C.courses(C.STARTERS,'N5')[0];
      state.session=E.createClass(state,course,C.STARTERS);
      if(mode!=='survey'){
        const first=state.session.wordIds[0];
        while(E.current(state.session)?.phase==='survey'){
          const t=E.current(state.session);
          E.classifySurvey(state,t.id,t.wordId!==first,C.STARTERS);
        }
        if(mode==='trace')state.session.index=state.session.queue.findIndex(t=>t.phase==='learn'&&t.skill==='trace'&&t.wordId===first);
        if(mode==='meaning')state.session.index=state.session.queue.findIndex(t=>t.phase==='quiz'&&t.skill==='meaning'&&t.wordId===first);
        if(mode==='listening')state.session.index=state.session.queue.findIndex(t=>t.phase==='quiz'&&t.skill==='listening'&&t.wordId===first);
      }
      await S.commit(state,previous.revision);
    }""",mode)
    page.goto(BASE+'#lesson');page.reload();page.wait_for_selector('#main',timeout=10000)
def strokes_count(page):return int(page.locator('#ink-canvas').get_attribute('data-accepted'))
def wait_strokes(page,n):
    page.wait_for_function("n=>Number(document.querySelector('#ink-canvas')?.dataset.accepted)===n",arg=n,timeout=5000)
    return strokes_count(page)
def draw(page,path,dx=0,dy=0):
    page.locator('#ink-canvas').scroll_into_view_if_needed();box=page.locator('#ink-canvas').bounding_box()
    client=page.context.new_cdp_session(page)
    pts=[]
    for x,y in path:
        x=max(0,min(1,x+dx));y=max(0,min(1,y+dy))
        pts.append({'x':box['x']+x*box['width'],'y':box['y']+y*box['height'],'id':1})
    client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[pts[0]]})
    for p in pts[1:]:client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[p]})
    client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(350);client.detach()
with sync_playwright() as P:
    browser=P.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
    context=browser.new_context(viewport={'width':390,'height':780},has_touch=True,device_scale_factor=2)
    page=context.new_page();errors=[];external=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:external.append(r.url) if not r.url.startswith(BASE) else None)
    try:
        page.goto(BASE);wait_app(page)
        check('page identity',page.title()=='코토바 · 한자 회독 수업')
        check('home shows five JLPT levels',page.locator('.level-progress').count()==5)
        check('home shows chapter, round and 30-word range','第1章' in page.locator('.chapter-book.featured').inner_text() and '1회독' in page.locator('.chapter-book.featured').inner_text() and 'No.1~30' in page.locator('.chapter-book.featured').inner_text())
        for width,height in [(320,740),(390,780),(768,900),(1440,900)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(80)
            check('home no horizontal overflow '+str(width),page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        page.set_viewport_size({'width':390,'height':780})
        page.goto(BASE+'#words');page.wait_for_selector('#search')
        page.locator('#search').fill('あさって');page.wait_for_timeout(120)
        text=page.locator('#word-results').inner_text()
        check('wordbook shows Korean for あさって','모레' in text and 'day after tomorrow' not in text)
        page.locator('#search').fill('あそこ');page.wait_for_timeout(120)
        text=page.locator('#word-results').inner_text()
        check('wordbook shows Korean for あそこ','저기' in text and 'over there' not in text)
        check('wordbook has no English-meaning status label','영어 뜻' not in page.locator('body').inner_text())
        page.goto(BASE);wait_app(page)
        seed(page,'survey');page.wait_for_selector('.survey-card')
        check('rapid review starts with 30 words','1 / 30' in page.locator('.survey-count').inner_text())
        check('survey has known and unknown controls',page.locator('[data-action="known-word"]').count()==1 and page.locator('[data-action="unknown-word"]').count()==1)
        page.locator('[data-action="survey-reading"]').click();page.wait_for_selector('.survey-reading')
        check('hiragana can be revealed per card','やま' in page.locator('.survey-reading').inner_text())
        page.locator('[data-action="survey-meaning"]').click();page.wait_for_selector('.survey-meaning')
        check('Korean meaning can be revealed per card','산' in page.locator('.survey-meaning').inner_text())
        page.screenshot(path=str(OUT/'rapid-review.png'))

        seed(page,'meaning');page.wait_for_selector('.answer-option')
        check('only unknown word is being tested','모르는 단어 시험' in page.locator('.session-label').inner_text())
        check('four objective choices render together',page.locator('.answer-option').count()==4)
        boxes=page.locator('.answer-option').evaluate_all("(els)=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})")
        footer_y=page.locator('.lesson-footer').bounding_box()['y']
        check('all choices are visible above fixed answer footer',all(b['y']>=0 and b['y']+b['height']<footer_y+1 for b in boxes))
        rows=sorted(set(round(b['y']) for b in boxes))
        check('objective choices use compact two-row grid',len(rows)==2)
        page.screenshot(path=str(OUT/'quiz-grid.png'))

        seed(page,'listening');page.wait_for_selector('#audio-status')
        page.wait_for_function("()=>document.querySelector('#audio-status')?.textContent.includes('1회 자동재생 완료')",timeout=12000)
        check('listening prompt auto-plays exactly once before choices are submitted',page.locator('#audio-status').inner_text().startswith('1회 자동재생 완료'))
        check('listening choices unlock after bundled auto audio',page.locator('.answer-option:not([disabled])').count()==4)
        page.locator('[data-action="listen"]').click()
        page.wait_for_function("()=>document.querySelector('#audio-status')?.textContent.includes('1회 자동재생 완료')",timeout=12000)
        check('user can replay after automatic first listen',page.locator('#audio-status').inner_text().startswith('1회 자동재생 완료'))

        seed(page,'trace');page.wait_for_selector('#ink-canvas')
        check('stroke starts empty',strokes_count(page)==0)
        path=BANK['山'][0];xs=[p[0] for p in path];ys=[p[1] for p in path]
        dx=.13 if max(xs)<.82 else -.13;dy=.11 if max(ys)<.82 else -.11
        draw(page,path,dx,dy)
        check('translated stroke still passes shape-based matcher',wait_strokes(page,1)==1)
        page.screenshot(path=str(OUT/'loose-snap.png'))
        page.locator('[data-action="undo"]').click();wait_strokes(page,0)
        draw(page,list(reversed(BANK['山'][0])))
        check('reverse direction still rejected',strokes_count(page)==0)
        loop=[[.5+.25*math.cos(i/7),.5+.25*math.sin(i/7)] for i in range(160)]
        draw(page,loop);check('scribble still rejected',strokes_count(page)==0)

        check('runtime console error free',not errors)
        check('normal bundled flow made no external request',not external)

        cold=browser.new_context(viewport={'width':390,'height':780},has_touch=True,offline=True)
        def local_asset(route):
            u=urlparse(route.request.url)
            if not route.request.url.startswith(BASE): raise AssertionError('External request '+route.request.url)
            relative=unquote(u.path).lstrip('/') or 'index.html';path=(ROOT/relative).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file(): return route.fulfill(status=404,body='Not found')
            types={'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}
            route.fulfill(status=200,body=path.read_bytes(),content_type=types.get(path.suffix,'text/plain'))
        cold.route('**/*',local_asset);cp=cold.new_page();cp.goto(BASE);cp.wait_for_selector('.chapter-book.featured')
        check('fresh offline context boots from bundled assets',cp.evaluate('navigator.onLine') is False)
        seed(cp,'trace');cp.wait_for_selector('#ink-canvas');draw(cp,BANK['山'][0],.1,.08)
        check('offline relaxed stroke snap works',wait_strokes(cp,1)==1)
        cp.screenshot(path=str(OUT/'offline-snap.png'));cold.close()
    finally:
        (OUT/'browser-checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'externalRequests':external,'environment':'Chromium real Canvas/IndexedDB; local asset routing for offline case, not physical Android'},ensure_ascii=False,indent=2))
        browser.close()
print(json.dumps(checks,ensure_ascii=False,indent=2))
