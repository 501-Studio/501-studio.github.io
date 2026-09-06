"""Dashboard tests use isolated fake data and mocked cloud responses, never owner data."""
import copy,functools,http.server,json,pathlib,threading,uuid,datetime
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parents[1]/'dayboard'
OUT=pathlib.Path('dayboard-test-output/v2');OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',4175),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();BASE='http://127.0.0.1:4175/'
KEY='qa-dashboard-not-a-real-workspace-key';STAMP='2026-09-07T08:00:00+09:00';checks=[];errors=[];calls=[]
def uid():return str(uuid.uuid4())
def task(title):return dict(id=uid(),kind='task',parentId=None,title=title,deadline=None,estimatedMinutes=60,importance=2,urgency=2,category='일반',recurrence='none',progress=0,status='todo',notes='',pinned=False,pinIndex=None,recommendationRank=None,recommendationAt=None,completedAt=None,createdAt=STAMP)
projects=[];tasks=[]
for n,title in enumerate(['가을 발표 준비','실험 결과 분석','연구 기록 정리','협업 미팅 준비','이번 주 학습','다음 프로젝트']):
 p=task(title);p.update(kind='project',deadline=f'2026-09-{8+n:02d}',progress=n*10);projects.append(p)
 for m in range(2):
  t=task(['발표 흐름 정리','그림 설명 다듬기','결과 그래프 확인','측정값 비교하기','실험 노트 업데이트','분석 과정 기록','미팅 질문 정리','공유 자료 확인','리뷰 논문 읽기','학습 내용 요약','실험 계획 정리','자료 목록 확인'][n*2+m]);t.update(parentId=p['id'],deadline=f'2026-09-{8+n:02d}',estimatedMinutes=45+15*m,importance=3 if n==0 else 2);tasks.append(t)
blocks=[dict(id=uid(),taskId=tasks[n]['id'],title=tasks[n]['title'],start=f'2026-09-07T{h:02d}:00:00+09:00',end=f'2026-09-07T{h:02d}:45:00+09:00',source='app',locked=False,allDay=False) for n,h in enumerate([9,10,11,14,15,16])]
snapshot=dict(workspaceId=uid(),name='QA isolated workspace',revision=0,state=dict(items=projects+tasks,blocks=blocks,settings=dict(timezone='Asia/Seoul',weekStartsOn=1,workStart='09:00',workEnd='18:00',weekendStart='13:00',weekendEnd='17:00',lunchStart='12:00',lunchEnd='13:00',bufferMinutes=10,weeklyGoal=5)),proposals=[],history=[],updatedAt=STAMP)
def apply(ops):
 for op in ops:
  if op['collection']=='settings':snapshot['state']['settings'].update(op['data']);continue
  c=op['collection'];oid=op.get('id') or op['data']['id'];old=next((i for i in snapshot['state'][c] if i['id']==oid),{})
  snapshot['state'][c]=[i for i in snapshot['state'][c] if i['id']!=oid]
  if op['action']=='upsert':
   data={**old,**op['data']}
   if c=='items' and data.get('status')=='done':data.update(progress=100,completedAt=STAMP)
   snapshot['state'][c].append(data)
 for kind in ['task','project']:
  for parent in [i for i in snapshot['state']['items'] if i['kind']==kind]:
   children=[i for i in snapshot['state']['items'] if i.get('parentId')==parent['id']]
   if children:
    parent['progress']=round(sum(i['progress'] for i in children)/len(children));parent['status']='done' if all(i['status']=='done' for i in children) else 'doing' if parent['progress'] else 'todo'
 snapshot['revision']+=1;snapshot['updatedAt']=f'2026-09-07T08:00:{snapshot["revision"]%60:02d}+09:00'
def setup(ctx):
 ctx.add_init_script("localStorage.setItem('dayboard.key',"+json.dumps(KEY)+")")
 def rpc(route):
  data=route.request.post_data_json;method=route.request.url.split('/')[-1];calls.append(method)
  if data.get('p_key')!=KEY:return route.fulfill(status=401,json={'message':'UNAUTHORIZED'})
  if method in ['dayboard_apply','dayboard_propose'] and data['p_base_revision']!=snapshot['revision']:return route.fulfill(status=400,json={'message':'VERSION_CONFLICT'})
  if method=='dayboard_apply':apply(data['p_operations'])
  if method=='dayboard_propose':
   pid=uid();snapshot['proposals'].insert(0,dict(id=pid,title=data['p_title'],operations=data['p_operations'],base_revision=snapshot['revision'],status='pending',expires_at='2026-09-08T08:00:00+09:00'));return route.fulfill(json={'proposalId':pid})
  if method=='dayboard_decide':
   p=next(x for x in snapshot['proposals'] if x['id']==data['p_proposal_id'])
   if data['p_approved']:
    if p['base_revision']!=snapshot['revision']:return route.fulfill(status=400,json={'message':'VERSION_CONFLICT'})
    apply(p['operations']);p['status']='applied'
   else:p['status']='rejected'
  route.fulfill(json=snapshot)
 ctx.route('https://mahmzgdseyamqcffxwyd.supabase.co/rest/v1/rpc/**',rpc)
