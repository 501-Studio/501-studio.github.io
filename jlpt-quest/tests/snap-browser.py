"""Real Chromium, Canvas, IndexedDB. No handwriting or storage verdict mocks.
The second context uses an offline asset router to emulate WebViewAssetLoader.
"""
import json,os,time
from pathlib import Path
from playwright.sync_api import sync_playwright
from urllib.parse import urlparse,unquote
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba-snap-qa'));OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KOTOBA_TEST_URL','http://127.0.0.1:4173/')
BANK=json.loads((ROOT/'data/strokes.json').read_text())['characters']
checks=[]
def check(name,condition):
    checks.append({'name':name,'pass':bool(condition)})
    if not condition:raise AssertionError(name)
def fixture(page,quiz=False):
    page.evaluate('''async quiz=>{
      const E=await import('./src/course-engine.js'),C=await import('./src/catalog.js'),S=await import('./src/storage.js');
      await S.openStore();const previous=await S.loadState(),state=E.fresh();
      state.session=E.createClass(state,C.courses(C.STARTERS,'N5')[0],C.STARTERS);
      state.session.index=quiz?state.session.queue.findIndex(t=>t.skill==='writing'&&t.wordId===state.session.wordIds[0]):2;
      await S.commit(state,previous.revision);
    }''',quiz)
    page.goto(BASE+'#lesson');page.reload();page.wait_for_selector('#ink-canvas')
def strokes_count(page):return int(page.locator('#ink-canvas').get_attribute('data-accepted'))
def draw(page,path,dx=.01,dy=.008):
    page.locator('#ink-canvas').scroll_into_view_if_needed();box=page.locator('#ink-canvas').bounding_box()
    client=page.context.new_cdp_session(page)
    points=[{'x':box['x']+(p[0]+dx)*box['width'],'y':box['y']+(p[1]+dy)*box['height'],'id':1} for p in path]
    client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[points[0]]})
    for p in points[1:]:client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[p]})
    client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(300);client.detach()
with sync_playwright() as P:
    browser=P.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':390,'height':780},has_touch=True,device_scale_factor=2)
    page=context.new_page();errors=[];external=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:external.append(r.url) if not r.url.startswith(BASE) else None)
    try:
        page.goto(BASE);page.wait_for_selector('.level-progress-grid')
        check('page identity and real home content',page.title()=='코토바 · 한자 회독 수업' and page.locator('.level-progress').count()==5)
        for width,height in [(320,740),(390,780),(768,900),(1440,900)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
            check('home no overflow '+str(width),page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        page.set_viewport_size({'width':390,'height':780});fixture(page)
        check('no manual recognition button or model request',page.locator('[data-action="grade"],[data-action="model-download"]').count()==0)
        check('new character starts at zero strokes',strokes_count(page)==0)
        check('canvas fits above footer',page.locator('#ink-canvas').bounding_box()['y']+page.locator('#ink-canvas').bounding_box()['height']<page.locator('.lesson-footer').bounding_box()['y'])
        draw(page,BANK['山'][0]);check('imperfect first stroke snaps automatically',strokes_count(page)==1)
        check('one stroke is not a completed character',page.locator('[data-action="ink-done"]').count()==0)
        page.screenshot(path=str(OUT/'one-stroke.png'))
        draw(page,list(reversed(BANK['山'][1])));check('reverse stroke is rejected',strokes_count(page)==1)
        import math
        draw(page,[[.5+.24*math.cos(i/5),.5+.24*math.sin(i/5)] for i in range(100)])
        check('scribble cannot be accepted',strokes_count(page)==1)
        page.locator('[data-action="undo"]').click();check('undo removes one accepted stroke',strokes_count(page)==0)
        draw(page,BANK['山'][0]);page.reload();page.wait_for_selector('#ink-canvas')
        check('real IndexedDB restores partial stroke progress',strokes_count(page)==1)
        draw(page,BANK['山'][1]);draw(page,BANK['山'][2]);check('all three strokes complete the character',strokes_count(page)==3)
        check('explicit word completion unlocked',page.locator('[data-action="ink-done"]').is_enabled())
        page.screenshot(path=str(OUT/'complete-strokes.png'))
        page.locator('[data-action="ink-done"]').click();page.wait_for_selector('[data-action="studied"]')
        check('training advances only after all strokes pass','川' in page.locator('.big-japanese').inner_text())
        info=page.evaluate("async()=>{const s=await(await import('./src/storage.js')).loadState();return {xp:s.xp,n:Object.keys(s.memory).length}}")
        check('tracing does not inflate memory score',info=={'xp':0,'n':0})
        fixture(page,True)
        check('recall question does not reveal answer in prompt','山' not in page.locator('.ink-prompt').inner_text())
        draw(page,list(reversed(BANK['山'][0])));check('bad recall stroke stays unaccepted',strokes_count(page)==0)
        for path in BANK['山']:draw(page,path)
        page.locator('[data-action="ink-done"]').click();page.wait_for_selector('.feedback-copy')
        check('mistake followed by correction is recorded for later retry','다시 확인' in page.locator('.feedback-copy').inner_text())
        check('runtime console error free',not errors)
        check('no external service called',not external)
        # Cold-load with browser network offline, fresh storage and only bundled assets available.
        cold=browser.new_context(viewport={'width':390,'height':780},has_touch=True,offline=True)
        def local_asset(route):
            u=urlparse(route.request.url)
            if not route.request.url.startswith(BASE):raise AssertionError('External request '+route.request.url)
            relative=unquote(u.path).lstrip('/') or 'index.html';path=(ROOT/relative).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():return route.fulfill(status=404,body='Not found')
            types={'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}
            route.fulfill(status=200,body=path.read_bytes(),content_type=types.get(path.suffix,'text/plain'))
        cold.route('**/*',local_asset);cp=cold.new_page();cp.goto(BASE);cp.wait_for_selector('.level-progress-grid')
        check('fresh offline context boots with bundled assets only',cp.evaluate('navigator.onLine') is False)
        fixture(cp);draw(cp,BANK['山'][0]);check('cold offline stroke matching works',strokes_count(cp)==1)
        cp.screenshot(path=str(OUT/'offline-first-stroke.png'));cold.close()
    finally:
        (OUT/'browser-checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'externalRequests':external,'environment':'Chromium + real IndexedDB/Canvas; offline asset routing, not physical Android'},ensure_ascii=False,indent=2))
        browser.close()
print(json.dumps(checks,ensure_ascii=False,indent=2))
