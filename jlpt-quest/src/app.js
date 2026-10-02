import {tutorialView} from './tutorial.js';
import {freshTutorial,normalizeTutorial,tutorialProgress,shouldOfferTutorial,TUTORIAL_STEPS} from './tutorial-state.js';
import {loadTutorial,storeTutorial} from './storage.js';
import {advanced,hubEntry,hubView,examView,commuteView,monthlyPanel,wordSelectionBar,selectedWordButton,handleAdvanced,mountAdvanced,disposeAdvanced} from './advanced-ui.js';
import {INTENSITIES,intensityKey,policyDescription,completedWord} from './learning-policy.js';
import {recordStroke} from './study-data.js';
import {statisticsView} from './statistics-ui.js';
import {wordStatus} from './statistics.js';
import {startWordPractice,advanceWordPractice,REPEAT_OPTIONS} from './word-practice.js';
import {practiceView,mountPractice} from './practice-ui.js';
import {kanaHome,kanaPractice,mountKana,handleKanaAction,kanaEntry} from './kana-ui.js';
import {loadExamples,exampleButton,exampleBody,examplesFor} from './examples.js';
import {enterReview,swapSession,restartSession,finishSession,lessonName,startClassSession} from './session-controls.js';
import {syncReminders,offerReviewPermission,requestReviewPermission} from './reminders.js';
import {configureAudio} from './audio.js';
import {fitHeadwords} from './fit-text.js';
import {premiumScreen,refreshCommerce,commerceStatus,handleCommerceAction,notifyScreen} from './commerce.js';
import {LEVELS,TITLES,courses,writingChars,writingPattern} from './catalog.js';
import {fresh,current,createClass,classifySurvey,createReview,submit,next,remediate,unresolved,levelStats,dueItems,dueLabel,dayKey,streak,keyOf,validateState,courseLaps} from './course-engine.js';
import {openStore,loadState,commit,rawState,replaceBackup,ConflictError} from './storage.js';
import {packs,catalog,initializePacks,packInfo} from './packs.js';
import {btn,icon,esc,mark,ring,wave,heading,empty} from './view.js';
import {attachStrokePad} from './stroke-pad.js';
import {SNAP_MODE,validPrefix} from './stroke-match.js';
import {loadStrokeBank,characterStrokes,requireStrokes} from './stroke-bank.js';
import {speak,speakSentence,stopAudio} from './audio.js';
import {isNative,callNative,installBridge} from './native.js';
import {applyMotion,haptic,celebrate} from './motion.js';