def ok(name):checks.append(name);print('PASS',name,flush=True)
def clock(page):page.clock.install(time=datetime.datetime(2026,9,6,23,tzinfo=datetime.timezone.utc))
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);ctx=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Asia/Seoul',locale='ko-KR');setup(ctx)
 page=ctx.new_page();clock(page);page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 try:
  page.goto(BASE);expect(page.locator('.dashboard-grid')).to_be_visible();expect(page.locator('.dash-event')).to_have_count(6);expect(page.locator('.dash-task')).to_have_count(8);expect(page.locator('.dash-project')).to_have_count(5);expect(page.locator('.dash-deadline')).to_have_count(5);expect(page.locator('.timeline')).to_have_count(0)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(OUT/'dashboard-desktop.png'),full_page=True);ok('Four dashboard areas, entire agenda, task8/project5/deadline5 limits')
  page.locator('[data-action=toggle-tasks]').click();expect(page.locator('.dash-task')).to_have_count(12);page.locator('[data-action=toggle-tasks]').click()
  page.locator('[data-action=toggle-projects]').click();expect(page.locator('.dash-project')).to_have_count(6);page.locator('[data-action=toggle-projects]').click()
  page.locator('[data-action=toggle-deadlines]').click();expect(page.locator('.dash-deadline')).to_have_count(18);page.locator('[data-action=toggle-deadlines]').click();ok('Show-all controls expand and restore independently')
  page.locator('[data-action=task-filter][data-id=unplaced]').click();expect(page.locator('.dash-task')).to_have_count(6)
  page.locator('[data-action=task-filter][data-id=today]').click();expect(page.locator('.dash-task')).to_have_count(6)
  page.locator('[data-action=task-filter][data-id=all]').click();ok('Today and unplaced filters reflect time blocks')
  pinned_id=page.locator('.dash-task').nth(1).get_attribute('data-id');page.locator('.dash-task').nth(1).locator('[data-action=pin-task]').click();expect(page.locator('.dash-task').nth(1)).to_have_class('dash-task is-pinned')
  moved_id=page.locator('.dash-task').nth(4).get_attribute('data-id');page.locator('.dash-task').nth(4).drag_to(page.locator('.dash-task').first)
  expect(page.locator('.dash-task').first).to_have_attribute('data-id',moved_id);expect(page.locator('.dash-task').nth(1)).to_have_attribute('data-id',pinned_id)
  assert snapshot['state']['settings']['taskOrder'][0]==moved_id;ok('Desktop drag persists manual order while keeping pin slot')
  page.locator('.dash-order-menu summary').click();page.locator('[data-action=restore-order]').click();expect(page.locator('.dash-task').nth(1)).to_have_attribute('data-id',pinned_id);assert snapshot['state']['settings']['taskOrder']==[];ok('Restore recommendation preserves pin')
  page.locator('[data-action=timeline-detail]').click();expect(page.locator('.timeline')).to_be_visible();expect(page.locator('.time-block')).to_have_count(6);page.screenshot(path=str(OUT/'dashboard-timeline.png'),full_page=True);page.locator('[data-action=timeline-list]').click();expect(page.locator('.timeline')).to_have_count(0);ok('Agenda switches to real-length vertical timeline and back')
  quick=page.locator('#quick-form');quick.locator('[name=title]').fill('옵션 업무 추가');page.locator('#quick-options summary').click();quick.locator('[name=deadline]').fill('2026-09-10');quick.locator('[name=estimatedMinutes]').fill('75');quick.locator('[name=parentId]').select_option(projects[0]['id']);quick.locator('[name=importance]').select_option('3')
  with page.expect_response(lambda r:r.url.endswith('/dayboard_read')):page.locator('[data-action=refresh]').first.click()
  expect(quick.locator('[name=title]')).to_have_value('옵션 업무 추가');expect(quick.locator('[name=estimatedMinutes]')).to_have_value('75');quick.locator('button[type=submit]').click();expect(quick.locator('[name=title]')).to_have_value('')
  new=next(i for i in snapshot['state']['items'] if i['title']=='옵션 업무 추가');assert new['estimatedMinutes']==75 and new['importance']==3 and new['parentId']==projects[0]['id'];ok('Quick optional fields save; typed draft survives refresh')
  page.locator('[data-action=natural-input]').click();page.locator('#natural-text').fill('내일까지 요약문 작성, 1시간 30분, 가을 발표 준비 프로젝트에 넣어줘');page.locator('#natural-form button[type=submit]').click();expect(page.locator('.natural-hints')).to_be_visible();expect(page.locator('#estimatedMinutes')).to_have_value('90');expect(page.locator('#deadline')).to_have_value('2026-09-08');assert not any('요약문 작성' in i['title'] for i in snapshot['state']['items'])
  page.locator('#item-form button[type=submit]').click();expect(page.locator('#modal')).not_to_be_visible();assert any('요약문 작성' in i['title'] for i in snapshot['state']['items']);ok('Natural input previews assumptions without saving until explicit Save')
  assert '남은 실행 업무' in page.locator('.dash-project').first.inner_text();assert '다음' in page.locator('.dash-project').first.inner_text();assert '%' in page.locator('.dash-project').first.inner_text();assert page.locator('.risk-indicator').count()==5;ok('Project next action/progress/count and textual deadline risk appear')
  mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Seoul');setup(mobile);mp=mobile.new_page();clock(mp);mp.on('pageerror',lambda e:errors.append(str(e)));mp.goto(BASE);expect(mp.locator('.dashboard-grid')).to_be_visible();expect(mp.locator('.dash-task').nth(1)).to_have_attribute('data-id',pinned_id)
  mobile_first=mp.locator('.dash-task').first.get_attribute('data-id');mp.locator('.dash-task').first.locator('[data-action=task-tools]').click();mp.locator('[data-action=task-down]').click();expect(mp.locator('.dash-task').nth(1)).to_have_attribute('data-id',pinned_id);expect(mp.locator('.dash-task').nth(2)).to_have_attribute('data-id',mobile_first);ok('Second device reads pin and uses mobile move menu without dragging')
  for width in [1024,768,390,320]:
   page.set_viewport_size({'width':width,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),str(width)
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'dashboard-mobile.png'),full_page=True);ok('1024/768/390/320px layouts have no document overflow')
  page.set_viewport_size({'width':1440,'height':1000})
  with page.expect_response(lambda r:r.url.endswith('/dayboard_read')):page.locator('[data-action=refresh]').first.click()
  page.locator('.dash-order-menu summary').click();page.locator('[data-action=gpt-order]').click();expect(page.locator('#chat-prompt')).to_contain_text('recommendationRank');expect(page.locator('#chat-prompt')).to_contain_text(snapshot['workspaceId']);assert KEY not in page.locator('#chat-prompt').input_value();page.locator('#modal [data-action=close]').click();ok('GPT request carries pin contract and current workspace, no private key')
  quick.locator('[name=title]').fill('<img src=x onerror=alert(1)>');quick.locator('[name=title]').press('Enter');expect(quick.locator('[name=title]')).to_have_value('');page.locator('[data-action=toggle-tasks]').click();assert page.locator('.dash-task img').count()==0;ok('Keyboard Enter submits quick task and untrusted markup is escaped')
  assert not errors,errors;ok('No uncaught app errors')
 except Exception:
  print('MOCK CALLS',calls[-12:]);print('LAST TOAST',page.locator('#toast').inner_text());print('FORM VALIDITY',page.locator('#quick-form').evaluate('(f)=>Array.from(f.elements).map(e=>({name:e.name,value:e.value,valid:e.validity?.valid,reason:e.validationMessage}))'))
  page.screenshot(path=str(OUT/'failure.png'),full_page=True);raise
 finally:
  browser.close();server.shutdown();(OUT/'report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'pageErrors':errors,'backend':'mocked Supabase; no user data','Google':'not accessed','browser':'GitHub Actions Playwright Chromium; Browser plugin absent and local navigation blocked by administrator','viewports':['1440x1000','1024x900','768x900','390x844','320x900']},ensure_ascii=False,indent=2))
print('TOTAL PASSED',len(checks))
