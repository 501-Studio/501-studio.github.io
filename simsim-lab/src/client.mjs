import {TESTS,BY_SLUG,LOCALES,RESULT_KEYS,PAIR_KEYS,CONTENT_VERSION} from './definitions.mjs';
import {validAnswers,validProgress,scoreSolo,scorePair,encodeAnswers,decodeAnswers,quizPath,resultPath,normalizeLocale} from './core.mjs';
import {card,introPage,questionPage,invitationPage,resultPage,savedPage,errorPage,esc,fmt} from './components.mjs';
import {track,configureAnalytics} from './integrations/analytics.mjs';

const boot=JSON.parse(document.querySelector('#simsim-boot').textContent);
const c=boot,u=c.ui,main=document.querySelector('#main');
const PREFIX='simsim.v2.',STAR=PREFIX+'stars',RECENT=PREFIX+'recent',RESULTS=PREFIX+'results';
let quiz=null,phase=boot.page,progress=null,inviteToken='',inviter=null,current=null,advanceTimer=0,toastTimer=0,routeVersion=0,category='all',search='';
const read=(where,key,fallback)=>{try{return JSON.parse(window[where].getItem(key))??fallback;}catch{return fallback;}};
const write=(where,key,value)=>{try{window[where].setItem(key,JSON.stringify(value));return true;}catch{return false;}};
const cleanSlugs=value=>Array.isArray(value)?[...new Set(value.filter(slug=>typeof slug==='string'&&BY_SLUG[slug]))].slice(0,50):[];
const stars=()=>cleanSlugs(read('localStorage',STAR,[]));
const recent=()=>cleanSlugs(read('localStorage',RECENT,[])).slice(0,12);
const savedResults=()=>{const rows=read('localStorage',RESULTS,[]);return Array.isArray(rows)?rows.filter(row=>row&&BY_SLUG[row.slug]&&[...RESULT_KEYS,...PAIR_KEYS].includes(row.key)&&typeof row.hash==='string'&&row.hash.length<100&&/^(?:#(?:r|c)=[0-9a-z.~]+)?$/.test(row.hash)).slice(0,30):[];};
function event(name,extra={}){track(name,{locale:c.locale,quizSlug:quiz?.slug,referrer:document.referrer,...extra});}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
function focusHeading(){const h=main.querySelector('h1');if(h){h.tabIndex=-1;h.focus({preventScroll:true});}}
function render(html,newPhase){clearTimeout(advanceTimer);main.innerHTML=html;phase=newPhase;document.body.classList.toggle('is-playing',phase==='quiz');window.scrollTo({top:0,behavior:'instant'});focusHeading();paintStars();}
function paintStars(){const set=new Set(stars());document.querySelectorAll('[data-action="favorite"]').forEach(b=>b.setAttribute('aria-pressed',String(set.has(b.dataset.slug))));}
function progressKey(){return `${PREFIX}progress.${quiz.slug}.${inviteToken||'self'}`;}
function getProgress(){const p=read('sessionStorage',progressKey(),null);if(!p||p.version!==CONTENT_VERSION||p.slug!==quiz.slug||!validProgress(p.answers)||!Number.isInteger(p.step)||p.step<0||p.step>7||p.step>p.answers.length)return null;return p;}
function persist(){return write('sessionStorage',progressKey(),progress);}
function start(resume=false){progress=resume?getProgress():null;if(!progress||progress.done)progress={version:CONTENT_VERSION,slug:quiz.slug,answers:[],step:0,done:false};if(!persist())toast(u.storageOff);event('quiz_start');showQuestion();}
function showQuestion(){render(questionPage(c,quiz,progress),'quiz');}
function choose(value){if(phase!=='quiz'||!Number.isInteger(value)||value<0||value>3)return;clearTimeout(advanceTimer);progress.answers[progress.step]=value;persist();event('question_answer');main.querySelectorAll('.answer').forEach(b=>{const on=Number(b.dataset.value)===value;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});main.querySelector('[data-action="next"]').disabled=false;advanceTimer=setTimeout(next,280);}
function next(){clearTimeout(advanceTimer);if(phase!=='quiz'||!Number.isInteger(progress.answers[progress.step]))return;if(progress.step<7){progress.step++;persist();showQuestion();return;}complete();}
function rememberTest(){const list=[quiz.slug,...recent().filter(s=>s!==quiz.slug)].slice(0,12);write('localStorage',RECENT,list);}
function complete(){if(!validAnswers(progress.answers))return;progress.done=true;persist();rememberTest();event('quiz_complete');if(quiz.mode==='duo'&&!inviter){current={a:[...progress.answers],index:null,computed:null};render(invitationPage(c,quiz),'invite');return;}const a=inviter||progress.answers,b=inviter?progress.answers:null;showResult(a,b,true);}
function changeResultMetadata(index){const r=quiz.results[index],url=new URL(resultPath(c.base,c.locale,quiz.slug,r.key),location.origin).href;document.title=`${r.name} · ${quiz.title} | ${u.brand}`;const canonical=document.querySelector('link[rel="canonical"]');if(canonical)canonical.href=new URL(resultPath(c.base,c.locale,quiz.slug,r.key),c.siteURL).href;document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(link=>{const code=link.hreflang==='x-default'?'en':link.hreflang;link.href=new URL(resultPath(c.base,code,quiz.slug,r.key),c.siteURL).href;});for(const [selector,value] of [['meta[property="og:title"]',document.title],['meta[property="og:description"]',r.catchphrase],['meta[property="og:url"]',url],['meta[name="twitter:title"]',document.title]]){const node=document.querySelector(selector);if(node)node.content=value;}}
function showResult(a,b=null,updateURL=false){const computed=quiz.mode==='duo'?scorePair(a,b):scoreSolo(a),index=computed.index;current={a:[...a],b:b?[...b]:null,index,computed};const hash=b?`#c=${encodeAnswers(quiz.id,a)}~${encodeAnswers(quiz.id,b)}`:`#r=${encodeAnswers(quiz.id,a)}`;if(updateURL)history.replaceState({simsim:true},'',resultPath(c.base,c.locale,quiz.slug,quiz.results[index].key)+hash);render(resultPage(c,quiz,index,computed),'result');changeResultMetadata(index);event('result_view',{resultType:quiz.results[index].key});if(b)event('two_player_complete',{resultType:quiz.results[index].key});}
function resultURL(){if(!current)return '';const path=resultPath(c.base,c.locale,quiz.slug,quiz.results[current.index].key);let hash='';if(current.a)hash=current.b?`#c=${encodeAnswers(quiz.id,current.a)}~${encodeAnswers(quiz.id,current.b)}`:`#r=${encodeAnswers(quiz.id,current.a)}`;return new URL(path+hash,location.origin).href;}
function invitationURL(){const a=current?.a;if(!validAnswers(a))return '';return new URL(quizPath(c.base,c.locale,quiz.slug)+`#i=${encodeAnswers(quiz.id,a)}`,location.origin).href;}
function caption(){return phase==='invite'?u.inviteText:fmt(quiz?.mode==='duo'?u.pairCaption:u.shareCaption,{result:quiz?.results[current?.index]?.name||quiz?.title||u.brand});}
async function copy(text,{invite=false,isLink=true}={}){try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(text);toast(u.copied);}catch{const host=document.querySelector('#copy-fallback');if(host){host.className='copy-fallback';host.innerHTML=`<label for="manual-copy">${esc(u.manualCopy)}</label><textarea id="manual-copy" readonly></textarea>`;const area=host.querySelector('textarea');area.value=text;area.focus();area.select();}else toast(u.manualCopy);}if(isLink)event('copy_link');if(invite)event('two_player_invite');}
async function share(url,invite=false){if(!url)return;const text=caption();if(navigator.share){try{await navigator.share({title:`${quiz.title} | ${u.brand}`,text,url});event(invite?'two_player_invite':'result_share',{resultType:quiz.results[current?.index]?.key});return;}catch(error){if(error.name==='AbortError')return;}}await copy(url,{invite});}
function saveCurrent(){if(!current)return;const url=new URL(resultURL()),row={slug:quiz.slug,key:quiz.results[current.index].key,hash:url.hash},list=savedResults().filter(v=>!(v.slug===row.slug&&v.key===row.key&&v.hash===row.hash));list.unshift(row);if(write('localStorage',RESULTS,list.slice(0,30)))toast(u.savedToast);else toast(u.storageOff);}
function renderSaved(){const rows=savedResults().map(row=>{const t=c.catalog.find(v=>v.slug===row.slug),keys=t?.mode==='duo'?PAIR_KEYS:RESULT_KEYS;return {...row,name:t?.resultNames?.[keys.indexOf(row.key)]||t?.title||u.resultLabel};});render(savedPage(c,stars(),recent(),rows),'saved');}
function toggleFavorite(slug){if(!BY_SLUG[slug])return;const list=stars(),index=list.indexOf(slug);if(index<0)list.push(slug);else list.splice(index,1);if(!write('localStorage',STAR,list)){toast(u.storageOff);return;}paintStars();if(phase==='saved')renderSaved();toast(index<0?u.savedToast:u.removedToast);}
function filterCatalog(){const needle=search.normalize('NFKC').toLocaleLowerCase(c.locale);const list=c.catalog.filter(t=>(category==='all'||t.category===category)&&`${t.title} ${t.description} ${t.categoryName}`.normalize('NFKC').toLocaleLowerCase(c.locale).includes(needle));const host=main.querySelector('#catalog-grid');if(!host)return;host.innerHTML=list.length?list.map(t=>card(c,t,{favorite:stars().includes(t.slug)})).join(''):`<div class="empty-state"><h2>${esc(u.noResults)}</h2><button class="button secondary" data-action="reset-filter">${esc(u.reset)}</button></div>`;main.querySelector('#catalog-count').textContent=fmt(u.allCount,{n:list.length});main.querySelectorAll('.filter').forEach(b=>{const on=b.dataset.category===category;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});}
function random(){const randomArray=new Uint32Array(1);crypto.getRandomValues(randomArray);const t=TESTS[randomArray[0]%TESTS.length];event('random_quiz_click',{quizSlug:t.slug});location.assign(quizPath(c.base,c.locale,t.slug));}
function clearData(){try{for(const storage of [localStorage,sessionStorage]){const keys=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PREFIX))keys.push(key);}keys.forEach(k=>storage.removeItem(k));}progress=null;paintStars();toast(u.cleared);}catch{toast(u.storageOff);}}
async function download(button){if(!current||button.disabled)return;button.disabled=true;try{const {makeResultImage,downloadBlob}=await import('./result-image.mjs');const blob=await makeResultImage(c,quiz,current.index,current.computed);downloadBlob(blob,`simsim-${quiz.slug}-${c.locale}.png`);event('result_image_save',{resultType:quiz.results[current.index].key});toast(u.imageSaved);}catch(error){console.error('SimsimLAB image export:',error);toast(u.downloadUnavailable);}finally{if(button.isConnected)button.disabled=false;}}

