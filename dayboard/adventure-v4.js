import {esc} from './core.js';
import {activity,day,monday,plusDay,quests,achievements,ZONES,economy} from './journey-domain.js';
import {ji,meter} from './journey-view.js';

const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const levelFrom=(value,step)=>Math.max(1,Math.min(5,1+Math.floor(Math.max(0,value)/step)));
const pctFrom=(value,step)=>clamp(Math.round((Math.max(0,value)%step)/step*100));

export function adventureProfile(state,e=economy(state)){
  const all=activity(state),today=day(),start=plusDay(today,-29),recent=all.filter(a=>a.day>=start&&a.day<=today),week=monday(today),weekly=all.filter(a=>a.day>=week&&a.day<plusDay(week,7)),daily=all.filter(a=>a.day===today);
  const activeDays=new Set(recent.map(a=>a.day)).size,focusEvents=recent.filter(a=>Number(a.minutes)>=45).length,categories=new Set(recent.map(a=>a.category)).size,reflections=Object.entries(state.settings.reflections||{}).filter(([d,v])=>d>=start&&d<=today&&String((v.win||'')+(v.next||'')+(v.friction||'')).trim()).length;
  const explorePoints=e.game.visits.length*2+e.projects*2+Math.floor(e.completed/20),balancePoints=categories+Math.min(5,reflections);
  const stats=[
    {id:'focus',name:'집중력',icon:'book',level:levelFrom(focusEvents,4),progress:pctFrom(focusEvents,4),detail:`45분+ 실행 ${focusEvents}회`},
    {id:'steady',name:'꾸준함',icon:'leaf',level:levelFrom(activeDays,5),progress:pctFrom(activeDays,5),detail:`최근 30일 ${activeDays}일 실행`},
    {id:'explore',name:'도전성',icon:'spark',level:levelFrom(explorePoints,4),progress:pctFrom(explorePoints,4),detail:`탐험 포인트 ${explorePoints}`},
    {id:'balance',name:'균형감',icon:'heart',level:levelFrom(balancePoints,3),progress:pctFrom(balancePoints,3),detail:`분야 ${categories} · 회고 ${reflections}`}
  ];
  const rank=e.level>=15?'내일의 설계자':e.level>=10?'별길 원정대장':e.level>=6?'지도의 길잡이':e.level>=3?'숲길 탐험가':'새싹 여행자';
  const nextZone=ZONES.find(z=>z.xp>e.xp)||null,prevZone=[...ZONES].reverse().find(z=>z.xp<=e.xp)||ZONES[0],zoneProgress=nextZone?clamp(Math.round((e.xp-prevZone.xp)/(nextZone.xp-prevZone.xp)*100)):100;
  return {today,start,week,recent,weekly,daily,activeDays,focusEvents,categories,reflections,stats,rank,nextZone,prevZone,zoneProgress};
}

export function statDeck(state,e=economy(state)){
  const p=adventureProfile(state,e);
  return `<section class="j-v4-stats" aria-label="모험 능력치">${p.stats.map(s=>`<article class="j-v4-stat stat-${s.id}"><span class="j-v4-stat-icon">${ji(s.icon)}</span><div class="grow"><div class="j-v4-stat-title"><strong>${s.name}</strong><span>Lv. ${s.level}</span></div><div class="j-v4-mini-meter"><i style="width:${s.progress}%"></i></div><small>${s.detail}</small></div></article>`).join('')}</section>`;
}

export function questPreview(state,e=economy(state)){
  const list=quests(state),claimed=new Set(e.game.claims.map(c=>c.id)),doneToday=activity(state).filter(a=>a.day===day()).length;
  const speech=doneToday>=5?'오늘은 충분히 멀리 왔어. 남은 일은 천천히 정리하자.':doneToday>=3?'좋아. 오늘의 지도에 길이 선명하게 생겼어.':doneToday>0?'첫 발자국이 찍혔어. 다음 한 걸음만 이어가자.':'아직 빈 지도야. 작은 일 하나부터 시작해보자.';
  return `<aside class="panel j-v4-quest-preview"><div class="j-v4-quest-head"><div><span class="j-section-kicker">TODAY QUEST</span><h2>오늘의 퀘스트</h2></div><span class="j-v4-quest-count">${list.filter(q=>claimed.has(q.id)).length}/${list.length}</span></div><p class="j-v4-speech">“${speech}”</p><div class="j-v4-quest-lines">${list.slice(0,4).map(q=>{const isClaimed=claimed.has(q.id),ready=!isClaimed&&q.count>=q.target;return `<article><span class="j-v4-quest-icon">${ji(q.scope==='오늘'?'sun':q.id.startsWith('reflect')?'book':'flag')}</span><div class="grow"><div class="j-v4-quest-name"><strong>${q.name}</strong><small>${Math.min(q.count,q.target)}/${q.target}</small></div>${meter(q.count,q.target)}<p>${q.description}</p></div><button type="button" class="button ${ready?'primary':'ghost'}" data-action="v3-claim" data-id="${q.id}" ${isClaimed||!ready?'disabled':''}>${isClaimed?'수령':'+'+q.reward}</button></article>`;}).join('')}</div><p class="j-v4-quest-hint">아래의 ‘퀘스트’ 탭에서 전체 진행 상황을 확인할 수 있습니다.</p></aside>`;
}

