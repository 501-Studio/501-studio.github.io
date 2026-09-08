// Synthetic reproduction of the reported whole-workspace INVALID_PARENT failure.
// The browser never receives an owner key or real schedule. SQL checks run separately.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const out=path.resolve('dayboard-test-output/parent-fix'),root=path.resolve('dayboard');fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],consoleErrors=[];let server,browser,page;
async function test(name,fn){await fn();checks.push(name);console.log('PASS',name);}
async function wait(fn){for(let n=0;n<100;n++){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw new Error('Expected state did not settle');}
(async()=>{
 const c=await import(pathToFileURL(path.join(root,'core.js'))),j=await import(pathToFileURL(path.join(root,'journey-domain.js')));
 const d=c.dateKey(),p=c.newItem({kind:'project',title:'검증용 프로젝트'}),t=c.newItem({title:'검증용 상위 업무',parentId:p.id,status:'done',progress:100}),a=c.newItem({title:'검증용 세부 업무 A',parentId:t.id,status:'done',progress:100}),b=c.newItem({title:'검증용 세부 업무 B',parentId:t.id,status:'done',progress:100}),work=c.newItem({title:'버튼 저장 확인',parentId:p.id,deadline:d});
 let snapshot={workspaceId:c.uid(),name:'Synthetic regression only',revision:33,state:{items:[p,t,a,b,work],blocks:[{id:c.uid(),taskId:work.id,title:work.title,start:c.iso(d,'09:00'),end:c.iso(d,'10:00'),source:'app',locked:false,allDay:false}],settings:{...c.DEFAULTS}},proposals:[],history:[]};
 let writes=0,failNext=false;
 const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
 server=http.createServer((req,res)=>{let f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(f===root)f=path.join(f,'index.html');if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'text/plain'});fs.createReadStream(f).pipe(res);});
 await new Promise(r=>server.listen(4175,'127.0.0.1',r));
 const {chromium}=require(process.env.DAYBOARD_PLAYWRIGHT||'playwright');browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:960,height:1032},timezoneId:'Asia/Seoul',locale:'ko-KR'});
 await ctx.addInitScript(()=>localStorage.setItem('dayboard.key','synthetic-key-only'));
 await ctx.route('https://mahmzgdseyamqcffxwyd.supabase.co/rest/v1/rpc/**',async route=>{
  const payload=route.request().postDataJSON(),method=route.request().url().split('/').pop();
  if(method==='dayboard_apply'){
   writes++;
   if(failNext){failNext=false;return route.fulfill({status:400,json:{message:'INVALID_PARENT',code:'P0001'}});}
   if(payload.p_base_revision!==snapshot.revision)return route.fulfill({status:400,json:{message:'VERSION_CONFLICT'}});
   snapshot={...snapshot,state:c.applyLocal(snapshot.state,payload.p_operations),revision:snapshot.revision+1};
  }
  return route.fulfill({json:snapshot});
 });
 page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});page.on('dialog',d=>d.accept());
 const nav=async v=>page.locator(`.sidebar [data-action=nav][data-id="${v}"]`).click();
 const check=async()=>page.locator(`[data-action=complete][data-id="${work.id}"]:visible`).first().click();
 await test('Existing malformed data remains readable; version and page identity are correct',async()=>{await page.goto('http://127.0.0.1:4175/',{waitUntil:'networkidle'});await page.locator('.dashboard-grid').waitFor();assert.equal(await page.title(),'Dayboard · 나의 일정');assert.equal(await page.evaluate(()=>window.dayboardVersion),c.VERSION);});
 await test('Malformed hierarchy rejects completion without writes, credentials loss or false offline banner',async()=>{await check();await page.locator('.save-error').waitFor();assert((await page.locator('#toast').innerText()).includes('상위 연결'));assert.equal(writes,0);assert.equal(await page.locator('.offline-banner').count(),0);assert.equal(snapshot.revision,33);assert.equal(await page.evaluate(()=>localStorage.getItem('dayboard.key')),'synthetic-key-only');});
 await test('Reproduction: unrelated adventure write also rejects until hierarchy is repaired',async()=>{await nav('adventure');await page.locator('[data-action=v3-motion]').click();await page.locator('.save-error').waitFor();assert.equal(writes,0);});
 await test('Refresh loads an externally repaired revision without replacing the workspace',async()=>{snapshot.state.items=snapshot.state.items.map(i=>[a.id,b.id].includes(i.id)?{...i,kind:'subtask'}:i);snapshot.revision=34;await page.locator('[data-action=refresh]').first().click();await wait(()=>page.locator('#toast').innerText().then(t=>t.includes('최신 일정')));await page.locator('[data-action=dismiss-save-error]').click();assert.equal(await page.locator('.save-error').count(),0);assert.equal(await page.locator('.offline-banner').count(),0);});
 await test('After repair: today completion saves; week view can undo it',async()=>{await nav('today');await check();await wait(()=>snapshot.state.items.find(i=>i.id===work.id).status==='done');await nav('week');await check();await wait(()=>snapshot.state.items.find(i=>i.id===work.id).status==='todo');assert.equal(await page.locator('.save-error').count(),0);await page.screenshot({path:path.join(out,'week-fixed-desktop.png'),fullPage:true});});
 await test('Rejected server response is translated and leaves connection intact; next valid save recovers',async()=>{await nav('adventure');failNext=true;const before=snapshot.revision;await page.locator('[data-action=v3-motion]').click();await page.locator('.save-error').waitFor();assert.equal(snapshot.revision,before);assert.equal(await page.locator('.offline-banner').count(),0);assert((await page.locator('.save-error').innerText()).includes('상위 연결'));await page.locator('[data-action=v3-motion]').click();await wait(()=>snapshot.revision===before+1);await wait(()=>page.locator('.save-error').count().then(n=>n===0));});
 await test('Reflection save succeeds against repaired state',async()=>{await nav('stats');await page.locator('#reflection-form [name=win]').fill('검증용 회고');await page.locator('#reflection-form button[type=submit]').click();await wait(()=>snapshot.state.settings.reflections?.[d]?.win==='검증용 회고');assert.equal(await page.locator('.offline-banner').count(),0);});
 await test('960px desktop and 390px mobile retain readable layouts and working navigation',async()=>{await nav('adventure');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'adventure-fixed-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.locator('.mobile-nav [data-id=stats]').click();await page.locator('.j-stats').waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'statistics-fixed-mobile.png'),fullPage:true});});
 await test('No runtime errors; only the intentionally injected HTTP 400 appears in console',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors.filter(m=>!m.includes('400')&&!m.includes('net::ERR_ABORTED')),[]);});
})().catch(async error=>{console.error(error.stack||error);checks.push({failed:true,error:String(error)});if(page)try{await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});}catch{}process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.close();fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({passed:checks.filter(c=>typeof c==='string').length,failed:checks.filter(c=>typeof c!=='string').length,checks,errors,consoleErrors,environment:'GitHub Actions Playwright/Chromium: synthetic corrupted-then-repaired workspace and mocked RPC. No owner data or Google credentials.'},null,2));});
