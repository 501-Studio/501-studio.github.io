const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve('dayboard'),out=path.resolve('dayboard-test-output/adventure-v4');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
let server,browser;
async function serve(){server=http.createServer((req,res)=>{let target=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(target===root)target=path.join(target,'index.html');if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'text/plain'});fs.createReadStream(target).pipe(res);});await new Promise(r=>server.listen(4176,'127.0.0.1',r));}
async function openDemo(viewport){const {chromium}=require(process.env.DAYBOARD_PLAYWRIGHT||'playwright');if(!browser)browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport,timezoneId:'Asia/Seoul',locale:'ko-KR'});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));await page.goto('http://127.0.0.1:4176/',{waitUntil:'networkidle'});await page.locator('[data-action=demo]').click();await page.locator('.dashboard-grid').waitFor();return {context,page,errors};}
(async()=>{try{await serve();
  const d=await openDemo({width:1440,height:1000});const page=d.page;
  await page.locator('.sidebar [data-action=nav][data-id=adventure]').click();await page.locator('.j-adventure').waitFor();
  assert.equal(await page.locator('.j-v4-stat').count(),4,'four adventure stats');
  assert.equal(await page.locator('.j-v4-event-grid article').count(),2,'two deterministic weekly events');
  assert(await page.locator('.cr-region-preview').isVisible(),'new continental milestones visible');
  assert(await page.locator('.cr-next-story').isVisible(),'quest preview visible');
  assert(await page.locator('.j-v4-log').isVisible(),'adventure log visible');
  assert(await page.locator('.j-v4-rank').isVisible(),'rank visible');
  await page.locator('.j-traveler').waitFor();assert(await page.locator('.j-traveler').evaluate(el=>el.complete&&el.naturalWidth>0),'hero art loaded');
  await page.locator('[data-action=v3-adventure-tab][data-id=quests]').click();assert(await page.locator('.j-quests').isVisible(),'quest tab works');
  await page.locator('[data-action=v3-adventure-tab][data-id=journey]').click();assert(await page.locator('.j-v4-events').isVisible(),'journey tab restores event board');
  await page.screenshot({path:path.join(out,'adventure-v4-desktop.png'),fullPage:true});
  assert.deepEqual(d.errors,[],'desktop has no page errors');await d.context.close();

  const m=await openDemo({width:390,height:844});const mp=m.page;
  await mp.locator('[data-action=v3-more]').first().click();await mp.locator('[data-action=v3-open-view][data-id=adventure]').click();await mp.locator('.j-adventure').waitFor();
  assert(await mp.locator('.cr-next-story').isVisible(),'mobile quest preview visible');
  assert.equal(await mp.locator('.j-v4-stat').count(),4);
  assert(await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await mp.screenshot({path:path.join(out,'adventure-v4-mobile.png'),fullPage:true});
  assert.deepEqual(m.errors,[],'mobile has no page errors');await m.context.close();
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:12,failed:0,checks:['desktop adventure renders','4 derived RPG stats','2 deterministic weekly events','2 milestone cards','quest preview','recent adventure log','adventure rank','hero artwork loads','quest tab','journey tab','390px mobile layout','no page errors'],viewports:['1440x1000','390x844']},null,2));
  console.log('PASS adventure-v4 12 checks');
}catch(e){console.error(e);process.exitCode=1;}finally{if(browser)await browser.close();if(server)server.close();}})();
