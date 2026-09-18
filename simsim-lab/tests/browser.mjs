import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TESTS,FLAGSHIPS,LOCALES} from '../src/definitions.mjs';
import {scoreSolo,scorePair} from '../src/core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=(process.env.BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const output=path.resolve(process.env.EVIDENCE_DIR||path.join(root,'qa-evidence'));
await fs.mkdir(output,{recursive:true});
const info=await (await fetch(base+'/build-info.json')).json();
const codes=info.locales,primary=codes.includes('ko')?'ko':codes[0];
const report={base,version:info.version,commit:info.commit,browser:'Playwright Chromium',fallbackReason:'Browser plugin not available',checks:[],screenshots:[],errors:[],viewports:[320,390,768,1440],locales:codes};
const pass=(name,detail)=>{report.checks.push({name,status:'pass',detail});console.log('PASS',name,detail||'');};
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage();
page.on('pageerror',error=>report.errors.push(String(error)));
page.on('console',msg=>{if(msg.type()==='error')report.errors.push(msg.text());});
const assetFailures=[];page.on('response',response=>{if(response.status()>=400)assetFailures.push(`${response.status()} ${response.url()}`);});
const go=async(relative)=>{await page.goto(base+relative,{waitUntil:'networkidle'});await page.locator('#main h1').waitFor();};
const shot=async(name,fullPage=false)=>{await page.screenshot({path:path.join(output,name),fullPage,animations:'disabled'});report.screenshots.push(name);};
const overflow=async()=>page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
async function complete(p,answers,{capture=false}={}){
 await p.locator('[data-action="start"]').click();
 for(let i=0;i<8;i++){
  await p.locator('.question-counter').waitFor();
  await p.waitForFunction(n=>document.querySelector('.progress-track')?.getAttribute('aria-valuenow')===String(n),i);
  if(capture&&i===3)await shot('desktop-question.png');
  await p.locator(`[data-action="answer"][data-value="${answers[i]}"]`).click();
 }
 await p.locator('.result-card, .invite-card').waitFor();
}
try{
 assert.equal(info.quizDefinitions,50);assert.equal(info.localizedQuizzes,codes.length*50);assert.equal(info.localizedQuestions,codes.length*400);assert.equal(info.localizedOutcomes,codes.length*300);
 pass('Build manifest contains every requested quiz and localized question');
 for(const code of codes){
  await go(`/${code}/`);
  assert.equal(await page.locator('html').getAttribute('lang'),code);
  assert.equal(await page.locator('html').getAttribute('dir'),code==='ar'?'rtl':'ltr');
  assert.equal(await page.locator('.featured-grid .quiz-card').count(),8);
  assert.equal(await page.locator('#catalog-grid .quiz-card').count(),50);
  assert.equal(await page.locator('.duo-list a').count(),5);
  assert.deepEqual(await page.locator('.featured-grid .quiz-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.slug)),FLAGSHIPS);
  assert.equal(await page.locator('link[rel="alternate"][hreflang]').count(),codes.length+1);
  assert.equal(await overflow(),false,`${code} desktop overflow`);
  if(['ko','en','ar','ja','hi','th'].includes(code))await shot(`home-${code}-desktop.png`);
  await go(`/${code}/tests/rpg-class/`);
  await complete(page,[0,1,2,3,0,1,2,3]);
  assert.equal(await page.locator('.result-card').getAttribute('data-result-key'),'strategist');
  assert.equal(await page.locator('.metric').count(),4);
  const before=await page.locator('.result-top h2').innerText();await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.result-top h2').innerText(),before);
  const dl=page.waitForEvent('download');await page.locator('[data-action="save-image"]').click();const file=await dl;await file.saveAs(path.join(output,`card-${code}.png`));
  const bytes=await fs.readFile(path.join(output,`card-${code}.png`));assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),1350);assert.ok(bytes.length>12000);
  if(['ko','en','ar','hi','th'].includes(code))await shot(`result-${code}-desktop.png`,true);
 }
 pass('Every locale loads, shares global flagship order, completes RPG, restores results and saves a 1080x1350 PNG');
 for(const t of TESTS){
  await go(`/${primary}/tests/${t.slug}/`);
  const a=[0,1,2,3,0,1,2,3];await complete(page,a,{capture:t.slug==='rpg-class'});
  if(t.mode==='solo'){assert.equal(await page.locator('.result-card').getAttribute('data-result-key'),scoreSolo(a).key);}
  else assert.equal(await page.locator('.invite-card').count(),1);
 }
 pass('All 50 quizzes complete through actual answer-button interactions');
 await go(`/${primary}/`);
 await page.locator('[data-action="filter"][data-category="daily"]').click();assert.equal(await page.locator('#catalog-grid .quiz-card').count(),10);
 await page.locator('[data-action="filter"][data-category="duo"]').click();assert.equal(await page.locator('#catalog-grid .quiz-card').count(),5);
 await page.locator('[data-action="filter"][data-category="all"]').click();
 await page.locator('#catalog-search').fill('this query has absolutely no matching quiz');assert.equal(await page.locator('#catalog-grid .quiz-card').count(),0);
 await page.locator('[data-action="reset-filter"]').click();assert.equal(await page.locator('#catalog-grid .quiz-card').count(),50);
 const star=page.locator('.featured-grid [data-action="favorite"]').first();const slug=await star.getAttribute('data-slug');await star.click();assert.equal(await star.getAttribute('aria-pressed'),'true');
 await go(`/${primary}/saved/`);assert.ok(await page.locator(`.quiz-card[data-slug="${slug}"]`).count()>0);
 pass('Category filters, empty search, reset and favorites');
 for(const t of TESTS.filter(t=>t.mode==='duo')){
  await go(`/${primary}/tests/${t.slug}/`);
  const a=[0,0,1,1,2,2,3,3],b=[3,0,2,1,1,2,0,3];await complete(page,a);
  await page.locator('[data-action="copy-invite"]').click();let url=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(url.includes('#i=1.'));assert.ok(url.length<180);
  const receiverLocale=codes.includes('ar')?'ar':(codes.includes('es')?'es':primary);
  url=url.replace(`/${primary}/tests/`,`/${receiverLocale}/tests/`);
  const receiver=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});const p=await receiver.newPage();p.on('pageerror',e=>report.errors.push(String(e)));
  await p.goto(url,{waitUntil:'networkidle'});await p.locator('.intro-invite').waitFor();assert.equal(await p.locator('input[name="email"],input[name="name"]').count(),0);
  await complete(p,b);const expected=scorePair(a,b);assert.equal(await p.locator('.result-card').getAttribute('data-result-key'),expected.key);
  const values=await p.locator('.metric-label strong').allTextContents();assert.deepEqual(values.map(Number),expected.metrics);
  assert.ok(p.url().includes('#c='));const title=await p.locator('.result-top h2').innerText();await p.reload({waitUntil:'networkidle'});assert.equal(await p.locator('.result-top h2').innerText(),title);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false);
  if(t.slug==='friend-compatibility'){await p.screenshot({path:path.join(output,'two-player-mobile.png'),fullPage:true});report.screenshots.push('two-player-mobile.png');}
  await receiver.close();
 }
 pass('All five two-player tests work in an independent device context and another locale');
 await go(`/${primary}/tests/rpg-class/`);await page.locator('[data-action="start"]').click();
 await page.locator('[data-value="0"]').click();await page.waitForFunction(()=>document.querySelector('.progress-track')?.getAttribute('aria-valuenow')==='1');
 await page.locator('[data-action="previous"]').click();assert.equal(await page.locator('.answer.selected').getAttribute('data-value'),'0');
 await page.locator('[data-action="exit"]').click();assert.equal(await page.locator('#exit-dialog').isVisible(),true);await page.locator('[data-action="stay"]').click();assert.equal(await page.locator('#exit-dialog').isVisible(),false);
 await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('[data-action="resume"]').count(),1);
 await page.locator('[data-action="resume"]').click();assert.equal(await page.locator('.answer.selected').getAttribute('data-value'),'0');
 pass('Previous answers, exit cancellation and session resume');
 await go(`/${primary}/tests/friend-compatibility/#i=1.19.invalid.bad`);assert.equal(await page.locator('.error-page').count(),1);
 pass('Invalid invitation payload is rejected');
 await go(`/${primary}/results/rpg-class/strategist/`);assert.equal(await page.locator('.metric').count(),0);
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true});Object.defineProperty(navigator,'share',{value:undefined,configurable:true});});
 await page.locator('[data-action="share-result"]').click();assert.equal(await page.locator('#manual-copy').isVisible(),true);
 pass('Preview pages do not invent personal metrics; sharing has a manual-copy fallback');
 for(const code of codes){for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:844});await go(`/${code}/`);assert.equal(await overflow(),false,`${code} homepage overflow at ${width}`);
  if(width===390&&['ko','en','ar','hi','th','de'].includes(code))await shot(`home-${code}-mobile.png`,true);
  await go(`/${code}/results/rpg-class/pathfinder/`);assert.equal(await overflow(),false,`${code} result overflow at ${width}`);
  if(width===390&&['ko','ar','hi','th'].includes(code))await shot(`result-${code}-mobile.png`,true);
 }}
 pass('Home and result pages have no horizontal overflow at 320/390/768/1440px in every locale');
 await page.setViewportSize({width:1440,height:1000});await go(`/${primary}/privacy/`);await page.locator('[data-action="clear-data"]').click();assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('simsim.v2.'))),false);
 pass('Explicit local-data deletion');
 assert.deepEqual(assetFailures,[]);assert.deepEqual(report.errors,[]);pass('No failed assets, JavaScript exceptions or console errors');
 report.success=true;
}catch(error){report.success=false;report.failure=error.stack;try{await shot('failure.png',true);}catch{}throw error;}
finally{await fs.writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));await browser.close();}
