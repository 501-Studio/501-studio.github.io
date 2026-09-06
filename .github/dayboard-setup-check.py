"""Permanent onboarding regression suite. No real credentials or external writes.
External Supabase and Google OAuth are mocked; owner approval is not simulated as fact.
"""
import copy, functools, http.server, json, pathlib, re, threading
from playwright.sync_api import sync_playwright, expect
ROOT=pathlib.Path(__file__).resolve().parents[1]/'dayboard'
OUT=pathlib.Path('dayboard-test-output/setup'); OUT.mkdir(parents=True,exist_ok=True)
class SilentHandler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',4174),functools.partial(SilentHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:4174/'
checks=[];snapshots={};calls=[];errors=[];connection_path=None
settings=dict(timezone='Asia/Seoul',weekStartsOn=1,workStart='09:00',workEnd='18:00',weekendStart='13:00',weekendEnd='17:00',lunchStart='12:00',lunchEnd='13:00',bufferMinutes=10,weeklyGoal=5)
def ok(name):checks.append(name);print('PASS',name,flush=True)
def empty(c):return dict(workspaceId=c['workspaceId'],name='QA temporary mock board',revision=0,state=dict(items=[],blocks=[],settings=copy.deepcopy(settings)),proposals=[],history=[],updatedAt='2026-09-06T00:00:00Z')
def routes(ctx):
 def backend(route):
  data=route.request.post_data_json;method=route.request.url.split('/')[-1];calls.append(method)
  snapshot=snapshots.get(data.get('p_key'))
  if not snapshot:return route.fulfill(status=401,json=dict(message='UNAUTHORIZED'))
  if method=='dayboard_apply':
   if data['p_base_revision']!=snapshot['revision']:return route.fulfill(status=400,json=dict(message='VERSION_CONFLICT'))
   for op in data['p_operations']:
    if op['collection']=='settings':snapshot['state']['settings'].update(op['data'])
    else:
     coll=snapshot['state'][op['collection']];oid=op.get('id') or op['data']['id'];old=next((i for i in coll if i['id']==oid),{})
     snapshot['state'][op['collection']]=[i for i in coll if i['id']!=oid]
     if op['action']=='upsert':snapshot['state'][op['collection']].append({**old,**op['data']})
   snapshot['revision']+=1
  return route.fulfill(json=snapshot)
 ctx.route('https://mahmzgdseyamqcffxwyd.supabase.co/rest/v1/rpc/**',backend)
 ctx.route('https://www.googleapis.com/calendar/v3/users/me/calendarList*',lambda r:r.fulfill(json=dict(items=[dict(id='qa@example.invalid',summary='테스트 캘린더',accessRole='owner')])) )
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 desktop=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
 routes(desktop);page=desktop.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 try:
  page.goto(BASE);expect(page.get_by_role('button',name='처음 연결하기 · 다른 기기 연결')).to_be_visible();ok('First-use setup entry visible')
  page.get_by_role('button',name='처음 연결하기 · 다른 기기 연결').click();expect(page.locator('#connection-setup')).to_be_visible()
  page.screenshot(path=str(OUT/'Dayboard-connection-PC.png'),full_page=True)
  page.keyboard.press('n');assert not page.locator('#modal').evaluate('(e)=>e.open');ok('Setup traps schedule shortcuts')
  page.locator('[data-setup-action=prepare]').click();expect(page.locator('#setup-sql')).to_be_visible()
  pending=page.evaluate("JSON.parse(sessionStorage.getItem('dayboard.pending-connection.v1'))")
  sql=page.locator('#setup-sql').input_value();assert pending['key'] not in sql;assert 'insert into dayboard_private.workspaces' in sql
  assert not re.search(r'\b(update|alter|grant|delete|drop)\b',sql,re.I);assert not calls;assert page.evaluate("localStorage.getItem('dayboard.key')") is None
  ok('Preparation never writes server state, resets credentials or embeds raw key in SQL')
  page.locator('[data-setup-action=verify]').click();expect(page.locator('#setup-status')).to_contain_text('아직 연결되지 않았습니다')
  assert page.evaluate("localStorage.getItem('dayboard.key')") is None;ok('Failed verification never persists a key')
  with page.expect_download() as dl:page.locator('[data-setup-action=download-pending]').click()
  connection_path=OUT/'test-connection.private.json';dl.value.save_as(connection_path)
  assert json.loads(connection_path.read_text())==pending
  snapshots[pending['key']]=empty(pending)
  page.locator('[data-setup-action=verify]').click();expect(page.get_by_text('개인 보드에 연결되어 있습니다.',exact=True)).to_be_visible()
  assert page.evaluate("localStorage.getItem('dayboard.key')")==pending['key'];ok('File roundtrip and matching-workspace verification (mock)')
  page.locator('[data-setup-action=back]').click();expect(page.locator('#quick-form')).to_be_visible()
  page.locator('#quick-form input[name=title]').fill('기기 동기화 테스트');page.locator('#quick-form').evaluate('(f)=>f.requestSubmit()')
  expect(page.get_by_role('button',name='기기 동기화 테스트',exact=True).first).to_be_visible();ok('Setup enters normal task persistence flow (mock)')
  mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,accept_downloads=True);routes(mobile)
  mp=mobile.new_page();mp.on('pageerror',lambda e:errors.append(str(e)));mp.goto(BASE+'?setup=workspace');expect(mp.locator('#connection-setup')).to_be_visible()
  mp.screenshot(path=str(OUT/'Dayboard-connection-mobile.png'),full_page=True)
  assert mp.evaluate('document.documentElement.scrollWidth<=innerWidth');assert mp.locator('#connection-setup').evaluate('(e)=>e.scrollWidth<=e.clientWidth');ok('390px mobile has no horizontal overflow')
  with mp.expect_file_chooser() as fc:mp.locator('[data-setup-action=restore]').click()
  fc.value.set_files(str(connection_path));expect(mp.locator('#setup-status')).to_contain_text('파일을 읽었습니다')
  mp.locator('[data-setup-action=verify]').click();expect(mp.get_by_text('개인 보드에 연결되어 있습니다.',exact=True)).to_be_visible()
  mp.locator('[data-setup-action=back]').click();expect(mp.get_by_role('button',name='기기 동기화 테스트',exact=True).first).to_be_visible();ok('Second device reads same task through imported connection (mock)')
  page.locator('[data-action=nav][data-id=settings]').first.click();page.get_by_role('button',name='연결 설정 도우미').click()
  page.locator('[data-setup-tab=chat]').click();prompt=page.locator('#setup-prompt').input_value();assert pending['workspaceId'] in prompt and pending['key'] not in prompt
  ok('ChatGPT request uses current workspace without exposing key')
  page.locator('[data-setup-tab=google]').click();page.locator('#setup-google-client').fill('not-a-client');page.locator('[data-setup-action=authorize-google]').click()
  expect(page.locator('#setup-status')).to_contain_text('올바른 Google 웹 클라이언트 ID');ok('Invalid Google client is rejected')
  page.locator('#setup-google-client').fill('12345-qa.apps.googleusercontent.com');page.locator('[data-setup-action=save-google]').click()
  expect(page.locator('#setup-status')).to_contain_text('먼저 Google 계정 인증');ok('Google setup cannot claim consent before authentication')
  page.evaluate("window.google={accounts:{oauth2:{initTokenClient:opts=>({requestAccessToken:()=>{window.__qaScopes=opts.scope;opts.callback({access_token:'qa-memory-only-token',expires_in:3600})}}),revoke:(_,done)=>done()}}}")
  page.locator('[data-setup-action=authorize-google]').click();expect(page.locator('#setup-google-calendar option')).to_have_count(1)
  page.locator('[data-setup-action=save-google]').click();expect(page.locator('#setup-status')).to_contain_text('Google 연결 설정을 저장')
  assert snapshots[pending['key']]['state']['settings']['googleCalendarId']=='qa@example.invalid'
  assert 'qa-memory-only-token' not in page.evaluate('JSON.stringify(localStorage)');assert 'qa-memory-only-token' not in json.dumps(snapshots);assert 'calendar.events' in page.evaluate('window.__qaScopes')
  ok('Mock OAuth saves only client/calendar IDs; token remains in memory')
  page.locator('[data-setup-action=back]').click();expect(page.get_by_text('현재 기기에서 Google 인증됨.',exact=False)).to_be_visible();ok('Token survives setup close without reload (mock OAuth)')
  bad=browser.new_context(viewport={'width':320,'height':740});routes(bad);bp=bad.new_page();bp.goto(BASE+'?setup=workspace');expect(bp.locator('#connection-setup')).to_be_visible()
  with bp.expect_file_chooser() as fc:bp.locator('[data-setup-action=restore]').click()
  fc.value.set_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps({**pending,'workspaceId':"' OR 1=1 --"}).encode()})
  expect(bp.locator('#setup-status')).to_contain_text('올바른 연결 파일이 아닙니다');assert bp.evaluate("localStorage.getItem('dayboard.key')") is None;assert bp.evaluate('document.documentElement.scrollWidth<=innerWidth')
  ok('Invalid workspace payload rejected; 320px stays within bounds')
  assert not errors,errors;ok('No uncaught JavaScript errors')
 except Exception:
  page.screenshot(path=str(OUT/'failure.png'),full_page=True)
  raise
 finally:
  browser.close();server.shutdown()
  if connection_path:connection_path.unlink(missing_ok=True)
  (OUT/'setup-verification.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'pageErrors':errors,'environment':'GitHub Actions Playwright/Chromium. Browser plugin absent; local browser navigation blocked by administrator. Supabase and Google responses mocked. Owner console setup and real Google authorization NOT tested.','viewports':['1440x1000','390x844','320x740']},ensure_ascii=False,indent=2))
print('TOTAL PASSED',len(checks))