export function eventBoard(state,e=economy(state)){
  const p=adventureProfile(state,e),weeklyMinutes=p.weekly.reduce((n,a)=>n+Number(a.minutes||0),0),categoryCount=new Set(p.weekly.map(a=>a.category)).size;
  const events=[
    {id:'tower',title:'집중의 탑',subtitle:'이번 주 완료 업무의 예상시간 240분',current:weeklyMinutes,target:240,unit:'분',icon:'shield',tone:'blue',story:'긴 호흡의 실행이 탑의 불빛을 켭니다.'},
    {id:'garden',title:'균형의 정원',subtitle:'서로 다른 3개 분야에서 실행하기',current:categoryCount,target:3,unit:'분야',icon:'leaf',tone:'green',story:'다른 종류의 일을 섞어 정원의 색을 채웁니다.'}
  ];
  return `<section class="panel j-v4-events"><div class="panel-head"><div><h2>이번 주 이벤트</h2><p class="meta">랜덤 보상 없이, 실제 실행 기록으로만 진행됩니다.</p></div>${ji('spark')}</div><div class="j-v4-event-grid">${events.map(ev=>{const done=ev.current>=ev.target;return `<article class="event-${ev.tone} ${done?'complete':''}"><div class="j-v4-event-icon">${ji(done?'check':ev.icon)}</div><div class="grow"><div class="j-v4-event-title"><strong>${ev.title}</strong><span>${done?'완료':'진행 중'}</span></div><p>${ev.subtitle}</p>${meter(Math.min(ev.current,ev.target),ev.target)}<small>${Math.min(ev.current,ev.target)}/${ev.target} ${ev.unit} · ${ev.story}</small></div></article>`;}).join('')}</div></section>`;
}

export function milestonePanel(state,e=economy(state)){
  const p=adventureProfile(state,e),locked=achievements(state).filter(a=>!a.unlocked),nextAchievement=locked[0];
  return `<section class="panel j-v4-milestones"><div class="panel-head"><div><h2>다음 이정표</h2><p class="meta">레벨보다 중요한 건 다음 한 걸음입니다.</p></div>${ji('compass')}</div><div class="j-v4-milestone-grid"><article><span>${ji('compass')}</span><div class="grow"><small>다음 지역</small><strong>${p.nextZone?esc(p.nextZone.name):'모든 지역 개방'}</strong>${meter(p.zoneProgress,100)}<p>${p.nextZone?`${Math.max(0,p.nextZone.xp-e.xp)} XP 남음`:'새로운 일정이 다음 지도를 만듭니다.'}</p></div></article><article><span>${ji(nextAchievement?.icon||'crown')}</span><div class="grow"><small>다음 업적</small><strong>${nextAchievement?esc(nextAchievement.name):'모든 업적 달성'}</strong><p>${nextAchievement?esc(nextAchievement.description):'지금의 기록을 그대로 이어가세요.'}</p></div></article></div></section>`;
}

export function adventureLog(state,e=economy(state)){
  const recent=activity(state).slice(-6).reverse();
  return `<section class="panel j-v4-log"><div class="panel-head"><div><h2>최근 모험 기록</h2><p class="meta">완료한 일이 그대로 여행 일지가 됩니다.</p></div>${ji('book')}</div><div class="j-v4-log-list">${recent.map(a=>`<article><span class="j-v4-log-dot" data-color="${esc(a.color||'indigo')}"></span><div class="grow"><strong>${esc(a.title)}</strong><small>${a.day.slice(5).replace('-','.')} · ${esc(a.category||'일반')}</small></div><span>+${a.xp} XP</span></article>`).join('')||'<p class="j-empty-small">첫 완료가 모험 일지의 첫 줄이 됩니다.</p>'}</div></section>`;
}

export function adventureHeaderMeta(state,e=economy(state)){
  const p=adventureProfile(state,e);
  return `<div class="j-v4-rank"><span>${ji('crown')}</span><div><small>모험 등급</small><strong>${p.rank}</strong></div></div>`;
}