async function initializeQuiz(){
 const call=++routeVersion;
 try{
  if(!quiz){const response=await fetch(`${c.assetBase}content/${c.locale}/${c.slug}.json`,{credentials:'omit',cache:'force-cache'});if(!response.ok)throw new Error('Quiz content unavailable');quiz=await response.json();if(quiz.slug!==c.slug||quiz.locale!==c.locale||quiz.questions?.length!==8||quiz.results?.length!==6)throw new Error('Invalid quiz content');}
  if(call!==routeVersion)return;
  const params=new URLSearchParams(location.hash.slice(1));
  if(location.hash.length>160){render(errorPage(c),'error');return;}
  if(params.has('i')){
   if(quiz.mode!=='duo'){render(errorPage(c),'error');return;}
   inviteToken=params.get('i');inviter=decodeAnswers(inviteToken,quiz.id);if(!inviter){render(errorPage(c),'error');return;}
   const p=getProgress();render(introPage(c,quiz,{hasProgress:!!p&&!p.done&&p.answers.length>0,invited:true}),'intro');return;
  }
  if(params.has('r')){const a=decodeAnswers(params.get('r'),quiz.id);if(!a||quiz.mode==='duo'){render(errorPage(c),'error');return;}showResult(a);return;}
  if(params.has('c')){const tokens=params.get('c').split('~');const a=decodeAnswers(tokens[0],quiz.id),b=decodeAnswers(tokens[1],quiz.id);if(tokens.length!==2||!a||!b||quiz.mode!=='duo'){render(errorPage(c),'error');return;}showResult(a,b);return;}
  inviteToken='';inviter=null;
  if(boot.page==='result'){
   const index=quiz.results.findIndex(r=>r.key===boot.resultKey);if(index<0){render(errorPage(c),'error');return;}
   current={index,computed:null,a:null,b:null};render(resultPage(c,quiz,index,null),'result');event('result_view',{resultType:quiz.results[index].key});return;
  }
  const p=getProgress();render(introPage(c,quiz,{hasProgress:!!p&&!p.done&&p.answers.length>0}),'intro');
 }catch(error){if(call!==routeVersion)return;console.error('SimsimLAB content:',error);render(errorPage(c),'error');}
}

