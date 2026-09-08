const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve('dayboard');
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png'};
const server=http.createServer((req,res)=>{let target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403);return res.end();}if(target===root||target.endsWith(path.sep))target=path.join(target,'index.html');if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');if(!fs.existsSync(target)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(target).pipe(res);});
(async()=>{
 await new Promise(r=>server.listen(4179,'127.0.0.1',r));
 const {chromium}=require(process.env.DAYBOARD_PLAYWRIGHT||'playwright');
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4179/',{waitUntil:'networkidle'});
  await page.evaluate(()=>{
   const fixture=document.createElement('div');fixture.id='completion-fixture';fixture.innerHTML=`
    <div class="j-time-wrap"><button class="check done"></button><button class="j-time-title"><span class="block-title">타임라인 완료</span><span class="block-time">09:00–10:00</span></button></div>
    <div class="j-cal-entry j-finished"><button class="check done"></button><button class="j-cal-title"><small>09:00</small><span>주간·월간 완료</span></button></div>
    <div class="kanban-column" data-drop-status="done"><article class="kanban-card"><div class="row"><button class="check done"></button><button class="title-button">업무 보드 완료</button></div><div class="meta">완료</div></article></div>
    <button class="dash-event is-finished"><span class="dash-event-title">간단 시간표 완료</span><span class="meta">완료</span></button>`;document.body.append(fixture);
  });
  const result=await page.evaluate(()=>{
   const decoration=s=>getComputedStyle(document.querySelector(s)).textDecorationLine;
   const bg=s=>getComputedStyle(document.querySelector(s)).backgroundColor;
   return {
    timeline:decoration('#completion-fixture .j-time-wrap .block-title'),
    calendar:decoration('#completion-fixture .j-cal-entry .j-cal-title span'),
    board:decoration('#completion-fixture .kanban-card .title-button'),
    agenda:decoration('#completion-fixture .dash-event-title'),
    timelineBg:bg('#completion-fixture .j-time-wrap')
   };
  });
  for(const [key,value] of Object.entries(result).filter(([k])=>k!=='timelineBg'))assert(value.includes('line-through'),`${key} missing line-through: ${value}`);
  assert.notEqual(result.timelineBg,'rgba(0, 0, 0, 0)','completed timeline must have a visible surface');
  assert.deepEqual(errors,[]);
  console.log('PASS completed-state visuals',result);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