const root=document.querySelector('#app'),modal=document.querySelector('#modal-root');
let state=fresh(),words=[],lookup=new Map(),ready=false,saving=false,busy=false,ink=null,storageOK=true,warning='',toastTimer,epoch=0,audioNonce=0,gradeNonce=0,autoVoiceWarned=false;
let modalFit=()=>{},footerObserver=null,budgetTimer=null,promptClock={id:null,at:0};
let tutorialRecord=freshTutorial(),tutorialSession=null,tutorialWrites=Promise.resolve(),tutorialSuppressed=false,tutorialSaveFailed=false;
let statsView={days:7,level:'all',date:null},practiceWordId=null,practiceRepeats=3;
let filter='due',wordFilter='all',search='',limit=80,courseLimit=24,pendingCourse=null,imported=null,priorFocus=null;
let savedRevision=0,tail=Promise.resolve(),stopFitting=()=>{};
const names={survey:'빠른 회독',study:'새 단어',audio:'발음 듣기',trace:'한자 따라 쓰기',meaning:'뜻 확인',listening:'듣기 시험',writing:'한자 쓰기 시험'};
const route=()=>location.hash.slice(1)||'home';
const advancedContext=()=>({state,words,save,render,toast,go,openModal,closeModal,modalHead,cancelWork});
const W=id=>lookup.get(id)||state.session?.wordSnapshots?.find(w=>w.id===id)||state.suspendedSession?.wordSnapshots?.find(w=>w.id===id);
function mergeWords(){
 words=catalog();lookup=new Map(words.map(w=>[w.id,w]));
 for(const session of [state.session,state.suspendedSession].filter(Boolean)){
  const old=new Map((session.wordSnapshots||[]).map(w=>[w.id,w]));
  if(session.contentRevision!=='036-editorial-1'){
   for(const t of session.queue){
    if(t.phase==='quiz'&&t.skill==='meaning'){
     const replacements=new Map();for(const [id,w]of old){if(lookup.has(id))replacements.set(w.meaning,lookup.get(id).meaning);}
     t.options=(t.options||[]).map(x=>replacements.get(x)||x);
     const correct=lookup.get(t.wordId)?.meaning;
     if(correct&&!t.options.includes(correct))t.options[0]=correct;
     t.options=[...new Set(t.options)];
     if(t.options.length<4){for(const w of words){if(w.level===W(t.wordId)?.level&&!t.options.includes(w.meaning))t.options.push(w.meaning);if(t.options.length===4)break;}}
    }
   }
   session.selection=null;session.contentRevision='036-editorial-1';
  }
  session.wordSnapshots=session.wordIds.map(id=>lookup.get(id)||old.get(id)).filter(Boolean);
 }
}
function toast(text){const t=document.querySelector('#toast');t.textContent=text;t.className='on show';clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.className='',4500);}
function save(){
 state.uiRoute=route();const snapshot=structuredClone(state),generation=epoch;
 const job=tail.then(async()=>{if(generation!==epoch||!storageOK)return false;saving=true;
 try{const saved=await commit(snapshot,savedRevision);savedRevision=saved.revision;state.revision=savedRevision;syncReminders(state).catch(()=>{});return true;}
 catch(e){epoch++;if(e instanceof ConflictError){state=await loadState();savedRevision=state.revision;mergeWords();toast(e.message);render();}else{storageOK=false;warning='저장에 실패했습니다. 학습을 멈추고 설정에서 백업해 주세요.';toast(warning);render();}return false;}finally{saving=false;}});
 tail=job.catch(()=>false);return job;
}
function cancelWork(){audioNonce++;gradeNonce++;stopAudio();busy=false;}
function go(name){if(route()===name)render();else location.hash=name;}
function showReading(w){return state.settings.furigana&&w.reading?`<span class="reading" lang="ja">${esc(w.reading)}</span>`:'';}
function wordHTML(w,large=false){return `<div class="${large?'big-japanese':'japanese'}"><strong lang="ja" ${large?'data-fit-word data-max-font="60"':''}>${esc(w.word)}</strong>${showReading(w)}</div>`;}
function levelButtons(){return `<div class="level-tabs" role="group" aria-label="학습 급수">${LEVELS.map(l=>`<button data-action="level" data-level="${l}" class="${state.settings.level===l?'active':''}" aria-pressed="${state.settings.level===l}">${l}</button>`).join('')}</div>`;}
const menus=[['home','home','홈'],['course','book','학습'],['review','refresh','복습'],['words','library','단어장'],['profile','chart','내 기록']];
function nav(mobile=false){return `<nav class="${mobile?'bottom-nav':'side-nav'}" aria-label="${mobile?'모바일 메뉴':'주 메뉴'}">${menus.map(([id,ic,label])=>`<a href="#${id}" class="${route()===id?'active':''}" ${route()===id?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></a>`).join('')}</nav>`;}
function shell(body){const d=state.daily[dayKey()]?.keys.length||0;return `<aside class="sidebar"><a class="brand" href="#home">${mark()}<span>JLPT 코토바</span></a>${nav()}<div class="sidebar-bottom"><button class="quiet-link" data-action="settings">${icon('settings')}설정</button><a href="./privacy.html">개인정보처리방침</a><a href="./terms.html">이용약관</a><a href="./licenses.html">오픈소스·저작권</a></div></aside><div class="workspace">${warning?`<div class="store-warning" role="alert">${esc(warning)}</div>`:''}<header class="appbar"><a class="mobile-brand" href="#home">${mark()}<b>JLPT 코토바</b></a><span class="desktop-title">나의 일본어 수업</span><div class="appbar-tools"><button class="reading-toggle ${state.settings.furigana?'active':''}" data-action="furigana" aria-pressed="${state.settings.furigana}" aria-label="히라가나 ${state.settings.furigana?'끄기':'켜기'}"><span lang="ja">あ</span><span>${state.settings.furigana?'켜짐':'꺼짐'}</span></button><button class="icon-btn" data-action="settings" aria-label="설정">${icon('settings')}</button></div></header><div class="layout"><main class="page" id="main">${body}</main><aside class="right-rail"><section class="panel rail-goal"><div class="today-summary"><span>오늘 푼 문제</span><b>${d}개</b><span>${streak(state)}일 연속 학습</span></div></section><section class="panel"><h3>수업 순서</h3><ol class="class-flow"><li>새 단어와 뜻 확인</li><li>발음을 듣고 한자 쓰기</li><li>모르는 단어만 확인</li><li>오답 복습</li></ol><p class="fine">오답을 모두 통과하면 완료됩니다.</p></section></aside></div></div>${nav(true)}`;}
function resume(){return [state.session,state.suspendedSession].map((s,i)=>s&&!s.finished?`<section class="resume"><div><b>${esc(lessonName(s))} · ${i?'보관 중':'진행 중'}</b><p>${s.index+1} / ${s.queue.length}단계 · 필기와 답 선택도 저장돼요</p></div><div class="resume-actions">${btn(i?'switch-session':'resume','이어서 하기','soft')}${i?'':btn('restart-session','이번 회차 처음부터','text')}</div></section>`:'').join('');}
function home(){
 const l=state.settings.level,list=courses(words,l),c=list.find(c=>!state.completed[c.id])||list[0],due=dueItems(state,words).length,lap=courseLaps(state,c.id)+1;
 return `<div class="home-dashboard">${heading('JLPT 단어 학습','급수를 고르고, 모르는 단어부터 차근차근')}${resume()}${practiceResume()}${levelButtons()}
 <section class="panel study-start" aria-labelledby="study-start-title"><div class="study-start-copy"><span class="label">${l} · ${lap}회독</span><h2 id="study-start-title">제${c.index}장 · ${esc(c.title)}</h2><p>${c.wordIds.length}단어를 확인하고, 모르는 단어만 듣고 써요.</p><ol class="study-start-steps" aria-label="학습 순서"><li>단어 확인</li><li>듣기·쓰기</li><li>시험·복습</li></ol></div>${btn('start-course',`${icon('next')} ${l} 제${c.index}장 학습 시작`,'primary wide',`data-id="${c.id}" ${storageOK?'':'disabled'}`)}<a class="study-chapters" href="#course">전체 ${list.length}개 챕터 보기 ${icon('next')}</a></section>
 <div class="home-shortcuts"><a class="panel shortcut" href="#review"><span class="soft-icon lavender">${icon('refresh')}</span><div><b>오늘 복습</b><p>${due?`${l} · 지금 ${due}문제`:'복습 일정 · 미리 복습'}</p></div>${icon('next')}</a><a class="panel shortcut" href="#words"><span class="soft-icon mint">${icon('library')}</span><div><b>단어장</b><p>검색 · 별표 · 듣기·쓰기</p></div>${icon('next')}</a></div>
 <section class="panel levels-panel"><div class="section-title"><h2>급수별 학습 현황</h2><span>학습 현황</span></div><div class="level-progress-grid">${LEVELS.map(level=>{const st=levelStats(state,words,level);return `<button data-action="level" data-level="${level}" class="level-progress ${level===l?'selected':''}" aria-pressed="${level===l}"><div><b>${level}</b><span>${st.learned}<small> / ${st.total.toLocaleString()}</small></span></div><span class="line-progress"><i style="width:${st.total?st.learned/st.total*100:0}%"></i></span><small>아는 단어 ${st.known} · 복습 ${st.due}</small></button>`;}).join('')}</div></section>
 ${hubEntry()}${kanaEntry(state)}</div>`;
}
function curriculum(){
 const l=state.settings.level,p=packInfo(l),list=courses(words,l);
 return `${heading('커리큘럼','챕터를 완료하면 회독 수가 올라갑니다.')}${kanaEntry(state)}${levelButtons()}
 <section class="panel pack-banner"><div><span class="label">${l}</span><h2>${TITLES[l]}</h2><p>${p.installed.toLocaleString()}단어 · ${list.length}개 챕터</p></div></section>
 <div class="chapter-library">${list.slice(0,courseLimit).map(c=>{const laps=courseLaps(state,c.id),current=state.session?.course?.id===c.id&&!state.session.finished;return `<button class="chapter-book ${current?'current':''}" data-action="start-course" data-id="${c.id}">${current?'<span class="book-ribbon">진행중</span>':''}<span class="book-spine"></span><span class="book-copy"><b>${l}</b><strong>第${c.index}章</strong><span>${Math.max(1,laps+1)}회독</span><small>No.${c.startNo}~${c.endNo}</small></span><span class="book-open">${icon('book')}</span></button>`;}).join('')}</div>
 ${list.length>courseLimit?btn('more-courses','챕터 더 보기','soft wide'):''}
 <div class="info-note">${icon('book')}<div>회독을 시작하면 먼저 30단어를 아는 단어/모르는 단어로 분류하고, 모르는 단어만 집중 학습·시험합니다.</div></div>`;
}
function review(){
 const now=Date.now(),rows=dueItems(state,words,now,filter),due=dueItems(state,words,now),early=dueItems(state,words,now,'preview');
 return `${heading('복습','기억이 흐려질 때 다시 확인하세요.')}${resume()}${levelButtons()}
 <section class="panel review-summary"><span class="soft-icon lavender">${icon('refresh')}</span><div><h2>${due.length?`지금 복습 ${due.length}문제`:'지금 예정된 복습이 없어요'}</h2><p>${state.settings.level} · ${early.length?`미리 복습 ${early.length}문제`:'학습하면 복습 일정이 생겨요.'}</p></div>${due.length?btn('review-start','복습 시작','primary'):early.length?btn('preview-start','미리 복습 시작','primary'):btn('home','새 단어 학습하기','primary')}</section>
 <div class="review-toolbar">${due.length&&early.length?btn('preview-start','미리 복습','soft'):''}${filter==='weak'&&rows.length?btn('weak-start','오답 복습','soft'):''}</div>
 <div class="filter-chips" role="group" aria-label="복습 필터">${[['due','지금 복습'],['preview','미리 복습'],['weak','오답'],['all','전체 일정']].map(([id,label])=>`<button class="${filter===id?'active':''}" data-action="filter" data-id="${id}" aria-pressed="${filter===id}">${label}</button>`).join('')}</div><section class="panel word-list">${rows.slice(0,80).map(r=>{const w=W(r.wordId);return `<button class="word-row" data-action="word" data-id="${w.id}">${wordHTML(w)}<div class="word-detail"><p>${esc(w.meaning)}</p><small>${names[r.skill]} · ${r.knownPreview?'아는 단어 · 시험 전':dueLabel(r.due)}</small></div>${icon('next')}</button>`;}).join('')||empty('복습할 문제가 없습니다.','수업을 진행하거나 단어장에서 연습할 수 있습니다.')}</section><p class="fine spaced">미리 복습에서 맞힌 문제는 예정된 복습일을 유지합니다. 틀린 문제는 10분 뒤 다시 출제됩니다. 아는 단어로만 표시했던 단어도 시험할 수 있습니다.</p>
 <div class="timebox-options">${[5,10,20].map(n=>btn('timebox-start',n+'분 복습','soft',`data-minutes="${n}"`)).join('')}${btn('spread-open','일정 분산','text')}</div>${hubEntry()}`;
}
function matchingWords(){const query=search.trim().toLowerCase();let list=words.filter(w=>w.level===state.settings.level&&(wordFilter!=='star'||state.starred.includes(w.id))&&(wordFilter!=='known'||state.known[w.id])&&(wordFilter!=='learning'||state.encountered[w.id]&&!state.known[w.id]&&!state.learned[w.id])&&(wordFilter!=='today'||state.encountered[w.id]&&dayKey(state.encountered[w.id])===dayKey())&&(wordFilter!=='long'||['meaning','listening','writing'].every(k=>(state.memory[keyOf(w.id,k)]?.stage??-1)>=3))&&(!query||[w.word,w.reading,w.meaning].some(v=>v.toLowerCase().includes(query))));if(advanced.sort){const order=new Map(advanced.order.map((id,i)=>[id,i]));list.sort((a,b)=>(order.get(a.id)??0)-(order.get(b.id)??0));}return list;}
function wordActions(w){return `<div class="wordbook-actions">${btn('word-audio',icon('sound')+' 단어 듣기','soft',`data-id="${w.id}" aria-label="${esc(w.word)} 단어 듣기"`)}${btn('word-example-audio',icon('sound')+' 예문 듣기','soft',`data-id="${w.id}" aria-label="${esc(w.word)} 예문 듣기" ${examplesFor(w).length?'':'disabled'}`)}${btn('practice-options',icon('pen')+(/\p{Script=Han}/u.test(w.word)?'한자 쓰기':'가나 쓰기'),'soft',`data-id="${w.id}" aria-label="${esc(w.word)} 쓰기 연습"`)}</div>`;}
function wordRows(){const list=matchingWords();return `${list.slice(0,limit).map(w=>`<div class="wordbook-item">${selectedWordButton(w)}<div class="word-row"><button class="word-button" data-action="word" data-id="${w.id}">${wordHTML(w)}<div class="word-detail"><p>${esc(w.meaning)}</p><small>${state.known[w.id]?'아는 단어 · 직접 표시':state.learned[w.id]?'수업 완료':state.encountered[w.id]?'학습 중':'미학습'}</small></div></button><button class="icon-btn ${state.starred.includes(w.id)?'starred':''}" data-action="star" data-id="${w.id}" aria-label="${esc(w.word)} 별표" aria-pressed="${state.starred.includes(w.id)}">${icon('star')}</button></div>${wordActions(w)}<p class="word-audio-status" aria-live="polite"></p></div>`).join('')||empty('검색 결과가 없습니다.','한자, 읽기 또는 뜻으로 검색하세요.')}${list.length>limit?btn('more-words',`${list.length-limit}개 더 보기`,'soft wide'):''}`;}
function practiceResume(){const p=state.wordPractice;return p&&!p.finished?`<section class="resume"><div><b>단어장 쓰기 · ${esc(W(p.wordId)?.word||'')}</b><p>${p.completed} / ${p.repeats}회 완료 · 필기 저장됨</p></div>${btn('practice-resume','이어서 쓰기','soft')}</section>`:'';}
function wordResultsLabel(){return `${state.settings.level} · ${matchingWords().length.toLocaleString()}단어${search.trim()?' · 검색 결과':''}`;}
function refreshWordResults(){document.querySelector('#word-results').innerHTML=wordRows();document.querySelector('#word-results-status').textContent=wordResultsLabel();document.querySelector('[data-action="clear-search"]').hidden=!search;}
function wordPage(){return `${heading('단어장','한자, 읽기, 한국어 뜻으로 찾고 바로 연습하세요.')}${wordSelectionBar()}${practiceResume()}${levelButtons()}<div class="word-search" role="search" aria-label="단어장 검색">${icon('search')}<input id="search" type="search" value="${esc(search)}" aria-label="단어 검색" aria-controls="word-results" aria-describedby="word-results-status" placeholder="한자, 읽기, 한국어 뜻" autocomplete="off">${btn('clear-search',icon('close'),'icon-btn',`aria-label="검색어 지우기" ${search?'':'hidden'}`)}</div><div class="filter-chips" role="group" aria-label="단어장 필터">${[['all','전체'],['star','별표'],['known','아는 단어'],['learning','학습 중'],['today','오늘 처음 본 단어'],['long','7일 이상 복습']].map(([id,label])=>`<button data-action="word-filter" data-id="${id}" class="${wordFilter===id?'active':''}" aria-pressed="${wordFilter===id}" aria-controls="word-results">${label}</button>`).join('')}</div><p class="word-results-status fine" id="word-results-status" role="status" aria-live="polite">${wordResultsLabel()}</p><section class="panel word-list" id="word-results">${wordRows()}</section>`;}

function profile(){return statisticsView(state,words,statsView)+monthlyPanel(state,words)+hubEntry();}
function ensureInk(s,w){
 const chars=writingChars(w);requireStrokes(chars);
 if(!s.ink||s.ink.mode!==SNAP_MODE||s.ink.characters.length!==chars.length)s.ink={mode:SNAP_MODE,characters:chars.map(()=>[]),results:chars.map(()=>false),active:0,method:'stroke-snap',hadError:false,misses:0};
 const q=s.ink;q.active=Math.min(Math.max(0,q.active),chars.length-1);
 q.characters=q.characters.map((lines,i)=>validPrefix(lines,characterStrokes(chars[i]),{character:chars[i]}));
 q.results=chars.map((c,i)=>q.characters[i].length===characterStrokes(c).length);return q;
}
function questionPage(){const s=state.session;if(!s)return `<div class="focus-shell">${heading('시작한 수업이 없어요.')}${btn('home','홈으로','primary')}</div>`;if(s.finished)return resultPage();const t=current(s),w=W(t.wordId);if(!w)return '<div class="loading">수업 단어를 찾지 못했습니다. 기록을 백업해 주세요.</div>';const training=t.phase==='learn',writing=['trace','writing'].includes(t.skill);let body='';
 if(t.skill==='survey'){
  const reading=s.surveyReading&&w.reading?`<span class="survey-reading" lang="ja">${esc(w.reading)}</span>`:'';
  const meaning=s.surveyMeaning?`<p class="survey-meaning">${esc(w.meaning)}</p>`:'<p class="survey-placeholder">아는 단어와 모르는 단어로 분류하세요.</p>';
  body=`${heading('아는 단어 확인','30단어를 빠르게 훑은 뒤 모르는 단어만 시험해요.')}<section class="survey-card"><span class="survey-count">${s.index+1} / ${s.wordIds.length}</span><div class="survey-headword"><strong lang="ja" data-fit-word data-max-font="64">${esc(w.word)}</strong></div>${reading}${meaning}<div class="survey-manual-audio"><button type="button" class="btn soft survey-listen-button" data-action="survey-listen" aria-label="${esc(w.word)} 발음 듣기">${icon('sound')} 발음 듣기</button><p id="survey-audio-status" class="survey-audio-status" role="status" aria-live="polite"></p></div><div class="survey-reveals"><button data-action="survey-reading" class="${s.surveyReading?'active':''}">あ ${s.surveyReading?'히라가나 숨기기':'히라가나 표시하기'}</button><button data-action="survey-meaning" class="${s.surveyMeaning?'active':''}">${icon('eye')}${s.surveyMeaning?'뜻 숨기기':'한국어 뜻 표시하기'}</button></div></section>`;
 }
 if(t.skill==='study')body=`${heading('새 단어','뜻과 발음을 확인하세요.')}<section class="flashcard intro-card">${wordHTML(w,true)}<p class="word-meaning">${esc(w.meaning)}</p><span class="label">${w.level}</span></section>`;
 if(t.skill==='audio'||t.skill==='listening')body=`${heading(training?'발음 듣기':'듣고 단어 선택','')}<section class="listening-stage ${training?'training-audio':''}">${training?`<div class="listening-headword">${wordHTML(w,true)}</div>`:''}<div class="audio-controls"><button class="audio-main" data-action="listen" aria-label="다시 듣기">${icon('sound')}</button><button class="slow-button" data-action="slow" aria-label="천천히 다시 듣기">0.7×</button></div>${training?`<p class="word-meaning">${esc(w.meaning)}</p>`:''}<p class="audio-status sr-only" id="audio-status" aria-live="polite">${s.heard?'재생 완료':''}</p></section>${training?'':options(t,w)}`;
 if(t.skill==='meaning')body=`${heading('뜻 선택','알맞은 뜻을 고르세요.')}<section class="word-question">${wordHTML(w,true)}</section>${options(t,w)}`;
 if(writing){const q=ensureInk(s,w),chars=writingChars(w),active=q.active,guide=(training&&t.guided!==false)||s.assisted,paths=characterStrokes(chars[active]);body=`${heading(guide?'한 획씩 써 보세요.':/\p{Script=Han}/u.test(w.word)?'뜻을 보고, 한자로 써 보세요.':'뜻을 보고, 가나로 써 보세요.',training?`쓰기 연습 ${t.practiceIndex||1}/${t.practiceTotal||3} · ${guide?'편하게 쓰면 모양을 맞춰 줘요.':'이번에는 힌트 없이 써 보세요.'}`:'한 획씩 쓰세요.')}<div class="ink-prompt"><div><strong>${esc(w.meaning)}</strong><p id="writing-word-progress" lang="ja" aria-live="polite">${esc(completedWord(w,q.results,guide))}</p>${guide?showReading(w):''}</div><span class="label">${guide?'따라 쓰기':'기억해서 쓰기'}</span></div><div class="character-tabs" role="group" aria-label="쓸 글자 선택">${chars.map((c,i)=>`<button data-action="character" data-index="${i}" class="${i===active?'active':''} ${q.results[i]?'complete':''}" aria-label="${i+1}번째 글자" ${s.feedback?'disabled':''}>${q.results[i]?esc(c):guide?esc(c):i+1}</button>`).join('')}<span class="stroke-count" id="stroke-count">${q.characters[active].length} / ${paths.length}획</span><button type="button" class="writing-auto-toggle ${state.settings.writingAutoAdvance?'active':''}" data-action="writing-auto-advance" role="switch" aria-checked="${state.settings.writingAutoAdvance}" aria-label="글자 완성 후 자동 넘기기"><span>자동</span><b>${state.settings.writingAutoAdvance?'ON':'OFF'}</b></button></div><div class="ink-pad snap-pad"><div class="cross-lines"></div><canvas id="ink-canvas" aria-label="${active+1}번째 한자 획 따라 쓰기 필기장"></canvas><span class="pad-counter">${active+1} / ${chars.length}글자</span></div><p class="grader-status" id="grade-status" role="status">${q.results[active]?'이 글자의 모든 획을 완성했어요.':guide?`${q.characters[active].length+1}번째 획을 그어 주세요.`:'한 획을 쓰고 손을 떼면 자동으로 확인해요.'}</p><div class="ink-toolbar">${btn('undo',icon('undo')+' 한 획 취소','text',s.feedback?'disabled':'')}${btn('clear',icon('trash')+' 다시 쓰기','text',s.feedback?'disabled':'')}${btn('replay',icon('refresh')+' 획 재생','text')}</div>${!s.feedback?`<div class="writing-help">${btn('hint',icon('eye')+' 힌트 보기','soft')}${btn('reveal-writing','정답 보기','soft')}</div>`:''}`;}
 if((training&&!(t.skill==='trace'&&t.guided===false))||(t.skill==='survey'&&s.surveyMeaning))body+=exampleButton(w);
 if(s.feedback&&!s.feedback.training)body=`<section class="answer-reveal feedback-card"><span class="label">정답 확인</span>${wordHTML(w,true)}<p class="word-meaning">${esc(w.meaning)}</p>${exampleBody(w,state.settings.furigana,s.exampleIndex||0,{headword:false})}</section>`;
 else if(s.showExample&&((training&&!(t.skill==='trace'&&t.guided===false))||(t.skill==='survey'&&s.surveyMeaning)||s.assisted))body=`<section class="answer-reveal feedback-card">${wordHTML(w)}<p>${esc(w.meaning)}</p>${exampleBody(w,state.settings.furigana,s.exampleIndex||0,{headword:false})}${btn('hide-examples','문제로 돌아가기','text')}</section>`;
 const chapterLabel=s.kind==='class'&&s.course?`${s.course.level} · 第${s.course.index}章 · ${courseLaps(state,s.course.id)+1}회독`:s.level||w.level||state.settings.level;return `<div class="focus-shell"><header class="focus-top"><button class="icon-btn" data-action="pause" aria-label="수업 중단 메뉴">${icon('close')}</button><div class="session-progress"><div class="line-progress"><i style="width:${s.index/s.queue.length*100}%"></i></div></div><button class="reading-toggle" data-action="furigana" aria-pressed="${state.settings.furigana}" aria-label="히라가나 표시 전환"><span lang="ja">あ</span>${state.settings.furigana?'ON':'OFF'}</button></header><div class="session-label"><span>${chapterLabel} · ${s.kind==='review'?(s.reviewMode==='preview'?'미리 복습':'복습'):t.phase==='survey'?'빠른 회독':training?'모르는 단어 학습':'모르는 단어 시험'}${t.attempt?' · 다시 확인':''}</span><span>${t.phase==='survey'?`${s.index+1}/${s.wordIds.length}`:`${s.index+1}/${s.queue.length}`}</span></div><main class="question" id="main">${s.budgetMs?'<p class="timebox-clock">남은 시간 <b id="budget-clock">'+Math.max(0,Math.ceil((s.budgetMs-(s.elapsedMs||0))/1000))+'초</b></p>':''}${body}</main></div>${footer(s,t)}`;
}
function options(t,w){return `<div class="options" role="group" aria-label="답 선택">${t.options.map((o,i)=>{const selected=state.session.selection===o,correct=o===(t.skill==='listening'?w.word:w.meaning);const f=state.session.feedback,locked=t.skill==='listening'&&!state.session.heard;return `<button class="answer-option ${selected?'selected':''} ${f?(correct?'correct':selected?'wrong':''):''}" data-action="option" data-index="${i}" aria-pressed="${selected}" ${f||locked?'disabled':''}><span>${i+1}</span><b ${t.skill==='listening'?'lang="ja"':''}>${esc(o)}</b></button>`;}).join('')}</div>`;}
function canAnswer(){const s=state.session,t=current(s);return !!s&&!s.feedback&&!s.finished&&!!s.selection&&(t.skill!=='listening'||s.heard);}
function footer(s,t){let content='',kind='';
 if(t?.skill==='survey'&&!s.feedback){content=`<div class="survey-footer"><button class="btn soft unknown" data-action="unknown-word">${icon('refresh')} 모르는 단어</button><button class="btn primary known" data-action="known-word">${icon('check')} 아는 단어</button></div>`;return `<footer class="lesson-footer survey-mode"><div class="lesson-footer-inner">${content}</div></footer>`;}
 if(s.feedback){const f=s.feedback;kind=f.correct?'correct':'wrong';content=`<div class="feedback-copy" role="status"><span class="feedback-mark">${icon(f.correct?'check':'refresh')}</span><div><b>${f.training?'연습 완료':f.correct?'정답':'오답'}</b><p>${f.training?'연습 기록':f.correct?`${f.gained?`+${f.gained} XP · `:''}통과`:f.assisted?'힌트 사용 · 도움 없이 다시 확인해요.':'정답을 확인하고, 뒤에서 한 번 더 풀어요.'}</p></div></div>${btn('next','다음으로','primary')}`;}
 else if(t.skill==='study')content=`<span class="footer-hint">이제 발음을 들어 볼게요.</span>${btn('studied','발음 들으러 가기','primary')}`;
 else if(t.skill==='audio')content=`<span class="footer-hint"></span>${btn('audio-done','다음으로','primary',s.heard?'':'disabled')}`;
 else if(['trace','writing'].includes(t.skill)){const q=s.ink,all=q?.results.every(Boolean),done=q?.results[q.active],paths=characterStrokes(writingChars(W(t.wordId))[q.active]),left=paths.length-q.characters[q.active].length;content=`<span class="footer-hint">${q?.results.filter(Boolean).length||0}/${q?.results.length||1}글자 완성</span>${btn(all?'ink-done':done?'snap-next':'stroke-wait',all?'단어 쓰기 완료':done?'다음 글자 쓰기':`${left}획 더 쓰면 완성`,'primary',all||done?'':'disabled')}`;}

 else content=`<span class="footer-hint">${t.skill==='listening'?'소리를 끝까지 듣고 선택하세요.':'알맞은 답을 골라 주세요.'}</span>${btn('answer','정답 확인','primary',canAnswer()?'':'disabled')}`;
 return `<footer class="lesson-footer ${kind}"><div class="lesson-footer-inner">${content}</div></footer>`;
}
function resultPage(){
 const s=state.session,missing=unresolved(s),ratio=s.originalQuiz?Math.round(s.firstCorrect/s.originalQuiz*100):100,known=s.knownIds?.length||0,unknown=s.unknownIds?.length||0;
 return `<main class="focus-shell"><section class="result"><div class="result-emblem">${icon(s.completed?'check':'refresh')}</div><h1>${s.completed?'회독 완료':'미완료 문제'}</h1><p>${s.completed?`${s.wordIds.length}단어 회독 완료 · 아는 단어 ${known}개 · 집중 학습 ${unknown}개`:`${missing.length}개 유형을 아직 통과하지 못했어요.`}</p><div class="result-metrics"><div><span>아는 단어</span><b>${known}</b></div><div><span>집중 학습</span><b>${unknown}</b></div><div><span>시험 첫 정답</span><b>${ratio}%</b></div></div><section class="panel result-words">${s.wordIds.map(id=>{const w=W(id),isKnown=s.knownIds?.includes(id);return `<div class="result-word">${wordHTML(w)}<div class="result-skills">${isKnown?'<span class="done">아는 단어 ✓</span>':['meaning','listening','writing'].filter(k=>s.queue.some(t=>t.phase==='quiz'&&t.wordId===id&&t.skill===k)).map(k=>`<span class="${s.passed[keyOf(id,k)]?'done':''}">${names[k].replace(' 시험','').replace(' 확인','')} ${s.passed[keyOf(id,k)]?'✓':'—'}</span>`).join('')}</div></div>`;}).join('')}</section>${missing.length?btn('remediate','남은 문제 다시 풀기','primary wide'):s.kind==='review'?btn('finish',state.suspendedSession?'보관한 수업 이어서 하기':'학습 홈으로','primary wide'):btn('next-course','다음 챕터','primary wide')}${missing.length||s.kind==='class'?btn('finish',state.suspendedSession?'보관한 수업으로':'학습 홈으로','soft wide'):''}<p class="fine">아는 단어는 이번 회독 시험에서 제외됩니다. 다시 회독하면 언제든 모르는 단어로 바꿀 수 있어요.</p></section></main>`;
}
function render(){disposeAdvanced();clearInterval(budgetTimer);stopFitting();footerObserver?.disconnect();
 ink?.destroy();ink=null;applyMotion(state.settings);configureAudio(state.settings);
 const t=current(state.session);document.documentElement.dataset.lesson=String(['lesson','kana-practice','word-practice'].includes(route()));document.documentElement.dataset.feedback=String(route()==='lesson'&&!!state.session?.feedback);document.documentElement.dataset.snap=String(route()==='kana-practice'||route()==='word-practice'||(route()==='lesson'&&!!t&&['trace','writing'].includes(t.skill)));
 root.innerHTML=route()==='word-practice'?practiceView(state,W(state.wordPractice?.wordId)):route()==='kana-practice'?kanaPractice(state):route()==='lesson'?questionPage():shell(({home,course:curriculum,review,words:wordPage,profile,'study-hub':()=>hubView(state,words),exam:()=>examView(state),commute:()=>commuteView(state),kana:()=>kanaHome(state)}[route()]||home)());
 stopFitting=fitHeadwords(root);offerTutorial();notifyScreen(tutorialSession?'tutorial':route()==='word-practice'?'kana-practice':route(),state.session);
 mountAdvanced(advancedContext());
 if(route()==='lesson'&&t&&!state.session.feedback){if(promptClock.id!==t.id)promptClock={id:t.id,at:performance.now()};}else promptClock={id:null,at:0};
 const timed=state.session;
 if(route()==='lesson'&&timed?.budgetMs&&!timed.finished){
  let last=Date.now(),ticks=0,opened=false;
  budgetTimer=setInterval(async()=>{
   const now=Date.now(),delta=Math.max(0,Math.min(2000,now-last));last=now;
   if(document.hidden||modal.firstChild||state.session!==timed)return;
   timed.elapsedMs=(timed.elapsedMs||0)+delta;
   const label=document.querySelector('#budget-clock');if(label)label.textContent=Math.max(0,Math.ceil((timed.budgetMs-timed.elapsedMs)/1000))+'초';
   if(++ticks%5===0)await save();
   if(timed.elapsedMs>=timed.budgetMs&&!opened){opened=true;clearInterval(budgetTimer);await save();openModal(`${modalHead('복습 시간이 끝났습니다')}<p>남은 문제와 현재 답은 저장되었습니다.</p>${btn('save-exit','저장하고 나가기','primary wide')}${btn('budget-add','5분 더 풀기','soft wide')}`);}
  },1000);
 }

 const foot=document.querySelector('.lesson-footer');if(foot){const measure=()=>document.documentElement.style.setProperty('--lesson-foot',`${foot.getBoundingClientRect().height}px`);measure();footerObserver=new ResizeObserver(measure);footerObserver.observe(foot);}

 if(route()==='lesson'&&t&&state.session&&!state.session.finished){
  const w=W(t.wordId);setTimeout(()=>{if(route()==='lesson'&&state.session&&current(state.session)?.id===t.id)autoPronounceOnce(state.session,t,w);},90);
 }
 if(route()==='word-practice'){ink=mountPractice(state,W(state.wordPractice?.wordId),{save,render});return;}
 if(route()==='kana-practice'){ink=mountKana(state,{save,render,toast});return;}
 const canvas=document.querySelector('#ink-canvas');if(canvas){const s=state.session,q=s.ink,paths=characterStrokes(writingChars(W(t.wordId))[q.active]);
  ink=attachStrokePad(canvas,paths,q.characters[q.active],{guide:(t.phase==='learn'&&t.guided!==false)||s.assisted,motion:state.settings.motion,width:state.settings.penWidth,character:writingChars(W(t.wordId))[q.active],
   onChange(){q.results[q.active]=q.characters[q.active].length===paths.length;},
   onAttempt(result,count,total){
    if(!result.accepted){q.misses=(q.misses||0)+1;if(t.phase==='quiz')q.hadError=true;}
    document.querySelector('#grade-status').textContent=result.accepted?(count===total?'이 글자의 모든 획을 완성했어요.':`${count}획 완성. ${count+1}번째 획을 이어 주세요.`):result.reason;
    document.querySelector('#grade-status').dataset.verdict=result.accepted?'correct':'retry';
    document.querySelector('#stroke-count').textContent=`${count} / ${total}획`;
    const tab=document.querySelector(`.character-tabs [data-index="${q.active}"]`);tab?.classList.toggle('complete',q.results[q.active]);if(q.results[q.active]&&tab)tab.textContent=writingChars(W(t.wordId))[q.active];
    const progress=document.querySelector('#writing-word-progress');if(progress)progress.textContent=completedWord(W(t.wordId),q.results,(t.phase==='learn'&&t.guided!==false)||s.assisted);
    recordStroke(state,writingChars(W(t.wordId))[q.active],result.accepted?count-1:count,result.accepted);
    document.querySelector('.lesson-footer').outerHTML=footer(s,t);haptic(state.settings,result.accepted);save();
    if(result.accepted&&count===total&&q.results[q.active]&&state.settings.writingAutoAdvance&&!q.results.every(Boolean)){
     const active=q.active,taskId=t.id,sessionId=s.id;
     const status=document.querySelector('#grade-status');if(status)status.textContent='글자 완성. 다음 글자로 넘어갑니다.';
     setTimeout(async()=>{const live=state.session,currentTask=current(live);if(!state.settings.writingAutoAdvance||route()!=='lesson'||live?.id!==sessionId||currentTask?.id!==taskId||live.feedback||live.ink?.active!==active||!live.ink?.results?.[active])return;const nextIndex=live.ink.results.findIndex(v=>!v);if(nextIndex<0)return;live.ink.active=nextIndex;await save();render();},260);
    }
   }});if(s.feedback)canvas.style.pointerEvents='none';
 }
}
function syncButtons(){const s=state.session;if(!s)return;const b=document.querySelector('[data-action="answer"]');if(b)b.disabled=!canAnswer()||busy;const a=document.querySelector('[data-action="audio-done"]');if(a)a.disabled=!s.heard||busy;}
function modalHead(title){return `<div class="sheet-head"><h2 id="sheet-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="닫기">${icon('close')}</button></div>`;}
function openModal(body,forTutorial=false){if(tutorialSession&&!forTutorial)return;cancelWork();if(promptClock.id)promptClock.invalid=true;modalFit();priorFocus=document.activeElement;modal.innerHTML=`<div class="modal-backdrop"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">${body}</section></div>`;document.body.classList.add('modal-open');modal.querySelector('button,input,select')?.focus();modalFit=fitHeadwords(modal);root.inert=true;}
function closeModal(restore=true){if(tutorialSession){finishTutorial('skipped',restore);return;}root.inert=false;audioNonce++;stopAudio();modalFit();modal.innerHTML='';document.body.classList.remove('modal-open');priorFocus?.focus?.();}
function persistTutorial(value){
 tutorialRecord=normalizeTutorial(value);const snapshot={...tutorialRecord};
 tutorialWrites=tutorialWrites.catch(()=>{}).then(()=>storeTutorial(snapshot));
 tutorialWrites.catch(()=>{tutorialSaveFailed=true;const status=modal.querySelector('.tour-storage-status');if(status)status.textContent='안내 상태를 저장하지 못했습니다. 다음 실행 때 다시 나올 수 있습니다.';toast('안내 상태를 저장하지 못했습니다. 학습 기록은 변경하지 않았습니다.');});
}
function offerTutorial(){
 if(tutorialSession||tutorialSuppressed)return;
 if(shouldOfferTutorial(tutorialRecord,{route:route(),ready,storageOK,hidden:document.hidden,modalOpen:!!modal.firstChild}))startTutorial(false);
}
function startTutorial(replay=true){
 if(tutorialSession)return;
 cancelWork();tutorialSession={step:replay?0:tutorialRecord.step,replay,route:route(),focus:document.activeElement};
 if(!replay)persistTutorial(tutorialProgress(tutorialSession.step));
 showTutorial();
}
function showTutorial(){
 if(!tutorialSession)return;
 openModal(tutorialView(tutorialSession.step,{replay:tutorialSession.replay}),true);
 const sheet=modal.querySelector('.sheet');sheet?.setAttribute('aria-describedby','tour-description');
 modal.querySelector('#sheet-title')?.focus({preventScroll:true});
 if(tutorialSaveFailed)modal.querySelector('.tour-storage-status').textContent='안내 상태를 저장하지 못했습니다. 다음 실행 때 다시 나올 수 있습니다.';
 notifyScreen('tutorial',state.session);
}
function finishTutorial(status='skipped',restore=true){
 const tour=tutorialSession;if(!tour)return;
 tutorialSession=null;tutorialSuppressed=true;
 if(status==='completed'||tutorialRecord.status!=='completed')persistTutorial(tutorialProgress(tour.step,status));
 closeModal();
 if(tour.replay&&restore&&route()===tour.route){settings();modal.querySelector('[data-action="tutorial-open"]')?.focus({preventScroll:true});}
 else if(restore){(tour.focus?.isConnected?tour.focus:root.querySelector('.appbar [data-action="settings"]'))?.focus?.({preventScroll:true});}
 notifyScreen(route()==='word-practice'?'kana-practice':route(),state.session);
}
function handleTutorialAction(action){
 if(action==='tutorial-open'){startTutorial(true);return true;}
 if(!tutorialSession)return false;
 if(action==='tutorial-skip'){finishTutorial('skipped');return true;}
 if(action==='tutorial-finish'){if(tutorialSession.step===TUTORIAL_STEPS-1)finishTutorial('completed');return true;}
 if(action==='tutorial-previous'||action==='tutorial-next'){
  tutorialSession.step=Math.min(TUTORIAL_STEPS-1,Math.max(0,tutorialSession.step+(action==='tutorial-next'?1:-1)));
  if(!tutorialSession.replay)persistTutorial(tutorialProgress(tutorialSession.step));
  showTutorial();
 }
 return true;
}
function switchSetting(key,label,description=''){
 return `<div class="setting-row"><div><b>${label}</b>${description?`<small>${description}</small>`:''}</div><label class="setting-switch"><input type="checkbox" role="switch" data-setting="${key}" aria-label="${label}" ${state.settings[key]?'checked':''}><span class="switch-track" aria-hidden="true"><i></i></span></label></div>`;
}
function settings(){openModal(`${modalHead('설정')}<button class="premium-entry" data-action="premium">${icon('spark')}<div><b>광고 없이 사용</b><small>코토바 프리미엄</small></div>${icon('next')}</button><section class="settings-section"><button type="button" class="btn soft tutorial-replay" data-action="tutorial-open">${icon('book')}<span>튜토리얼 다시 보기<small>학습·복습·단어장 사용법</small></span>${icon('next')}</button></section>${switchSetting('furigana','히라가나 표시')}${switchSetting('motion','애니메이션')}<div class="setting-row"><b>듣기 속도</b><select data-setting="rate" aria-label="듣기 속도">${[.7,.85,1].map(n=>`<option value="${n}" ${n===state.settings.rate?'selected':''}>${n}×</option>`).join('')}</select></div><div class="setting-row"><b>펜 굵기</b><select data-setting="penWidth" aria-label="펜 굵기">${[4,6,8].map(n=>`<option value="${n}" ${n===state.settings.penWidth?'selected':''}>${n===4?'보통':n===6?'굵게':'더 굵게'}</option>`).join('')}</select></div><section class="settings-section"><h3>학습 강도</h3><select data-setting="intensity" aria-label="학습 강도">${Object.entries(INTENSITIES).map(([k,p])=>`<option value="${k}" ${state.settings.intensity===k?'selected':''}>${p.label}</option>`).join('')}</select><p id="intensity-description" class="fine">${policyDescription(state.settings.intensity)}</p><p class="fine">모르는 단어 기준입니다. 새 회차부터 적용하며 진행 중인 수업은 바꾸지 않습니다.</p>${switchSetting('adaptiveSRS','개인별 복습 간격')}<p class="fine">자동 채점 기록에 따라 간격을 조절합니다. 이미 정해진 복습일은 다음 채점 전까지 유지됩니다.</p></section><section class="settings-section"><h3>쓰기 연습</h3>${switchSetting('kanjiOnlyPractice','한자만 쓰기 연습','수업에서 가나만 있는 단어의 따라 쓰기를 생략합니다. 쓰기 시험은 유지합니다.')}</section><section class="settings-section"><h3>일본어 음성</h3><p class="setting-note">단어·예문·가나는 기기의 일본어 음성으로 재생합니다. 일본어 오프라인 음성이 설치되어 있어야 합니다.</p>${btn('speech-settings','기기 음성 설정','soft')}${btn('speech-test','음성 테스트','text')}</section><section class="settings-section"><h3>알림</h3>${switchSetting('reviewNotifications','복습 알림','오전 9시~오후 10시 · 하루 최대 2회')}${btn('reminder-permission','알림 권한 확인','text')}</section><div class="modal-actions">${btn('export','기록 백업','soft')}${btn('import','백업 가져오기','soft')}</div><input id="backup-file" type="file" accept="application/json,.json" class="sr-only"><div class="legal-links">${btn('restore-purchases','구매 복원','text')}${btn('manage-subscription','구독 관리','text')}${btn('privacy-options','광고 개인정보 선택','text')}<a href="./privacy.html">개인정보처리방침</a><a href="./terms.html">이용약관</a><a href="./licenses.html">오픈소스·저작권</a></div><div class="spaced">${btn('reset','학습 기록 초기화','text danger')}</div><p class="fine">코토바 0.4.2 · 내부 테스트</p>`);}
function detail(id){
 const w=W(id);if(!w)return;
 const rows=['meaning','writing','listening'].map(k=>{const v=wordStatus(state,id,k);return `<div class="memory-row"><b>${{meaning:'뜻',writing:'쓰기',listening:'듣기'}[k]}</b><span>${v.kind==='tested'?dueLabel(v.record.due):v.kind==='known'?'아는 단어로 분류 · 시험 전':'시험 기록 없음'}</span></div>`;}).join('');
 openModal(`${modalHead('단어 정보')}<div class="detail-word">${wordHTML(w,true)}<p class="word-meaning">${esc(w.meaning)}</p>${wordActions(w)}<p class="word-audio-status" aria-live="polite"></p>${exampleButton(w)}</div>${state.known[id]?'<p class="known-state">아는 단어 · 직접 표시</p>':''}<div class="memory-list">${rows}</div>`);
}
function practiceOptions(id){
 const w=W(id);if(!w)return;practiceWordId=id;
 openModal(`${modalHead('쓰기 연습')}<div class="practice-options"><h3 lang="ja">${esc(w.word)}</h3><p>${esc(w.meaning)}</p><div class="repeat-options">${REPEAT_OPTIONS.map(n=>btn('practice-repeat',`${n}회`,practiceRepeats===n?'soft selected':'soft',`data-count="${n}" aria-pressed="${practiceRepeats===n}"`)).join('')}</div><label>반복 횟수 <input id="practice-repeats" type="number" min="1" max="20" step="1" value="${practiceRepeats}" inputmode="numeric" aria-label="쓰기 반복 횟수"></label><p class="fine">진행 중인 수업·복습과 별도로 저장합니다. 쓰기 연습은 시험 통과로 기록하지 않습니다.</p>${btn('practice-start','쓰기 시작','primary wide')}</div>`);
}
async function beginPractice(){
 const w=W(practiceWordId);if(!w)return;cancelWork();startWordPractice(state,w,practiceRepeats);closeModal();if(await save())go('word-practice');
}

async function startCourse(id,replace=false){
 if(!storageOK)return toast(warning);
 const c=courses(words,state.settings.level).find(c=>c.id===id);if(!c)return toast('수업을 다시 선택해 주세요.');
 const activeClass=[state.session,state.suspendedSession].find(s=>s&&!s.finished&&s.kind==='class');
 if(activeClass&&!replace){
  pendingCourse=id;openModal(`${modalHead('이어 하거나 새 회차를 시작해요')}<p>${esc(lessonName(activeClass))}의 진행 기록이 있어요. 새 회차를 시작하면 이 본수업의 진행만 초기화합니다. 이미 답한 복습 기록과 진행 중인 복습은 유지해요.</p><div class="modal-actions">${btn(activeClass===state.session?'resume':'switch-session','기존 본수업 이어서','primary')}${btn('replace-course','선택한 챕터 새로 시작','soft')}</div>`);return;
 }
 cancelWork();startClassSession(state,c,words);closeModal();if(await save())go('lesson');
}
async function submitCurrent(result,advanceTraining=false){if(busy||!storageOK)return;const s=state.session,t=current(s);if(!t)return;const elapsed=promptClock.id===t.id&&!promptClock.invalid?performance.now()-promptClock.at:0;result.latencyMs=elapsed>=250&&elapsed<=120000?elapsed:0;if(submit(state,t.id,result)){offerReviewPermission(state).catch(()=>{});busy=true;const ok=await save();busy=false;if(!ok)return;if(advanceTraining){next(state);await save();}else haptic(state.settings,result.correct);render();document.querySelector('[data-action="next"]')?.focus({preventScroll:true});}}
const AUTO_SPEECH_PROMPT=1,AUTO_SPEECH_EXAMPLE=2,AUTO_SPEECH_FEEDBACK=4;
function autoSpeechStage(s,t){
 if(!s||!t)return null;
 if(s.feedback&&!s.feedback.training)return {bit:AUTO_SPEECH_FEEDBACK,name:'feedback'};
 if(s.showExample)return {bit:AUTO_SPEECH_EXAMPLE,name:'example'};
 if(['trace','writing','meaning','audio','listening'].includes(t.skill))return {bit:AUTO_SPEECH_PROMPT,name:'prompt'};
 return null;
}
async function autoPronounceOnce(s,t,w){
 if(document.hidden||modal.firstChild||!storageOK||state.session!==s||current(s)!==t)return;
 const stage=autoSpeechStage(s,t);if(!stage||!w||((t.autoSpeech||0)&stage.bit))return;
 t.autoSpeech=(t.autoSpeech||0)|stage.bit;
 if(stage.bit===AUTO_SPEECH_PROMPT&&promptClock.id===t.id)promptClock.invalid=true;
 save();
 const nonce=++audioNonce;
 try{
  await speak(w.id,state.settings.rate,{text:w.reading||w.word});
  if(nonce!==audioNonce||route()!=='lesson'||state.session!==s||current(s)?.id!==t.id)return;
  if(stage.bit===AUTO_SPEECH_PROMPT&&['audio','listening'].includes(t.skill)){
   s.heard=true;await save();const status=document.querySelector('#audio-status');if(status)status.textContent='재생 완료';
   document.querySelectorAll('.answer-option').forEach(el=>el.disabled=!!s.feedback);syncButtons();
  }
 }catch(e){
  if(nonce===audioNonce&&!autoVoiceWarned){autoVoiceWarned=true;toast(e.message||'기기의 일본어 음성을 확인해 주세요.');}
 }finally{
  if(nonce===audioNonce&&!document.hidden&&!modal.firstChild&&stage.bit===AUTO_SPEECH_PROMPT&&state.session===s&&current(s)?.id===t.id&&!s.feedback)promptClock={id:t.id,at:performance.now(),invalid:false};
 }
}
async function play(slow=false,wordId=null,auto=false){const s=state.session,t=wordId?null:current(s),w=W(wordId||t?.wordId);if(!w)return;const nonce=++audioNonce,rate=slow?.7:state.settings.rate;const status=wordId?document.querySelector('.sheet .word-audio-status')||document.querySelector(`.wordbook-item:has([data-id="${wordId}"]) .word-audio-status`):document.querySelector('#audio-status');if(status)status.textContent='재생 중';document.querySelector('.audio-main')?.classList.add('playing');
 try{await speak(w.id,rate,{text:w.reading||w.word});
 if(nonce!==audioNonce)return;if(status)status.textContent='재생 완료';if(t&&state.session===s&&current(s)?.id===t.id&&route()==='lesson'){s.heard=true;await save();if(status)status.textContent='재생 완료';document.querySelectorAll('.answer-option').forEach(el=>el.disabled=!!s.feedback);syncButtons();}}
 catch(e){if(nonce===audioNonce){if(status)status.textContent=e.message;toast(e.message);}}
 finally{if(nonce===audioNonce)document.querySelector('.audio-main')?.classList.remove('playing');}
}
function downloadJSON(object,name){const url=URL.createObjectURL(new Blob([JSON.stringify(object)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportBackup(){await tail;const backup={format:'kotoba-backup',version:2,exportedAt:new Date().toISOString(),state:structuredClone(state)};if(isNative())await callNative('exportBackup',{json:JSON.stringify(backup)},120000);else downloadJSON(backup,`kotoba-${dayKey()}.json`);toast('백업을 내보냈어요.');}
function confirmImport(raw){if(raw.length>30e6)throw new Error('백업 파일은 30MB 이하로 제한됩니다.');const value=JSON.parse(raw);if(value.format!=='kotoba-backup'||![1,2].includes(value.version))throw new Error('코토바 백업 파일이 아닙니다.');const st=validateState(value.state);imported={state:st,packs:[]};openModal(`${modalHead('백업 기록으로 바꿀까요?')}<p>현재 기록을 덮어씁니다. 먼저 현재 기록을 백업해 주세요. 확인하기 전에는 아무 기록도 바뀌지 않습니다.</p><div class="modal-actions">${btn('export','현재 기록 백업','soft')}${btn('confirm-import','기록 교체','primary')}</div>`);}
document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-action]');if(!el||el.disabled||!ready)return;const a=el.dataset.action,s=state.session,t=current(s);
 try{
 if(handleTutorialAction(a))return;
 if(await handleAdvanced(a,el,advancedContext()))return;
 if(a==='stats-range'){statsView.days=Number(el.dataset.days);statsView.date=null;render();return;}
 if(a==='stats-level'){statsView.level=el.dataset.level;statsView.date=null;render();return;}
 if(a==='stat-day'){statsView.date=el.dataset.date;const y=scrollY;render();scrollTo(0,y);return;}
 if(a==='speech-test'){await speakSentence('こんにちは。日本語の音声テストです。',state.settings.rate);toast('음성 테스트 완료');return;}
 if(a==='word-example-audio'){
  const w=W(el.dataset.id),e=examplesFor(w)[0];if(!e)return;const nonce=++audioNonce;
  const status=el.closest('.wordbook-item,.detail-word')?.querySelector('.word-audio-status');if(status)status.textContent='예문 재생 중';
  try{await speakSentence(e.speechText||e.ja,state.settings.rate);if(nonce===audioNonce&&status?.isConnected)status.textContent='예문 재생 완료';}catch(error){if(nonce===audioNonce){if(status?.isConnected)status.textContent=error.message;toast(error.message);}}return;
 }
 if(a==='practice-options'){practiceOptions(el.dataset.id);return;}
 if(a==='practice-repeat'){practiceRepeats=Number(el.dataset.count);practiceOptions(practiceWordId);return;}
 if(a==='practice-start'){
  practiceRepeats=Number(document.querySelector('#practice-repeats')?.value);
  if(!Number.isSafeInteger(practiceRepeats)||practiceRepeats<1||practiceRepeats>20)throw new Error('반복 횟수는 1~20회로 입력하세요.');
  if(state.wordPractice&&!state.wordPractice.finished){openModal(`${modalHead('진행 중인 쓰기 연습')}<p>새 연습을 시작하면 단어장 쓰기의 진행만 초기화합니다. 본수업과 복습은 유지됩니다.</p><div class="modal-actions">${btn('practice-resume','기존 연습 계속','soft')}${btn('practice-replace','새로 시작','primary')}</div>`);}else await beginPractice();return;
 }
 if(a==='practice-replace'){await beginPractice();return;}
 if(a==='practice-resume'){cancelWork();closeModal();go('word-practice');return;}
 if(a==='practice-exit'){cancelWork();closeModal();if(await save())go('words');return;}
 if(a.startsWith('practice-')&&route()==='word-practice'){
  const p=state.wordPractice,w=W(p?.wordId);if(!p||p.finished||!w)return;
  if(a==='practice-next'){if(advanceWordPractice(state,w)){await save();render();scrollTo(0,0);}return;}
  if(a==='practice-undo')p.ink?.characters[p.ink.active].pop();
  if(a==='practice-clear'&&p.ink)p.ink.characters[p.ink.active]=[];
  if(a==='practice-character'&&p.ink){const i=Number(el.dataset.index),first=p.ink.results.findIndex(x=>!x);if(Number.isInteger(i)&&i>=0&&i<p.ink.characters.length&&(first<0||i<=first))p.ink.active=i;}
  if(a==='practice-guide')p.guide=!p.guide;
  if(a==='practice-hint'||a==='practice-answer')p.guide=true;
  await save();render();if(a==='practice-answer')toast(`${w.word} (${w.reading})`);return;
 }

 if(a==='kana-pause'){cancelWork();if(!await save())return;openModal(`${modalHead('문자 수업 중단')}<p>현재 글자·연습 단계·필기를 저장해 두었어요.</p><div class="pause-actions">${btn('kana-open','저장하고 나가기','primary wide')}${btn('review-start','저장하고 단어 복습하기','soft wide')}${btn('kana-restart-request','이 줄을 처음부터','soft wide')}${btn('keep-learning','계속 연습하기','text wide')}</div>`);return;}
 if(a==='kana-restart-request'){openModal(`${modalHead('이 줄을 처음부터 쓸까요?')}<p>진행 중인 줄의 첫 글자부터 시작해요. 이미 익힌 글자와 복습 기록은 지우지 않습니다.</p><div class="modal-actions">${btn('kana-restart-confirm','처음부터 쓰기','primary')}${btn('keep-learning','취소','soft')}</div>`);return;}
 if(a.startsWith('kana-')){if(a==='kana-restart-confirm')closeModal();await handleKanaAction(a,el.dataset,state,{save,render,toast,go});return;}
 if(a==='examples'){const w=W(el.dataset.id);if(w){cancelWork();if(route()==='lesson'&&!modal.firstChild){s.showExample=true;s.exampleIndex=0;await save();render();scrollTo(0,0);}else{openModal(`${modalHead('문장 속에서 기억해요')}${exampleBody(w,state.settings.furigana)}`);const sheet=modal.firstChild;setTimeout(()=>{if(!document.hidden&&modal.firstChild===sheet&&sheet?.querySelector('.example-pane'))play(false,w.id,true);},90);}}}
 else if(a==='hide-examples'&&s){cancelWork();s.showExample=false;await save();render();}
 else if(a==='example-page'){cancelWork();const w=W(el.dataset.id),i=Number(el.dataset.index);if(!w||!Number.isSafeInteger(i)||i<0||i>=examplesFor(w).length)return;if(modal.firstChild)openModal(`${modalHead('문장 속에서 기억해요')}${exampleBody(w,state.settings.furigana,i)}`);else if(s){s.exampleIndex=i;await save();render();}}
 else if(a==='example-audio'){const w=W(el.dataset.id),e=examplesFor(w)[Number(el.dataset.index)];if(!e)return;const nonce=++audioNonce;const status=el.closest('.example-pane')?.querySelector('.example-audio-status');el.setAttribute('aria-busy','true');if(status)status.textContent='예문 재생 중';try{await speakSentence(e.speechText||e.ja,el.dataset.slow==='true'?.7:state.settings.rate);if(nonce===audioNonce&&status?.isConnected)status.textContent='재생 완료';}catch(error){if(nonce===audioNonce){if(status?.isConnected)status.textContent=error.message;toast(error.message);}}finally{if(el.isConnected)el.removeAttribute('aria-busy');}}
 else if(a==='example-stop'){cancelWork();document.querySelectorAll('.example-audio-status').forEach(e=>e.textContent='재생을 멈췄어요.');}
 else if(a==='reminder-permission'){const p=await requestReviewPermission();toast(p.granted?'복습할 때 자동으로 알려드려요.':'알림 권한을 허용하면 복습 알림을 받을 수 있어요.');}
 else if(a==='speech-settings'){if(isNative())await callNative('speechSettings');else toast('Android 앱에서 사용할 수 있어요.');}
 else if(a==='premium'){openModal(`${modalHead('코토바 프리미엄')}${premiumScreen()}`);await refreshCommerce();if(modal.querySelector('.premium-plans'))openModal(`${modalHead('코토바 프리미엄')}${premiumScreen()}`);}
 else if(['purchase-monthly','purchase-annual','purchase-lifetime','restore-purchases','manage-subscription','privacy-options'].includes(a)){await handleCommerceAction(a,toast);}
 else if(a==='settings')settings();
 else if(a==='close-modal'){closeModal();if(route()==='lesson')render();}
 else if(a==='furigana'){state.settings.furigana=!state.settings.furigana;await save();render();}
 else if(a==='writing-auto-advance'){state.settings.writingAutoAdvance=!state.settings.writingAutoAdvance;await save();render();toast(state.settings.writingAutoAdvance?'글자를 완성하면 다음 글자로 자동 이동합니다.':'자동 넘기기를 껐습니다. 다음 글자는 직접 선택하세요.');}
 else if(a==='level'){const level=el.dataset.level,progress=el.classList.contains('level-progress');state.settings.level=level;search='';limit=80;courseLimit=24;await save();render();document.querySelector(`${progress?'.level-progress-grid':'.level-tabs'} [data-level="${level}"]`)?.focus({preventScroll:true});}
 else if(a==='start-course')await startCourse(el.dataset.id);
 else if(a==='replace-course'){await startCourse(pendingCourse,true);pendingCourse=null;}
 else if(a==='resume'){closeModal();go('lesson');}
 else if(a==='pause'){cancelWork();if(!await save())return;openModal(`${modalHead('수업 중단')}<p>단계·필기·선택한 답을 저장했습니다.</p><div class="pause-actions">${btn('save-exit','저장하고 나가기','primary wide')}${btn('review-start','본수업 보관하고 복습하기','soft wide')}${state.suspendedSession?btn('switch-session',esc(lessonName(state.suspendedSession))+' 이어서 하기','soft wide'):''}${btn('restart-session','이번 회차 처음부터','soft wide')}${btn('keep-learning','계속 학습하기','text wide')}</div>`);}
 else if(a==='save-exit'){closeModal();if(await save())go('home');}
 else if(a==='keep-learning'){closeModal();render();}
 else if(a==='switch-session'){cancelWork();ink?.destroy();ink=null;if(swapSession(state)){closeModal();if(await save())go('lesson');}}
 else if(a==='restart-session'&&s&&!s.finished){cancelWork();openModal(`${modalHead('이번 회차를 처음부터 할까요?')}<p>${esc(lessonName(s))}의 첫 단계로 돌아가요. 이번 수업의 필기와 문제 진행은 초기화하지만, 이미 쌓인 복습 기록·XP·완료한 회독 수는 유지해요.</p><div class="modal-actions">${btn('confirm-restart','이번 회차 처음부터','primary')}${btn('keep-learning','취소','soft')}</div>`);}
 else if(a==='confirm-restart'&&!busy){cancelWork();busy=true;try{ink?.destroy();ink=null;if(restartSession(state,words)){closeModal();if(await save())go('lesson');}}finally{busy=false;}}
 else if(a==='home'){go('home');}
 else if(a==='survey-listen'&&t?.skill==='survey'){
  const w=W(t.wordId),status=document.querySelector('#survey-audio-status'),nonce=++audioNonce;
  el.setAttribute('aria-busy','true');if(status)status.textContent='재생 중';
  try{await speak(w.id,state.settings.rate,{text:w.reading||w.word});if(nonce===audioNonce&&status?.isConnected)status.textContent='재생 완료';}
  catch(error){if(nonce===audioNonce){if(status?.isConnected)status.textContent=error.message;toast(error.message);}}
  finally{if(el.isConnected)el.removeAttribute('aria-busy');}
 }
 else if(a==='survey-reading'&&t?.phase==='survey'){s.surveyReading=!s.surveyReading;await save();render();}
 else if(a==='survey-meaning'&&t?.phase==='survey'){s.surveyMeaning=!s.surveyMeaning;await save();render();}
 else if((a==='known-word'||a==='unknown-word')&&t?.phase==='survey'){if(classifySurvey(state,t.id,a==='known-word',words)){await save();render();scrollTo(0,0);if(s.finished&&s.completed)celebrate(document.querySelector('#celebration'),state.settings.motion);}}
 else if(a==='studied')await submitCurrent({correct:true,method:'study'},true);
 else if(a==='audio-done')await submitCurrent({correct:true,method:'audio'},true);
 else if(a==='listen')await play();
 else if(a==='slow')await play(true);
 else if(a==='word-audio')await play(false,el.dataset.id);
 else if(a==='option'&&t&&!s.feedback){s.selection=t.options[Number(el.dataset.index)];document.querySelectorAll('.answer-option').forEach(b=>{b.classList.toggle('selected',b===el);b.setAttribute('aria-pressed',String(b===el));});await save();syncButtons();}
 else if(a==='answer'&&canAnswer()){const w=W(t.wordId);await submitCurrent({correct:s.selection===(t.skill==='listening'?w.word:w.meaning),method:'choice'});}
 else if(a==='ink-done'&&s.ink?.results.every(Boolean)){if(t.phase==='learn'&&t.guided===false&&s.assisted){s.ink=null;s.assisted=false;await save();render();toast('연습을 마쳤어요. 이번에는 힌트 없이 한 번 써 보세요.');}else await submitCurrent({correct:true,method:'stroke-snap',assisted:s.assisted===true},t.phase==='learn');}
 else if(a==='snap-next'&&s.ink&&!s.feedback){s.ink.active=s.ink.results.findIndex(v=>!v);await save();render();}
 else if(a==='character'&&s.ink&&!s.feedback&&!busy){const i=Number(el.dataset.index),first=s.ink.results.findIndex(x=>!x);if(i>=0&&i<s.ink.results.length&&(first<0||i<=first)){s.ink.active=i;await save();render();}}
 else if(a==='undo'&&s.ink&&!s.feedback&&!busy){s.ink.characters[s.ink.active].pop();s.ink.results[s.ink.active]=false;await save();render();}
 else if(a==='clear'&&s.ink&&!s.feedback&&!busy){s.ink.characters[s.ink.active]=[];s.ink.results[s.ink.active]=false;await save();render();}
 else if(a==='replay'&&t&&['trace','writing'].includes(t.skill)&&!s.feedback){if(t.phase==='quiz'||t.guided===false){s.assisted=true;await save();render();}if(state.settings.motion)ink?.replay();else toast('애니메이션이 꺼져 있어요. 힌트 보기로 획을 확인해 주세요.');}
 else if((a==='hint'||a==='reveal-writing')&&t&&['trace','writing'].includes(t.skill)&&!s.feedback){s.assisted=true;await save();render();if(a==='reveal-writing'){const w=W(t.wordId);openModal(`${modalHead('쓰기 정답')}<div class="writing-answer">${wordHTML(w,true)}<p>${esc(w.meaning)}</p></div><p>닫으면 정답 획을 보며 연습할 수 있어요. 도움받은 쓰기는 독립 정답으로 기록하지 않아요.</p>${btn('keep-learning','정답을 보며 연습하기','primary wide')}`);}else toast(t.phase==='quiz'?'힌트를 사용했어요. 뒤에서 도움 없이 다시 확인해요.':'정답 획을 보며 편하게 연습해 보세요.');}
 else if(a==='next'&&!busy){cancelWork();const was=s.finished;if(next(state)){if(await save()){render();scrollTo(0,0);if(!was&&s.finished&&s.completed)celebrate(document.querySelector('#celebration'),state.settings.motion);}}}
 else if(a==='remediate'){if(remediate(state)){await save();render();scrollTo(0,0);}}
 else if(a==='finish'&&s?.finished){if(state.session?.completed&&isNative())await callNative('commerceBreak',{},120000).catch(()=>{});const restored=finishSession(state);cancelWork();if(await save())go(restored?'lesson':'home');}
 else if(a==='next-course'&&s?.finished&&s.kind==='class'){if(state.session?.completed&&isNative())await callNative('commerceBreak',{},120000).catch(()=>{});state.session=null;const c=courses(words,state.settings.level).find(c=>!state.completed[c.id]);await save();if(c)await startCourse(c.id);else{toast('설치된 수업을 모두 마쳤어요. 복습으로 기억을 이어가세요.');go('review');}}
 else if(a==='review-start'||a==='weak-start'||a==='preview-start'){cancelWork();ink?.destroy();ink=null;const result=enterReview(state,words,a==='weak-start'?'weak':a==='preview-start'?'preview':'due');closeModal();if(await save())go(result==='empty'?'review':'lesson');if(result==='empty')toast('복습할 문제가 없습니다. 기존 수업은 유지됩니다.');else if(result==='resume')toast('진행 중인 복습을 이어서 열었습니다.');}
 else if(a==='filter'){filter=el.dataset.id;render();document.querySelector(`[data-action="filter"][data-id="${filter}"]`)?.focus({preventScroll:true});}
 else if(a==='word-filter'){wordFilter=el.dataset.id;limit=80;render();document.querySelector(`[data-action="word-filter"][data-id="${wordFilter}"]`)?.focus({preventScroll:true});}
 else if(a==='clear-search'){search='';limit=80;document.querySelector('#search').value='';refreshWordResults();document.querySelector('#search').focus({preventScroll:true});}
 else if(a==='word')detail(el.dataset.id);
 else if(a==='star'){const id=el.dataset.id;state.starred=state.starred.includes(id)?state.starred.filter(x=>x!==id):[...state.starred,id];await save();render();}
 else if(a==='more-words'){const previous=limit;limit+=80;refreshWordResults();document.querySelectorAll('#word-results .word-button')[previous]?.focus({preventScroll:true});}
 else if(a==='more-courses'){courseLimit+=24;render();}




 else if(a==='export')await exportBackup();
 else if(a==='import'){if(isNative()){const r=await callNative('importBackup',{},180000);confirmImport(r.json);}else document.querySelector('#backup-file')?.click();}
 else if(a==='confirm-import'&&imported){cancelWork();await tail;const nextState=await replaceBackup(imported.state,imported.packs,savedRevision);epoch++;state=nextState;savedRevision=state.revision;mergeWords();imported=null;closeModal();go('home');toast('백업을 가져왔어요.');}
 else if(a==='reset')openModal(`${modalHead('기록을 초기화할까요?')}<p>수업, 복습, 필기, 경험치 기록을 지웁니다. 단어팩은 유지됩니다. 삭제 전 백업을 내보내 주세요.</p><div class="modal-actions">${btn('export','먼저 백업','soft')}${btn('confirm-reset','기록 삭제','danger')}</div>`);
 else if(a==='confirm-reset'){cancelWork();await tail;state=await replaceBackup(fresh(),[],savedRevision);savedRevision=state.revision;epoch++;closeModal();go('home');}
 }catch(e){toast(e.message||'작업을 완료하지 못했어요.');}
});
document.addEventListener('input',event=>{
 if(event.target.id==='search'){search=event.target.value;limit=80;refreshWordResults();}
 if(event.target.id==='practice-repeats'){
  const count=Number(event.target.value);
  if(Number.isSafeInteger(count)&&count>=1&&count<=20)practiceRepeats=count;
  document.querySelectorAll('.repeat-options [data-count]').forEach(button=>{const selected=Number(button.dataset.count)===count;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
 }
});
document.addEventListener('change',async event=>{
 const k=event.target.dataset.setting;
 if(k&&['furigana','motion','penWidth','rate','kanjiOnlyPractice','reviewNotifications','intensity','adaptiveSRS'].includes(k)){state.settings[k]=['furigana','motion','kanjiOnlyPractice','reviewNotifications','adaptiveSRS'].includes(k)?event.target.checked:k==='intensity'?intensityKey(event.target.value):Number(event.target.value);await save();if(k==='intensity'){const d=document.querySelector('#intensity-description');if(d)d.textContent=policyDescription(state.settings.intensity);}if(k==='reviewNotifications'&&state.settings[k])await requestReviewPermission().catch(()=>{});render();}
 if(event.target.id==='backup-file'){const f=event.target.files[0];if(!f)return;try{if(f.size>30e6)throw new Error('백업은 30MB 이하만 가능합니다.');confirmImport(await f.text());}catch(e){toast(e.message);}}
});
document.addEventListener('keydown',event=>{if(!modal.firstChild)return;if(event.key==='Escape'){event.preventDefault();closeModal();}if(event.key==='Tab'){const all=[...modal.querySelectorAll('button:not(:disabled),input:not(.sr-only),select,a[href]')],first=all[0],last=all.at(-1);if(!all.includes(document.activeElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
window.addEventListener('hashchange',()=>{cancelWork();closeModal(false);if(ready){save();render();}scrollTo(0,0);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){promptClock.invalid=true;cancelWork();ink?.destroy();ink=null;save();}else if(ready)render();});
window.addEventListener('beforeunload',()=>{cancelWork();});
async function boot(){installBridge();try{await openStore();state=await loadState();savedRevision=state.revision;try{tutorialRecord=await loadTutorial();}catch{tutorialSuppressed=true;tutorialSaveFailed=true;}await initializePacks();await loadStrokeBank();await loadExamples();mergeWords();requireStrokes(words.flatMap(writingChars));if(!location.hash&&((state.uiRoute==='lesson'&&state.session&&!state.session.finished)||(state.uiRoute==='kana-practice'&&state.kana.session&&!state.kana.session.finished)||(state.uiRoute==='word-practice'&&state.wordPractice&&!state.wordPractice.finished)))history.replaceState(null,'','#'+state.uiRoute);ready=true;render();syncReminders(state).catch(()=>{});refreshCommerce().catch(()=>{});}catch(e){storageOK=false;warning=e.message;ready=true;await initializePacks();mergeWords();root.innerHTML=`<main class="fatal"><h1>학습 기록을 불러오지 못했습니다.</h1><p>${esc(e.message)}</p><p>손상된 기록을 새 기록으로 덮어쓰지 않았습니다. 원본 백업을 내려받고 개발자에게 전달해 주세요.</p><button id="raw-backup" class="btn primary">원본 기록 백업</button></main>`;document.querySelector('#raw-backup').onclick=async()=>{try{downloadJSON(await rawState(),'kotoba-recovery.json');}catch{toast('저장소 접근이 차단되어 백업도 읽을 수 없습니다. 다른 브라우저에서 확인하세요.');}};}
 if('serviceWorker'in navigator&&!isNative()&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
boot();
window.addEventListener('kotoba-back',()=>{if(modal.firstChild){closeModal();return;}if(route()==='word-practice'){document.querySelector('[data-action="practice-exit"]')?.click();return;}if(route()==='kana-practice'){document.querySelector('[data-action="kana-pause"]')?.click();return;}if(route()==='lesson'){document.querySelector('[data-action="pause"]')?.click();return;}if(route()!=='home'){go('home');return;}if(isNative())callNative('requestExit',{},120000).catch(()=>{});});

window.addEventListener('kotoba-commerce-changed',()=>{if(modal.querySelector('.premium-plans'))openModal(`${modalHead('코토바 프리미엄')}${premiumScreen()}`);});

window.addEventListener('kotoba-pause',()=>{cancelWork();save();});