main.addEventListener('input',e=>{if(e.target.id==='catalog-search'){search=e.target.value.trim();filterCatalog();}});
document.addEventListener('click',async e=>{
 const link=e.target.closest('a[data-track-card],a[data-track-next]');if(link){const slug=link.dataset.trackCard||link.dataset.trackNext;event(link.dataset.source==='next'||link.dataset.trackNext?'next_quiz_click':'quiz_card_click',{quizSlug:slug});}
 const button=e.target.closest('[data-action]');if(!button||button.disabled)return;const action=button.dataset.action;
 if(action==='favorite'){e.preventDefault();toggleFavorite(button.dataset.slug);}
 if(action==='filter'){category=button.dataset.category;filterCatalog();}
 if(action==='reset-filter'){category='all';search='';main.querySelector('#catalog-search').value='';filterCatalog();}
 if(action==='random')random();
 if(action==='start'&&quiz)start(false);
 if(action==='resume'&&quiz)start(true);
 if(action==='answer')choose(Number(button.dataset.value));
 if(action==='next')next();
 if(action==='previous'&&phase==='quiz'&&progress.step>0){clearTimeout(advanceTimer);progress.step--;persist();showQuestion();}
 if(action==='exit'){clearTimeout(advanceTimer);document.querySelector('#exit-dialog').showModal();}
 if(action==='stay')document.querySelector('#exit-dialog').close();
 if(action==='confirm-exit'){document.querySelector('#exit-dialog').close();location.assign(`${c.base}${c.locale}/`);}
 if(action==='share-invite')await share(invitationURL(),true);
 if(action==='copy-invite')await copy(invitationURL(),{invite:true});
 if(action==='same-device')location.assign(invitationURL());
 if(action==='share-result')await share(resultURL());
 if(action==='copy-result')await copy(resultURL());
 if(action==='copy-caption')await copy(caption(),{isLink:false});
 if(action==='save-result')saveCurrent();
 if(action==='remove-result'){const rows=savedResults();rows.splice(Number(button.dataset.index),1);if(write('localStorage',RESULTS,rows)){renderSaved();toast(u.removedToast);}else toast(u.storageOff);}
 if(action==='save-image')await download(button);
 if(action==='clear-data')clearData();
});
document.querySelector('#locale-select')?.addEventListener('change',e=>{
 const code=e.target.value;if(!LOCALES.some(l=>l.code===code))return;
 event('locale_change',{locale:code});write('localStorage',PREFIX+'locale',code);
 let path=location.pathname;
 const segment=`${c.base}${c.locale}/`;
 if(path.startsWith(segment))path=`${c.base}${code}/`+path.slice(segment.length);else path=`${c.base}${code}/`;
 location.assign(path+location.hash);
});
window.addEventListener('hashchange',()=>{if(quiz&&['test','result'].includes(boot.page)){clearTimeout(advanceTimer);initializeQuiz();}});
window.addEventListener('pagehide',()=>clearTimeout(advanceTimer));
window.SimsimAnalytics=Object.freeze({configure:configureAnalytics});
window.SimsimLab=Object.freeze({version:'2.0.0',scoreSolo,scorePair,encodeAnswers,decodeAnswers});

if(boot.page==='root'&&/^#\//.test(location.hash)){location.replace(`${c.base}legacy/${location.hash}`);}
else if(boot.page==='root'){
 const preferred=read('localStorage',PREFIX+'locale',null),code=LOCALES.some(l=>l.code===preferred)?preferred:normalizeLocale(navigator.language);
 location.replace(`${c.base}${code}/`);
}else if(['test','result'].includes(boot.page))initializeQuiz();
else if(boot.page==='saved')renderSaved();
else if(boot.page==='home'){paintStars();event('homepage_view');}
