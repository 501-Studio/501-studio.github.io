import {LEVELS,EXPECTED,TITLES,courses,writingChars,writingPattern,validateStoredPack,SOURCE_REV} from './catalog.js';
import {fresh,current,createClass,classifySurvey,createReview,submit,next,remediate,unresolved,levelStats,dueItems,dueLabel,dayKey,streak,keyOf,validateState,courseLaps} from './course-engine.js';
import {openStore,loadState,commit,rawState,replaceBackup,ConflictError} from './storage.js';
import {packs,catalog,initializePacks,installPack,packInfo} from './packs.js';
import {btn,icon,esc,mark,ring,wave,heading,empty} from './view.js';
import {attachStrokePad} from './stroke-pad.js';
import {SNAP_MODE,validPrefix} from './stroke-match.js';
import {loadStrokeBank,characterStrokes,requireStrokes} from './stroke-bank.js';
import {speak,stopAudio} from './audio.js';
import {isNative,callNative,installBridge} from './native.js';
import {applyMotion,haptic,celebrate} from './motion.js';

const root=document.querySelector('#app'),modal=document.querySelector('#modal-root');
let state=fresh(),words=[],lookup=new Map(),ready=false,saving=false,busy=false,ink=null,storageOK=true,warning='',toastTimer,epoch=0,audioNonce=0,gradeNonce=0;
let filter='due',wordFilter='all',search='',limit=80,courseLimit=24,pendingCourse=null,imported=null,priorFocus=null,downloading=false;
let savedRevision=0,tail=Promise.resolve();
const names={survey:'빠른 회독',study:'새 단어',audio:'발음 듣기',trace:'한자 따라 쓰기',meaning:'뜻 확인',listening:'듣기 시험',writing:'한자 쓰기 시험'};
const route=()=>location.hash.slice(1)||'home';
const W=id=>lookup.get(id)||state.session?.wordSnapshots?.find(w=>w.id===id);
function mergeWords(){words=catalog();lookup=new Map(words.map(w=>[w.id,w]));for(const w of state.session?.wordSnapshots||[])if(!lookup.has(w.id))lookup.set(w.id,w);}
function toast(text){const t=document.querySelector('#toast');t.textContent=text;t.className='on show';clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.className='',4500);}
function save(){
 const snapshot=structuredClone(state),generation=epoch;
 const job=tail.then(async()=>{if(generation!==epoch||!storageOK)return false;saving=true;
 try{const saved=await commit(snapshot,savedRevision);savedRevision=saved.revision;state.revision=savedRevision;return true;}
 catch(e){epoch++;if(e instanceof ConflictError){state=await loadState();savedRevision=state.revision;mergeWords();toast(e.message);render();}else{storageOK=false;warning='저장에 실패했습니다. 학습을 멈추고 설정에서 백업해 주세요.';toast(warning);render();}return false;}finally{saving=false;}});
 tail=job.catch(()=>false);return job;
}
function cancelWork(){audioNonce++;gradeNonce++;stopAudio();busy=false;}
function go(name){if(route()===name)render();else location.hash=name;}
function showReading(w){return state.settings.furigana&&w.reading?`<span class="reading" lang="ja">${esc(w.reading)}</span>`:'';}
function wordHTML(w,large=false){return `<div class="${large?'big-japanese':'japanese'}"><strong lang="ja">${esc(w.word)}</strong>${showReading(w)}</div>`;}
function levelButtons(){return `<div class="level-tabs" role="group" aria-label="학습 급수">${LEVELS.map(l=>`<button data-action="level" data-level="${l}" class="${state.settings.level===l?'active':''}" aria-pressed="${state.settings.level===l}">${l}</button>`).join('')}</div>`;}
const menus=[['home','home','홈'],['course','book','커리큘럼'],['review','refresh','복습'],['words','library','단어장'],['profile','chart','내 기록']];
function nav(mobile=false){return `<nav class="${mobile?'bottom-nav':'side-nav'}" aria-label="${mobile?'모바일 메뉴':'주 메뉴'}">${menus.map(([id,ic,label])=>`<a href="#${id}" class="${route()===id?'active':''}" ${route()===id?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></a>`).join('')}</nav>`;}
function shell(body){const d=state.daily[dayKey()]?.keys.length||0;return `<aside class="sidebar"><a class="brand" href="#home">${mark()}<span>kotoba</span></a>${nav()}<div class="sidebar-bottom">한 번 더, 내 단어로.<button class="quiet-link" data-action="settings">${icon('settings')}설정</button><a href="./privacy.html">개인정보 · 데이터 안내</a></div></aside><div class="workspace">${warning?`<div class="store-warning" role="alert">${esc(warning)}</div>`:''}<header class="appbar"><a class="mobile-brand" href="#home">${mark()}<b>코토바</b></a><span class="desktop-title">나의 일본어 수업</span><div class="appbar-tools"><button class="reading-toggle ${state.settings.furigana?'active':''}" data-action="furigana" aria-pressed="${state.settings.furigana}" aria-label="히라가나 ${state.settings.furigana?'끄기':'켜기'}"><span lang="ja">あ</span><span>${state.settings.furigana?'켜짐':'꺼짐'}</span></button><button class="icon-btn" data-action="settings" aria-label="설정">${icon('settings')}</button></div></header><div class="layout"><main class="page" id="main">${body}</main><aside class="right-rail"><section class="panel rail-goal">${ring(d,state.settings.goal)}<h3>오늘도 작은 기억을 쌓아요</h3><p>뜻·듣기·쓰기 문제를 풀면<br>오늘의 목표에 반영돼요.</p></section><section class="panel"><h3>수업은 이렇게 흘러가요</h3><ol class="class-flow"><li>새 단어와 뜻 확인</li><li>발음을 듣고 한자 쓰기</li><li>모든 단어의 3유형 시험</li><li>빠진 기억을 다시 확인</li></ol><p class="fine">틀린 문제를 남긴 채 완료되지는 않아요.</p></section><p class="fine rail-note">N5~N1 공개 어휘팩과 한국어 시작 단어를 함께 제공합니다. 단어 수는 설치된 실제 데이터 기준이며, 공식 JLPT 출제 목록은 아닙니다.</p></aside></div></div>${nav(true)}`;}
function resume(){const s=state.session;return s&&!s.finished?`<section class="resume"><div><b>진행 중인 수업이 있어요</b><p>${s.index+1} / ${s.queue.length}단계 · 필기도 저장돼요</p></div>${btn('resume','이어서','soft')}</section>`:'';}
function home(){
 const l=state.settings.level,list=courses(words,l),c=list.find(c=>!state.completed[c.id])||list[0],stats=levelStats(state,words,l),p=packInfo(l),lap=courseLaps(state,c.id)+1;
 return `${heading('오늘도, 한 챕터씩.','30단어를 빠르게 훑고 모르는 단어만 집중해요.')}${resume()}
 <section class="panel levels-panel"><div class="section-title"><h2>급수별 학습 현황</h2><span>아는·완료 / 설치 단어</span></div><div class="level-progress-grid">${LEVELS.map(level=>{const st=levelStats(state,words,level);return `<button data-action="level" data-level="${level}" class="level-progress ${level===l?'selected':''}" aria-pressed="${level===l}"><div><b>${level}</b><span>${st.learned}<small> / ${st.total.toLocaleString()}</small></span></div><span class="line-progress"><i style="width:${st.total?st.learned/st.total*100:0}%"></i></span><small>아는 단어 ${st.known} · 복습 ${st.due}</small></button>`;}).join('')}</div></section>
 <section class="chapter-book featured" data-action="start-course" data-id="${c.id}" role="button" tabindex="0" aria-label="${l} 제${c.index}장 ${lap}회독 시작">
   <span class="book-ribbon">${state.session?.course?.id===c.id&&!state.session.finished?'진행중':'다음 회독'}</span>
   <div class="book-spine"></div>
   <div class="book-copy"><b>${l}</b><strong>第${c.index}章</strong><span>${lap}회독</span><small>No.${c.startNo}~${c.endNo}</small></div>
   <span class="book-open">${icon('book')}</span>
 </section>
 <div class="chapter-summary"><b>${esc(c.title)}</b><p>30단어 빠른 회독 → 모르는 단어만 듣기·쓰기 → 모르는 단어만 시험</p>${btn('start-course',`${icon('next')} 제${c.index}장 ${lap}회독 시작`,'primary wide',`data-id="${c.id}" ${storageOK?'':'disabled'}`)}</div>
 <div class="home-shortcuts"><button class="panel shortcut" data-action="review-start"><span class="soft-icon lavender">${icon('refresh')}</span><div><b>잊기 전에 복습</b><p>${stats.due?`${stats.due}문제가 기다려요`:'예정된 복습을 확인해요'}</p></div>${icon('next')}</button><a class="panel shortcut" href="#course"><span class="soft-icon mint">${icon('book')}</span><div><b>전체 챕터</b><p>${list.length}개 챕터 · 챕터당 최대 30단어</p></div>${icon('next')}</a></div>
 <p class="page-footnote">${p.complete?'전체 공개 단어팩 설치됨':`${l} 기본 단어로 시작 중 · 전체팩 원본 ${p.available.toLocaleString()}개`}</p>`;
}
function curriculum(){
 const l=state.settings.level,p=packInfo(l),list=courses(words,l);
 return `${heading('챕터를 골라 회독해요.','한 챕터는 최대 30단어. 다시 열면 회독 수가 올라가요.')}${levelButtons()}
 <section class="panel pack-banner"><div><span class="label">${l}</span><h2>${TITLES[l]}</h2><p>${p.installed.toLocaleString()}단어 · ${list.length}개 챕터</p><p class="fine">${p.complete?`전체 공개팩 설치됨 · 영어 뜻 ${p.english.toLocaleString()}개`:`기본 한국어 단어 · 전체팩 원본 ${p.available.toLocaleString()}개`}</p></div>${btn('packs',icon('download')+' 단어팩','soft')}</section>
 <div class="chapter-library">${list.slice(0,courseLimit).map(c=>{const laps=courseLaps(state,c.id),current=state.session?.course?.id===c.id&&!state.session.finished;return `<button class="chapter-book ${current?'current':''}" data-action="start-course" data-id="${c.id}">${current?'<span class="book-ribbon">진행중</span>':''}<span class="book-spine"></span><span class="book-copy"><b>${l}</b><strong>第${c.index}章</strong><span>${Math.max(1,laps+1)}회독</span><small>No.${c.startNo}~${c.endNo}</small></span><span class="book-open">${icon('book')}</span></button>`;}).join('')}</div>
 ${list.length>courseLimit?btn('more-courses','챕터 더 보기','soft wide'):''}
 <div class="info-note">${icon('book')}<div>회독을 시작하면 먼저 30단어를 아는 단어/모르는 단어로 분류하고, 모르는 단어만 집중 학습·시험합니다.</div></div>`;
}
function review(){const rows=dueItems(state,words,Date.now(),filter),due=dueItems(state,words),weak=dueItems(state,words,Date.now(),'weak');return `${heading('다시 만나면, 더 오래.','뜻·한자 쓰기·듣기를 따로 기억해요.')}${levelButtons()}<section class="panel review-summary"><span class="soft-icon lavender">${icon('refresh')}</span><div><h2>${due.length}문제 복습할 시간</h2><p>헷갈린 ${weak.length}문제 · 현재 ${state.settings.level}</p></div>${btn('review-start','복습 시작','primary',due.length?'':'disabled')}</section><div class="filter-chips" role="group" aria-label="복습 필터">${[['due','지금 복습'],['weak','헷갈린 단어'],['all','전체 일정']].map(([id,name])=>`<button class="${filter===id?'active':''}" data-action="filter" data-id="${id}">${name}</button>`).join('')}</div>${filter==='weak'&&rows.length?btn('weak-start','헷갈린 문제만 풀기','soft wide'):''}<section class="panel word-list">${rows.slice(0,80).map(r=>{const w=W(r.wordId);return `<button class="word-row" data-action="word" data-id="${w.id}">${wordHTML(w)}<div class="word-detail"><p>${esc(w.meaning)}</p><small>${names[r.skill]} · ${dueLabel(r.due)}</small></div>${icon('next')}</button>`;}).join('')||empty('지금은 복습할 문제가 없어요.','수업에서 단어를 배운 뒤 다시 만나요.')}</section><div class="panel spaced"><h3>맞힐수록, 복습 간격이 늘어요</h3><p class="interval-copy">10분 → 1일 → 3일 → 7일 → 14일 → 30일</p><p class="fine">틀리면 10분 뒤에 다시 확인해요. 같은 수업에서 다시 맞히거나 너무 일찍 복습한 기록은 다음 복습일을 뒤로 미루지 않아요. 이 간격은 규칙 기반이며 개인별 효과가 검증된 모델은 아닙니다.</p></div>`;}
function matchingWords(){return words.filter(w=>w.level===state.settings.level&&(wordFilter!=='star'||state.starred.includes(w.id))&&(!search||[w.word,w.reading,w.meaning].some(v=>v.toLowerCase().includes(search.toLowerCase()))));}
function wordRows(){const list=matchingWords();return `${list.slice(0,limit).map(w=>`<div class="word-row"><button class="word-button" data-action="word" data-id="${w.id}">${wordHTML(w)}<div class="word-detail"><p>${esc(w.meaning)}</p><small>${state.learned[w.id]?'수업 완료':state.encountered[w.id]?'학습 중':'아직 안 배운 단어'}${w.language==='en'?' · 영어 뜻':''}</small></div></button><button class="icon-btn ${state.starred.includes(w.id)?'starred':''}" data-action="star" data-id="${w.id}" aria-label="${esc(w.word)} 별표" aria-pressed="${state.starred.includes(w.id)}">${icon('star')}</button></div>`).join('')||empty('일치하는 단어가 없어요.','다른 뜻이나 읽기로 찾아보세요.')}${list.length>limit?btn('more-words',`${list.length-limit}개 더 보기`,'soft wide'):''}`;}
function wordPage(){return `${heading('배운 단어를 한곳에.','한자, 히라가나, 뜻으로 찾아보세요.')}${levelButtons()}<label class="word-search">${icon('search')}<input id="search" type="search" value="${esc(search)}" aria-label="단어 검색" placeholder="한자, 읽기, 한국어·영어 뜻" autocomplete="off"></label><div class="filter-chips"><button data-action="word-filter" data-id="all" class="${wordFilter==='all'?'active':''}">전체</button><button data-action="word-filter" data-id="star" class="${wordFilter==='star'?'active':''}">별표</button></div><section class="panel word-list" id="word-results">${wordRows()}</section>`;}
function profile(){const d=state.daily[dayKey()]?.keys.length||0;return `${heading('기억이 쌓인 자리.','맞혔다는 사실과 오래 기억하는 것은 달라요.')}<section class="panel profile-summary">${ring(d,state.settings.goal)}<div><h2>${state.xp.toLocaleString()} XP</h2><p>${streak(state)}일 연속 학습</p><p class="fine">중복 문제에는 오늘의 XP를 다시 주지 않아요.</p></div></section><section class="panel spaced"><h3>장기 복습 단계에 도달한 단어</h3>${LEVELS.map(l=>{const s=levelStats(state,words,l);return `<div class="memory-row"><strong>${l}</strong><span>수업 완료 ${s.learned} · 장기 복습 ${s.mastered}</span></div>`;}).join('')}<p class="fine">‘장기 복습’은 뜻·듣기·쓰기가 모두 7일 간격 이상인 단어예요. 한 번 맞혔다고 완전히 외웠다고 표시하지 않아요.</p></section><div class="settings-quick spaced">${btn('settings',icon('settings')+' 학습 설정','soft')}${btn('export',icon('download')+' 기록 백업','soft')}</div>${state.legacy?'<p class="info-note">이전 버전의 자가평가 기록은 자동 채점 숙련도와 구분해 보관했어요.</p>':''}`;}
function ensureInk(s,w){
 const chars=writingChars(w);requireStrokes(chars);
 if(!s.ink||s.ink.mode!==SNAP_MODE||s.ink.characters.length!==chars.length)s.ink={mode:SNAP_MODE,characters:chars.map(()=>[]),results:chars.map(()=>false),active:0,method:'stroke-snap',hadError:false,misses:0};
 const q=s.ink;q.active=Math.min(Math.max(0,q.active),chars.length-1);
 q.characters=q.characters.map((lines,i)=>validPrefix(lines,characterStrokes(chars[i])));
 q.results=chars.map((c,i)=>q.characters[i].length===characterStrokes(c).length);return q;
}
function questionPage(){const s=state.session;if(!s)return `<div class="focus-shell">${heading('시작한 수업이 없어요.')}${btn('home','홈으로','primary')}</div>`;if(s.finished)return resultPage();const t=current(s),w=W(t.wordId);if(!w)return '<div class="loading">수업 단어를 찾지 못했습니다. 기록을 백업해 주세요.</div>';const training=t.phase==='learn',writing=['trace','writing'].includes(t.skill);let body='';
 if(t.skill==='survey'){
  const reading=s.surveyReading&&w.reading?`<span class="survey-reading" lang="ja">${esc(w.reading)}</span>`:'';
  const meaning=s.surveyMeaning?`<p class="survey-meaning">${esc(w.meaning)}</p>`:'<p class="survey-placeholder">뜻은 가리고 빠르게 판단해 보세요.</p>';
  body=`${heading('이 단어, 알고 있나요?','30단어를 빠르게 훑은 뒤 모르는 단어만 시험해요.')}<section class="survey-card"><span class="survey-count">${s.index+1} / ${s.wordIds.length}</span><strong lang="ja">${esc(w.word)}</strong>${reading}${meaning}<div class="survey-reveals"><button data-action="survey-reading" class="${s.surveyReading?'active':''}">あ ${s.surveyReading?'히라가나 숨기기':'히라가나 표시하기'}</button><button data-action="survey-meaning" class="${s.surveyMeaning?'active':''}">${icon('eye')}${s.surveyMeaning?'뜻 숨기기':'한국어 뜻 표시하기'}</button></div></section>`;
 }
 if(t.skill==='study')body=`${heading('새로운 단어를 만나요.','뜻을 확인한 뒤 소리로도 기억해요.')}<section class="flashcard intro-card">${wordHTML(w,true)}<p class="word-meaning">${esc(w.meaning)}</p><span class="label">${w.level}${w.language==='en'?' · 영어 뜻':''}</span></section>`;
 if(t.skill==='audio'||t.skill==='listening')body=`${heading(training?'소리까지 함께 기억해요.':'듣고, 알맞은 단어를 골라요.',training?'재생이 끝나면 한자를 직접 써 볼 거예요.':'소리를 듣기 전에는 정답을 제출할 수 없어요.')}<section class="listening-stage ${training?'training-audio':''}">${training?wordHTML(w,true):''}<div class="audio-controls"><button class="audio-main" data-action="listen" aria-label="단어 듣기">${icon('sound')}${wave()}</button><button class="slow-button" data-action="slow" aria-label="천천히 듣기">0.7×</button></div><p class="audio-status" id="audio-status">${s.heard?'1회 자동재생 완료 · 더 듣고 싶으면 버튼을 눌러 주세요.':'재생 버튼을 눌러 주세요.'}</p>${training?`<p class="word-meaning">${esc(w.meaning)}</p>`:''}</section>${training?'':options(t,w)}`;
 if(t.skill==='meaning')body=`${heading('이 단어의 뜻은 무엇일까요?','방금 배운 단어를 기억에서 꺼내 보세요.')}<section class="word-question">${wordHTML(w,true)}</section>${options(t,w)}`;
 if(writing){const q=ensureInk(s,w),chars=writingChars(w),active=q.active,guide=training||s.assisted,paths=characterStrokes(chars[active]);body=`${heading(training?'한 획씩 쓰면, 딱 맞춰져요.':'뜻을 보고, 한자로 써 보세요.',training?'초록 시작점에서 화살표 방향으로 한 획씩 그어 주세요.':'보이지 않는 한자를 떠올려 한 획씩 써 주세요.')}<div class="ink-prompt"><div><strong>${esc(w.meaning)}</strong><p lang="ja">${guide?esc(w.word):esc(writingPattern(w))}</p>${guide?showReading(w):''}</div><span class="label">${training?'획 따라 쓰기':'기억해서 쓰기'}</span></div><div class="character-tabs" role="group" aria-label="쓸 글자 선택">${chars.map((c,i)=>`<button data-action="character" data-index="${i}" class="${i===active?'active':''} ${q.results[i]?'complete':''}" aria-label="${i+1}번째 글자" ${s.feedback?'disabled':''}>${q.results[i]?icon('check'):guide?esc(c):i+1}</button>`).join('')}<span class="stroke-count" id="stroke-count">${q.characters[active].length} / ${paths.length}획</span></div><div class="ink-pad snap-pad"><div class="cross-lines"></div><canvas id="ink-canvas" aria-label="${active+1}번째 한자 획 따라 쓰기 필기장"></canvas><span class="pad-counter">${active+1} / ${chars.length}글자</span><span class="pad-local">${icon('check')}내장 · 오프라인</span></div><p class="grader-status" id="grade-status" role="status">${q.results[active]?'이 글자의 모든 획을 완성했어요.':guide?`${q.characters[active].length+1}번째 획을 그어 주세요.`:'한 획을 쓰고 손을 떼면 자동으로 확인해요.'}</p><div class="ink-toolbar">${btn('undo',icon('undo')+' 한 획 취소','text',s.feedback?'disabled':'')}${btn('clear',icon('trash')+' 다시 쓰기','text',s.feedback?'disabled':'')}${btn('replay',icon('refresh')+' 획 재생','text')}</div>${!training&&!s.feedback?btn('hint','정답 획을 보고 연습','text hint-button'):''}<p class="fine ink-fine">${training?'맞는 획은 제자리로 보정돼요. 잘못 그은 획만 다시 쓰면 돼요.':'시험에서는 획 안내를 숨깁니다. 틀리면 단어 완성 후 다시 출제해요.'}</p>`;}
 if(s.feedback&&!s.feedback.training)body+=`<section class="answer-reveal">${wordHTML(w)}<p>${esc(w.meaning)}</p>${s.feedback.method==='stroke-snap'?'<small>앱 내장 획순·모양 판정</small>':''}</section>`;
 const chapterLabel=s.kind==='class'&&s.course?`${s.course.level} · 第${s.course.index}章 · ${courseLaps(state,s.course.id)+1}회독`:s.level||state.settings.level;return `<div class="focus-shell"><header class="focus-top"><button class="icon-btn" data-action="pause" aria-label="저장하고 나가기">${icon('close')}</button><div class="session-progress"><div class="line-progress"><i style="width:${s.index/s.queue.length*100}%"></i></div></div><button class="reading-toggle" data-action="furigana" aria-pressed="${state.settings.furigana}" aria-label="히라가나 표시 전환"><span lang="ja">あ</span>${state.settings.furigana?'ON':'OFF'}</button></header><div class="session-label"><span>${chapterLabel} · ${t.phase==='survey'?'빠른 회독':training?'모르는 단어 학습':'모르는 단어 시험'}${t.attempt?' · 다시 확인':''}</span><span>${t.phase==='survey'?`${s.index+1}/${s.wordIds.length}`:`${s.index+1}/${s.queue.length}`}</span></div><main class="question" id="main">${body}</main></div>${footer(s,t)}`;
}
function options(t,w){return `<div class="options" role="group" aria-label="답 선택">${t.options.map((o,i)=>{const selected=state.session.selection===o,correct=o===(t.skill==='listening'?w.word:w.meaning);const f=state.session.feedback;return `<button class="answer-option ${selected?'selected':''} ${f?(correct?'correct':selected?'wrong':''):''}" data-action="option" data-index="${i}" aria-pressed="${selected}" ${f?'disabled':''}><span>${i+1}</span><b ${t.skill==='listening'?'lang="ja"':''}>${esc(o)}</b></button>`;}).join('')}</div>`;}
function canAnswer(){const s=state.session,t=current(s);return !!s&&!s.feedback&&!s.finished&&!!s.selection&&(t.skill!=='listening'||s.heard);}
function footer(s,t){let content='',kind='';
 if(t?.skill==='survey'&&!s.feedback){content=`<div class="survey-footer"><button class="btn soft unknown" data-action="unknown-word">${icon('refresh')} 모르는 단어</button><button class="btn primary known" data-action="known-word">${icon('check')} 아는 단어</button></div>`;return `<footer class="lesson-footer survey-mode"><div class="lesson-footer-inner">${content}</div></footer>`;}
 if(s.feedback){const f=s.feedback;kind=f.correct?'correct':'wrong';content=`<div class="feedback-copy" role="status"><span class="feedback-mark">${icon(f.correct?'check':'refresh')}</span><div><b>${f.training?'기억에 한 걸음 더.':f.correct?'정답이에요.':'다시 확인할 단어예요.'}</b><p>${f.training?'아직 암기 완료로 기록하지 않아요.':f.correct?`${f.gained?`+${f.gained} XP · `:''}이 유형을 통과했어요.`:f.assisted?'힌트 사용 · 도움 없이 다시 확인해요.':'정답을 확인하고, 뒤에서 한 번 더 풀어요.'}</p></div></div>${btn('next','다음으로','primary')}`;}
 else if(t.skill==='study')content=`<span class="footer-hint">이제 발음을 들어 볼게요.</span>${btn('studied','발음 들으러 가기','primary')}`;
 else if(t.skill==='audio')content=`<span class="footer-hint">재생이 끝나야 다음으로 갈 수 있어요.</span>${btn('audio-done','한자 쓰러 가기','primary',s.heard?'':'disabled')}`;
 else if(['trace','writing'].includes(t.skill)){const q=s.ink,all=q?.results.every(Boolean),done=q?.results[q.active],paths=characterStrokes(writingChars(W(t.wordId))[q.active]),left=paths.length-q.characters[q.active].length;content=`<span class="footer-hint">${q?.results.filter(Boolean).length||0}/${q?.results.length||1}글자 완성 · 한 획씩 자동 판정</span>${btn(all?'ink-done':done?'snap-next':'stroke-wait',all?'단어 쓰기 완료':done?'다음 한자 쓰기':`${left}획 더 쓰면 완성`,'primary',all||done?'':'disabled')}`;}

 else content=`<span class="footer-hint">${t.skill==='listening'?'소리를 끝까지 듣고 선택하세요.':'알맞은 답을 골라 주세요.'}</span>${btn('answer','정답 확인','primary',canAnswer()?'':'disabled')}`;
 return `<footer class="lesson-footer ${kind}"><div class="lesson-footer-inner">${content}</div></footer>`;
}
function resultPage(){
 const s=state.session,missing=unresolved(s),ratio=s.originalQuiz?Math.round(s.firstCorrect/s.originalQuiz*100):100,known=s.knownIds?.length||0,unknown=s.unknownIds?.length||0;
 return `<main class="focus-shell"><section class="result"><div class="result-emblem">${icon(s.completed?'check':'refresh')}</div><h1>${s.completed?'이번 회독을 마쳤어요.':'아직 남은 기억이 있어요.'}</h1><p>${s.completed?`${s.wordIds.length}단어 회독 완료 · 아는 단어 ${known}개 · 집중 학습 ${unknown}개`:`${missing.length}개 유형을 아직 통과하지 못했어요.`}</p><div class="result-metrics"><div><span>아는 단어</span><b>${known}</b></div><div><span>집중 학습</span><b>${unknown}</b></div><div><span>시험 첫 정답</span><b>${ratio}%</b></div></div><section class="panel result-words">${s.wordIds.map(id=>{const w=W(id),isKnown=s.knownIds?.includes(id);return `<div class="result-word">${wordHTML(w)}<div class="result-skills">${isKnown?'<span class="done">아는 단어 ✓</span>':['meaning','listening','writing'].map(k=>`<span class="${s.passed[keyOf(id,k)]?'done':''}">${names[k].replace(' 시험','').replace(' 확인','')} ${s.passed[keyOf(id,k)]?'✓':'—'}</span>`).join('')}</div></div>`;}).join('')}</section>${missing.length?btn('remediate','남은 문제 다시 풀기','primary wide'):btn('next-course','다음 챕터','primary wide')}${btn('finish','학습 홈으로','soft wide')}<p class="fine">아는 단어는 이번 회독 시험에서 제외됩니다. 다시 회독하면 언제든 모르는 단어로 바꿀 수 있어요.</p></section></main>`;
}
function render(){
 ink?.destroy();ink=null;applyMotion(state.settings);
 const t=current(state.session);document.documentElement.dataset.snap=String(route()==='lesson'&&!!t&&['trace','writing'].includes(t.skill));
 root.innerHTML=route()==='lesson'?questionPage():shell(({home,course:curriculum,review,words:wordPage,profile}[route()]||home)());
 if(route()==='lesson'&&t&&['audio','listening'].includes(t.skill)&&!state.session.heard&&state.session.autoPlayedTask!==t.id){
  state.session.autoPlayedTask=t.id;save();setTimeout(()=>{if(route()==='lesson'&&current(state.session)?.id===t.id&&!state.session.heard)play(false,null,true);},90);
 }
 const canvas=document.querySelector('#ink-canvas');if(canvas){const s=state.session,q=s.ink,paths=characterStrokes(writingChars(W(t.wordId))[q.active]);
  ink=attachStrokePad(canvas,paths,q.characters[q.active],{guide:t.phase==='learn'||s.assisted,motion:state.settings.motion,width:state.settings.penWidth,
   onChange(){q.results[q.active]=q.characters[q.active].length===paths.length;},
   onAttempt(result,count,total){
    if(!result.accepted){q.misses=(q.misses||0)+1;if(t.phase==='quiz')q.hadError=true;}
    document.querySelector('#grade-status').textContent=result.accepted?(count===total?'이 글자의 모든 획을 완성했어요.':`${count}획 완성. ${count+1}번째 획을 이어 주세요.`):result.reason;
    document.querySelector('#grade-status').dataset.verdict=result.accepted?'correct':'retry';
    document.querySelector('#stroke-count').textContent=`${count} / ${total}획`;
    const tab=document.querySelector(`.character-tabs [data-index="${q.active}"]`);tab?.classList.toggle('complete',q.results[q.active]);if(q.results[q.active]&&tab)tab.innerHTML=icon('check');
    document.querySelector('.lesson-footer').outerHTML=footer(s,t);haptic(state.settings,result.accepted);save();
   }});if(s.feedback)canvas.style.pointerEvents='none';
 }
}
function syncButtons(){const s=state.session;if(!s)return;const b=document.querySelector('[data-action="answer"]');if(b)b.disabled=!canAnswer()||busy;const a=document.querySelector('[data-action="audio-done"]');if(a)a.disabled=!s.heard||busy;}
function modalHead(title){return `<div class="sheet-head"><h2 id="sheet-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="닫기">${icon('close')}</button></div>`;}
function openModal(body){priorFocus=document.activeElement;modal.innerHTML=`<div class="modal-backdrop"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">${body}</section></div>`;document.body.classList.add('modal-open');modal.querySelector('button,input,select')?.focus();}
function closeModal(){modal.innerHTML='';document.body.classList.remove('modal-open');priorFocus?.focus?.();}
function settings(){openModal(`${modalHead('내 속도에 맞춰요')}<div class="setting-row"><div><b>히라가나 표시</b><p>단어의 읽기를 켜거나 끄기</p></div><input type="checkbox" data-setting="furigana" aria-label="히라가나 표시" ${state.settings.furigana?'checked':''}></div><div class="setting-row"><div><b>화면 애니메이션</b><p>기기의 동작 줄이기도 반영해요</p></div><input type="checkbox" data-setting="motion" aria-label="화면 애니메이션" ${state.settings.motion?'checked':''}></div><div class="setting-row"><div><b>일본어 재생 속도</b></div><select data-setting="rate" aria-label="재생 속도">${[.7,.85,1].map(n=>`<option value="${n}" ${n===state.settings.rate?'selected':''}>${n}×</option>`).join('')}</select></div><div class="setting-row"><div><b>펜 굵기</b></div><select data-setting="penWidth" aria-label="펜 굵기">${[3,4,6].map(n=>`<option value="${n}" ${n===state.settings.penWidth?'selected':''}>${n}px</option>`).join('')}</select></div><div class="setting-row"><div><b>하루 목표</b></div><select data-setting="goal" aria-label="하루 목표">${[5,10,20,30].map(n=>`<option value="${n}" ${n===state.settings.goal?'selected':''}>${n}문제</option>`).join('')}</select></div><div class="modal-actions">${btn('export','기록 백업','soft')}${btn('import','백업 가져오기','soft')}</div><input id="backup-file" type="file" accept="application/json,.json" class="sr-only"><div class="spaced">${btn('packs',icon('download')+' N5~N1 전체 단어팩','soft wide')}</div>${isNative()?`<p class="info-note">손글씨 판정과 모든 획 데이터가 APK에 내장돼 있어요. 첫 실행부터 인터넷 없이, 한 획씩 확인하고 제자리로 보정합니다. 외부 모델이나 별도 설치가 필요 없어요.</p>`:`<p class="info-note">앱과 같은 획순·위치·모양 판정을 사용합니다. 이 기능은 정해진 글자를 따라 쓰는 학습 기능이며 자유 필기 OCR은 아닙니다.</p>`}<a class="quiet-link" href="./privacy.html">개인정보 · 콘텐츠 출처 · 앱 제한</a><div class="spaced">${btn('reset','학습 기록 초기화','text danger')}</div>`);}
function packsModal(){if(isNative()){openModal(`${modalHead('앱에 모두 담겨 있어요')}<p>N5~N1 단어팩과 획 데이터가 APK 안에 들어 있어요. 다운로드나 손글씨 모델 준비 없이 사용할 수 있습니다.</p><div class="pack-levels">${LEVELS.map(l=>`<div class="memory-row"><b>${l}</b><span>${packInfo(l).installed.toLocaleString()}단어 내장</span></div>`).join('')}</div><p class="fine">일본어 듣기는 기기에 설치된 TTS 음성을 사용합니다. 대부분의 전체팩 뜻은 영어 원문이며 한국어 검수는 진행 전입니다.</p>`);return;}openModal(`${modalHead('N5부터 N1까지')}<p class="fine">OpenJLPT 고정 버전에서 내려받습니다. 기본 단어는 한국어, 전체팩 대부분은 영어 뜻이며 한국어 검수가 남아 있어요. 다운로드 시 GitHub에 접속 정보가 전달됩니다. 학습 기록·필기는 전송하지 않습니다.</p><div class="pack-levels">${LEVELS.map(l=>{const p=packInfo(l);return `<div class="pack-level"><div><b>${l}</b><p>${p.installed.toLocaleString()}개 설치 / 원본 ${p.available.toLocaleString()}항목</p><small>${p.complete?`전체팩 · 영어 뜻 ${p.english.toLocaleString()}개`:'한국어 시작 단어 60개'}</small></div>${btn('install-level',p.complete?'다시 받기':'전체팩 설치','soft',`data-level="${l}" ${downloading?'disabled':''}`)}</div>`;}).join('')}</div>${btn('install-all','5개 급수 전체팩 받기','primary wide',downloading?'disabled':'')}<p class="fine spaced">공식 전수 목록이 아닌 공개 자료입니다. 중복 표기는 병합하며 설치 후 실제 단어 수를 표시합니다. 다른 뜻의 예문이 섞인 항목은 일괄 제외합니다.</p><p id="pack-status" role="status"></p>`);}
function detail(id){const w=W(id);if(!w)return;openModal(`${modalHead('단어의 기억')}<div class="detail-word">${wordHTML(w,true)}<p class="word-meaning">${esc(w.meaning)}</p>${btn('word-audio',icon('sound')+' 발음 듣기','soft',`data-id="${w.id}"`)}</div><div class="memory-list">${['meaning','writing','listening'].map(k=>{const r=state.memory[keyOf(id,k)];return `<div class="memory-row"><b>${names[k].replace(' 시험','')}</b><span>${r?dueLabel(r.due):'아직 학습하지 않았어요'}</span></div>`;}).join('')}</div><p class="fine spaced">${w.language==='en'?'영어 원문 뜻 · 한국어 미번역':'한국어 편집 뜻'} · ${w.source==='openjlpt'?'OpenJLPT / EDRDG 기반':'코토바 자체 편집'}<br>전체 어휘와 급수 분류는 출시 전 교육 검수가 필요합니다.</p>`);}
async function startCourse(id,replace=false){if(!storageOK)return toast(warning);const c=courses(words,state.settings.level).find(c=>c.id===id);if(!c)return toast('수업을 다시 선택해 주세요.');if(state.session&&!state.session.finished&&!replace){pendingCourse=id;openModal(`${modalHead('진행 중인 수업이 있어요')}<p>이어서 학습하거나 새 회차로 바꿀 수 있어요. 이미 답한 복습 기록은 유지되지만 현재 수업은 완료되지 않습니다.</p><div class="modal-actions">${btn('resume','이어서','primary')}${btn('replace-course','새 회차 시작','soft')}</div>`);return;}cancelWork();state.session=createClass(state,c,words);closeModal();if(await save())go('lesson');}
async function submitCurrent(result,advanceTraining=false){if(busy||!storageOK)return;const s=state.session,t=current(s);if(!t)return;if(submit(state,t.id,result)){busy=true;const ok=await save();busy=false;if(!ok)return;if(advanceTraining){next(state);await save();}else haptic(state.settings,result.correct);render();document.querySelector('[data-action="next"]')?.focus({preventScroll:true});}}
async function play(slow=false,wordId=null,auto=false){const s=state.session,t=wordId?null:current(s),w=W(wordId||t?.wordId);if(!w)return;const nonce=++audioNonce,rate=slow?.7:state.settings.rate;const status=document.querySelector('#audio-status');if(status)status.textContent=auto?'자동으로 1회 듣는 중이에요…':'발음을 재생하고 있어요…';document.querySelector('.audio-main')?.classList.add('playing');
 try{await speak(w.id,rate);
 if(nonce!==audioNonce)return;if(t&&state.session===s&&current(s)?.id===t.id&&route()==='lesson'){s.heard=true;await save();if(status)status.textContent='1회 자동재생 완료 · 더 듣고 싶으면 버튼을 눌러 주세요.';syncButtons();}}
 catch(e){if(nonce===audioNonce){if(status)status.textContent=e.message;else toast(e.message);}}
 finally{if(nonce===audioNonce)document.querySelector('.audio-main')?.classList.remove('playing');}
}
function downloadJSON(object,name){const url=URL.createObjectURL(new Blob([JSON.stringify(object)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportBackup(){await tail;const backup={format:'kotoba-backup',version:1,exportedAt:new Date().toISOString(),state:structuredClone(state),packs:[...packs.values()]};if(isNative())await callNative('exportBackup',{json:JSON.stringify(backup)},120000);else downloadJSON(backup,`kotoba-${dayKey()}.json`);toast('백업을 내보냈어요.');}
function confirmImport(raw){if(raw.length>30e6)throw new Error('백업 파일은 30MB 이하로 제한됩니다.');const value=JSON.parse(raw);if(value.format!=='kotoba-backup'||!Array.isArray(value.packs)||value.packs.length>5)throw new Error('코토바 백업 파일이 아닙니다.');const st=validateState(value.state),data=value.packs.map(validateStoredPack);if(new Set(data.map(p=>p.level)).size!==data.length)throw new Error('중복 급수팩입니다.');imported={state:st,packs:data};openModal(`${modalHead('백업 기록으로 바꿀까요?')}<p>현재 기록을 덮어씁니다. 먼저 현재 기록을 백업해 주세요. 확인하기 전에는 아무 기록도 바뀌지 않습니다.</p><div class="modal-actions">${btn('export','현재 기록 백업','soft')}${btn('confirm-import','기록 교체','primary')}</div>`);}
async function installLevels(levels){if(isNative())return packsModal();if(downloading)return;if(state.session&&!state.session.finished)return toast('진행 중인 수업을 마친 뒤 단어팩을 설치해 주세요.');downloading=true;packsModal();const status=document.querySelector('#pack-status');try{for(const l of levels){status.textContent=`${l} 전체팩을 내려받고 검증하고 있어요…`;const p=await installPack(l);mergeWords();status.textContent=`${l} ${p.words.length}단어 저장 완료`;}
 toast('요청한 전체 단어팩을 설치했어요.');}catch(e){toast(e.message);if(status)status.textContent=e.message;}finally{downloading=false;render();packsModal();}}
document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-action]');if(!el||el.disabled||!ready)return;const a=el.dataset.action,s=state.session,t=current(s);
 try{
 if(a==='settings')settings();
 else if(a==='close-modal')closeModal();
 else if(a==='furigana'){state.settings.furigana=!state.settings.furigana;await save();render();}
 else if(a==='level'){if(s&&!s.finished)return toast('진행 중인 수업을 먼저 마쳐 주세요.');state.settings.level=el.dataset.level;search='';limit=80;courseLimit=24;await save();render();}
 else if(a==='start-course')await startCourse(el.dataset.id);
 else if(a==='replace-course'){await startCourse(pendingCourse,true);pendingCourse=null;}
 else if(a==='resume'){closeModal();go('lesson');}
 else if(a==='pause'){cancelWork();ink?.destroy();ink=null;if(await save())go('home');}
 else if(a==='home'){go('home');}
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
 else if(a==='ink-done'&&s.ink?.results.every(Boolean)){await submitCurrent({correct:t.phase==='learn'||!s.ink.hadError,method:'stroke-snap',assisted:s.assisted===true},t.phase==='learn');}
 else if(a==='snap-next'&&s.ink&&!s.feedback){s.ink.active=s.ink.results.findIndex(v=>!v);await save();render();}
 else if(a==='character'&&s.ink&&!s.feedback&&!busy){s.ink.active=Number(el.dataset.index);await save();render();}
 else if(a==='undo'&&s.ink&&!s.feedback&&!busy){s.ink.characters[s.ink.active].pop();s.ink.results[s.ink.active]=false;await save();render();}
 else if(a==='clear'&&s.ink&&!s.feedback&&!busy){s.ink.characters[s.ink.active]=[];s.ink.results[s.ink.active]=false;await save();render();}
 else if(a==='replay'){if(state.settings.motion)ink?.replay();else toast('애니메이션이 꺼져 있어요. 설정에서 켤 수 있습니다.');}
 else if(a==='hint'&&!s.feedback){s.assisted=true;await save();render();toast('이번 답은 암기로 인정하지 않고 다시 출제해요.');}
 else if(a==='next'&&!busy){cancelWork();const was=s.finished;if(next(state)){if(await save()){render();scrollTo(0,0);if(!was&&s.finished&&s.completed)celebrate(document.querySelector('#celebration'),state.settings.motion);}}}
 else if(a==='remediate'){if(remediate(state)){await save();render();scrollTo(0,0);}}
 else if(a==='finish'){state.session=null;cancelWork();await save();go('home');}
 else if(a==='next-course'){state.session=null;const c=courses(words,state.settings.level).find(c=>!state.completed[c.id]);await save();if(c)await startCourse(c.id);else{toast('설치된 수업을 모두 마쳤어요. 복습으로 기억을 이어가세요.');go('review');}}
 else if(a==='review-start'||a==='weak-start'){if(s&&!s.finished){toast('진행 중인 수업을 마친 뒤 복습해 주세요.');return;}const nextSession=createReview(state,words,a==='weak-start'?'weak':'due');if(!nextSession){go('review');return;}state.session=nextSession;if(await save())go('lesson');}
 else if(a==='filter'){filter=el.dataset.id;render();}
 else if(a==='word-filter'){wordFilter=el.dataset.id;limit=80;render();}
 else if(a==='word')detail(el.dataset.id);
 else if(a==='star'){const id=el.dataset.id;state.starred=state.starred.includes(id)?state.starred.filter(x=>x!==id):[...state.starred,id];await save();render();}
 else if(a==='more-words'){limit+=80;document.querySelector('#word-results').innerHTML=wordRows();}
 else if(a==='more-courses'){courseLimit+=24;render();}
 else if(a==='packs')packsModal();
 else if(a==='install-level')await installLevels([el.dataset.level]);
 else if(a==='install-all')await installLevels(LEVELS);

 else if(a==='export')await exportBackup();
 else if(a==='import'){if(isNative()){const r=await callNative('importBackup',{},180000);confirmImport(r.json);}else document.querySelector('#backup-file')?.click();}
 else if(a==='confirm-import'&&imported){cancelWork();await tail;const nextState=await replaceBackup(imported.state,imported.packs,savedRevision);epoch++;state=nextState;savedRevision=state.revision;for(const p of imported.packs)packs.set(p.level,p);mergeWords();imported=null;closeModal();go('home');toast('백업을 가져왔어요.');}
 else if(a==='reset')openModal(`${modalHead('기록을 초기화할까요?')}<p>수업, 복습, 필기, 경험치 기록을 지웁니다. 단어팩은 유지됩니다. 삭제 전 백업을 내보내 주세요.</p><div class="modal-actions">${btn('export','먼저 백업','soft')}${btn('confirm-reset','기록 삭제','danger')}</div>`);
 else if(a==='confirm-reset'){cancelWork();await tail;state=await replaceBackup(fresh(),[],savedRevision);savedRevision=state.revision;epoch++;closeModal();go('home');}
 }catch(e){toast(e.message||'작업을 완료하지 못했어요.');}
});
document.addEventListener('input',event=>{if(event.target.id==='search'){search=event.target.value;limit=80;document.querySelector('#word-results').innerHTML=wordRows();}});
document.addEventListener('change',async event=>{
 const k=event.target.dataset.setting;
 if(k&&['furigana','motion','penWidth','rate','goal'].includes(k)){state.settings[k]=['furigana','motion'].includes(k)?event.target.checked:Number(event.target.value);await save();render();}
 if(event.target.id==='backup-file'){const f=event.target.files[0];if(!f)return;try{if(f.size>30e6)throw new Error('백업은 30MB 이하만 가능합니다.');confirmImport(await f.text());}catch(e){toast(e.message);}}
});
document.addEventListener('keydown',event=>{if(!modal.firstChild)return;if(event.key==='Escape'){event.preventDefault();closeModal();}if(event.key==='Tab'){const all=[...modal.querySelectorAll('button:not(:disabled),input:not(.sr-only),select,a[href]')],first=all[0],last=all.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
window.addEventListener('hashchange',()=>{cancelWork();closeModal();if(ready)render();scrollTo(0,0);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelWork();ink?.destroy();ink=null;save();}else if(ready)render();});
window.addEventListener('beforeunload',()=>{cancelWork();});
async function boot(){installBridge();try{await openStore();state=await loadState();savedRevision=state.revision;await initializePacks();await loadStrokeBank();mergeWords();requireStrokes(words.flatMap(writingChars));ready=true;render();}catch(e){storageOK=false;warning=e.message;ready=true;await initializePacks();mergeWords();root.innerHTML=`<main class="fatal"><h1>기존 기록을 먼저 보호할게요.</h1><p>${esc(e.message)}</p><p>손상된 기록을 새 기록으로 덮어쓰지 않았습니다. 원본 백업을 내려받고 개발자에게 전달해 주세요.</p><button id="raw-backup" class="btn primary">원본 기록 백업</button></main>`;document.querySelector('#raw-backup').onclick=async()=>{try{downloadJSON(await rawState(),'kotoba-recovery.json');}catch{toast('저장소 접근이 차단되어 백업도 읽을 수 없습니다. 다른 브라우저에서 확인하세요.');}};}
 if('serviceWorker'in navigator&&!isNative()&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
boot();
window.addEventListener('kotoba-back',()=>{if(modal.firstChild){closeModal();return;}if(route()==='lesson'){document.querySelector('[data-action="pause"]')?.click();return;}if(route()!=='home'){go('home');return;}if(isNative())callNative('requestExit',{},120000).catch(()=>{});});
