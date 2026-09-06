// CI uses only public app assets and explicitly labelled in-memory sample data.
// No owner workspace key, personal schedule, Google token or paid API is used.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {execFileSync}=require('node:child_process');
const root=path.resolve('dayboard'),out=path.resolve('dayboard-test-output');
fs.mkdirSync(out,{recursive:true});
const results=[];let server,browser;
function pass(name){results.push({name,passed:true});console.log('PASS '+name);}
async function test(name,fn){try{await fn();pass(name);}catch(e){results.push({name,passed:false,error:String(e.stack||e)});console.error('FAIL '+name+'\n'+e.stack);}}
async function run(){
 for(const f of fs.readdirSync(root).filter(x=>x.endsWith('.js')))execFileSync(process.execPath,['--check',path.join(root,f)],{stdio:'inherit'});
 pass('All JavaScript modules parse');
 const c=await import(pathToFileURL(path.join(root,'core.js')).href);
 await test('Korean timezone, Monday week and month boundaries',()=>{
  assert.equal(c.dateKey('2026-09-06T16:00:00Z'),'2026-09-07');
  assert.equal(c.timeKey('2026-09-06T00:30:00Z'),'09:30');
  assert.equal(c.weekStart('2026-09-06'),'2026-08-31');
  assert.equal(c.addDays('2026-12-31',1),'2027-01-01');
  assert.equal(c.shiftMonth('2026-12-15',1),'2027-01-01');
  assert.equal(c.nextOccurrence(c.newItem({deadline:'2026-01-31',recurrence:'monthly'})),'2026-02-28');
  assert.equal(c.nextOccurrence(c.newItem({deadline:'2026-09-04',recurrence:'weekdays'})),'2026-09-07');
 });
 await test('Three-level hierarchy, project bonus and undo-safe XP',()=>{
  const p=c.newItem({kind:'project',title:'P'}),t=c.newItem({title:'T',parentId:p.id}),s=c.newItem({kind:'subtask',parentId:t.id,title:'S'});
  let data={items:[p,t,s],blocks:[],settings:{...c.DEFAULTS}};
  const before=structuredClone(data);data=c.applyLocal(data,c.completeOps(data,s.id));
  assert(data.items.every(i=>i.status==='done'));assert.equal(c.growth(data.items).projects,1);
  assert(c.growth(data.items).xp>=100);
  data=c.applyLocal(data,c.inverseOps(before,data));assert.equal(c.growth(data.items).xp,0);
 });
 await test('Recurring completion does not duplicate the next instance',()=>{
  let data={items:[c.newItem({title:'Repeat',deadline:'2026-09-06',recurrence:'daily'})],blocks:[],settings:{...c.DEFAULTS}};
  const id=data.items[0].id;data=c.applyLocal(data,c.completeOps(data,id));assert.equal(data.items.length,2);
  data=c.applyLocal(data,c.completeOps(data,id));data=c.applyLocal(data,c.completeOps(data,id));assert.equal(data.items.length,2);
 });
 await test('Planner skips fixed commitments, lunch and expired deadlines',()=>{
  const date=c.addDays(c.dateKey(),2),task=c.newItem({title:'Focused work',estimatedMinutes:240,deadline:c.addDays(date,2)}),late=c.newItem({title:'Expired',deadline:c.addDays(date,-1)});
  const fixed={id:c.uid(),title:'Fixed',start:c.iso(date,'09:00'),end:c.iso(date,'10:00'),locked:true,source:'google'};
  const data={items:[task,late],blocks:[fixed],settings:{...c.DEFAULTS,weekendStart:'09:00',weekendEnd:'18:00'}};
  const plan=c.schedulePlan(data,date,3);
  assert(plan.operations.length>0);assert(plan.skipped.some(x=>x.title==='Expired'));
  const generated=plan.operations.filter(x=>x.collection==='blocks'&&x.action==='upsert').map(x=>x.data);
  for(const b of generated){assert(!c.overlaps(b,fixed));const d=c.dateKey(b.start);assert(!c.overlaps(b,{start:c.iso(d,'12:00'),end:c.iso(d,'13:00')}));}
  for(let a=0;a<generated.length;a++)for(let b=a+1;b<generated.length;b++)assert(!c.overlaps(generated[a],generated[b]));
 });
 const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
 server=http.createServer((req,res)=>{let target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403);return res.end();}if(target===root||target.endsWith(path.sep))target=path.join(target,'index.html');if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');if(!fs.existsSync(target)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'text/plain'});fs.createReadStream(target).pipe(res);});
 await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
 const {chromium}=require(process.env.DAYBOARD_PLAYWRIGHT||'playwright');
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Seoul',locale:'ko-KR'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 const nav=async id=>{await page.locator(`.sidebar [data-action="nav"][data-id="${id}"]`).click();};
 const modal=page.locator('dialog#modal');
 async function close(){if(await modal.isVisible())await modal.locator('[data-action="close"]').first().click();}
 async function save(){await modal.locator('button[type="submit"]').click();await modal.waitFor({state:'hidden'});}
 async function screenshot(name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
 await test('Desktop sample opens without runtime errors or page overflow',async()=>{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'샘플 둘러보기'}).click();
  await page.locator('.timeline').waitFor();
  assert(await page.getByText('샘플 보드입니다.',{exact:false}).count());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await screenshot('desktop-today');assert.deepEqual(errors,[]);
 });
 await test('Create task with defaults and a deadline',async()=>{
  await page.locator('.topbar [data-action="add-item"]').click();await modal.locator('#title').fill('QA 새 업무');
  assert.equal(await modal.locator('#importance').inputValue(),'2');assert.equal(await modal.locator('#estimatedMinutes').inputValue(),'30');
  await modal.locator('#deadline').fill(c.addDays(c.dateKey(),3));await modal.locator('#estimatedMinutes').fill('60');await save();
  assert(await page.locator('#app').getByText('QA 새 업무',{exact:true}).count()>0);
 });
 await test('Project, task, subtask creation and parent progress update',async()=>{
  await nav('projects');await page.locator('[data-action="add-project"]').first().click();await modal.locator('#title').fill('QA 프로젝트');await save();
  const panel=page.locator('.project-panel').filter({hasText:'QA 프로젝트'});
  await panel.locator('[data-action="add-task-to-project"]').click();await modal.locator('#title').fill('QA 상위 업무');await save();
  await panel.locator('[data-action="add-subtask"]').click();await modal.locator('#title').fill('QA 세부 업무');await save();
  await panel.locator('.task-row').filter({hasText:'QA 세부 업무'}).locator('[data-action="complete"]').click();
  assert((await panel.innerText()).includes('100%'));
 });
 await test('Desktop kanban drag changes task state',async()=>{
  await nav('board');const card=page.locator('.kanban-card').filter({hasText:'QA 새 업무'});
  await card.dragTo(page.locator('[data-drop-status="doing"]'));
  assert.equal(await page.locator('[data-drop-status="doing"] .kanban-card').filter({hasText:'QA 새 업무'}).count(),1);
  await screenshot('desktop-board');
 });
 await test('Create a time block and display it in week and month views',async()=>{
  await nav('today');await page.locator('[data-action="new-block"]').click();await modal.locator('#title').fill('QA 타임블록');
  const d=c.addDays(c.dateKey(),1);await modal.locator('#startDate').fill(d);await modal.locator('#endDate').fill(d);await modal.locator('#startTime').fill('16:00');await modal.locator('#endTime').fill('17:00');await save();
  await nav('week');await screenshot('desktop-week');await nav('month');await screenshot('desktop-month');
  assert(await page.locator('.month').getByText('QA 타임블록',{exact:false}).count()>0);
 });
 await test('Proposal is not applied before approval, then appears after approval',async()=>{
  await nav('settings');await page.locator('[data-action="import-proposal"]').click();
  const op=c.upsert('items',c.newItem({title:'QA 승인 후 반영'}));
  await modal.locator('#proposal-json').fill(JSON.stringify({title:'QA 승인 검증',operations:[op]}));
  await modal.locator('button[type="submit"]').click();await modal.locator('[data-action="approve-proposal"]').waitFor();
  assert.equal(await page.locator('#app').getByText('QA 승인 후 반영',{exact:true}).count(),0);
  await modal.locator('[data-action="approve-proposal"]').click();await modal.waitFor({state:'hidden'});
  await nav('board');assert.equal(await page.locator('.kanban-card').filter({hasText:'QA 승인 후 반영'}).count(),1);
 });
 await test('Search and growth dialogs work',async()=>{
  await page.keyboard.press('Control+k');await modal.locator('#search-query').fill('QA 승인');assert(await modal.locator('#search-results').innerText().then(t=>t.includes('QA 승인 후 반영')));await close();
  await page.locator('.topbar [data-action="growth"]').click();assert((await modal.innerText()).includes('누적'));await close();
 });
 await test('Mobile 390px views fit and tap editing works',async()=>{
  await page.setViewportSize({width:390,height:844});
  for(const id of ['today','week','month','board','settings']){
   await page.locator(`.mobile-nav [data-action="nav"][data-id="${id}"]`).click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Mobile overflow: ${id}`);
   await screenshot('mobile-'+id);
  }
  await page.locator('.mobile-nav [data-id="board"]').click();await page.locator('.kanban-card').filter({hasText:'QA 새 업무'}).locator('[data-action="edit-item"]').click();
  await modal.locator('#status').selectOption('done');await save();
  assert.equal(await page.locator('[data-drop-status="done"] .kanban-card').filter({hasText:'QA 새 업무'}).count(),1);
 });
 await test('No JavaScript runtime errors during the interaction suite',()=>assert.deepEqual(errors,[]));
 await test('Live deployment serves the app and renders desktop/mobile sample',async()=>{
  const live=process.env.DAYBOARD_LIVE_URL;if(!live)throw new Error('Live URL required');
  await page.setViewportSize({width:1440,height:1000});
  let loaded=false;for(let attempt=0;attempt<6;attempt++){try{const r=await page.goto(live,{waitUntil:'networkidle',timeout:30000});if(r?.ok()&&await page.getByRole('button',{name:'샘플 둘러보기'}).count()){loaded=true;break;}}catch{}await page.waitForTimeout(5000);}
  assert(loaded,'Live site did not become available');await page.getByRole('button',{name:'샘플 둘러보기'}).click();await page.locator('.timeline').waitFor();await screenshot('live-desktop');
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('live-mobile');
 });
 await test('Public cloud API denies an invalid workspace key',async()=>{
  const r=await fetch(c.SUPABASE+'/rest/v1/rpc/dayboard_read',{method:'POST',headers:{apikey:c.PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_key:'not-a-workspace-key'}),signal:AbortSignal.timeout(20000)});
  const body=await r.text();assert(!r.ok);assert(body.includes('UNAUTHORIZED'));assert(!body.includes('key_hash'));
 });
}
run().catch(e=>{results.push({name:'Test harness',passed:false,error:String(e.stack||e)});console.error(e);}).finally(async()=>{
 if(browser)await browser.close();if(server)server.close();
 const report={testedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA||null,results,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length};
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(`RESULT ${report.passed} passed, ${report.failed} failed`);
 process.exitCode=report.failed?1:0;
});
