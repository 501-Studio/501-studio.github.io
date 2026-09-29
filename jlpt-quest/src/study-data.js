/** Additive 0.4 records: bounded, validated, local-only and included in the existing backup. */
import {dayKey,SKILLS,keyOf} from './course-engine.js';
const idOK=x=>typeof x==='string'&&/^N[1-5]-[a-z0-9]+$/.test(x);
const num=(x,max=9e15)=>Number.isFinite(x)&&x>=0&&x<=max;
const text=(s,n)=>typeof s==='string'?s.slice(0,n):'';
export function freshStudy(){return {version:1,startedAt:Date.now(),folders:[],events:[],strokes:{},exams:[],exam:null,examErrors:[],examWrongIds:[],balance:null,playlist:{ids:[],index:0,includeMeaning:true,includeExample:true,repeat:false}};}
export function study(state){return state.study??=freshStudy();}
export function validateStudy(raw){
 const s=freshStudy();if(!raw)return s;if(raw.version!==1)throw new Error('추가 학습 기록 버전을 확인하세요.');
 s.startedAt=num(raw.startedAt)?raw.startedAt:s.startedAt;
 const folderIds=new Set();
 for(const f of (Array.isArray(raw.folders)?raw.folders:[]).slice(0,100)){
  if(!/^folder-[a-z0-9-]{1,80}$/.test(f?.id)||folderIds.has(f.id)||!text(f.name,40).trim()||!Array.isArray(f.wordIds))throw new Error('단어장 폴더 기록이 올바르지 않습니다.');
  folderIds.add(f.id);s.folders.push({id:f.id,name:text(f.name,40).trim(),wordIds:[...new Set(f.wordIds.filter(idOK))].slice(0,16000)});
 }
 for(const e of (Array.isArray(raw.events)?raw.events:[]).slice(-30000))if(idOK(e?.wordId)&&num(e.at)&&SKILLS.includes(e.skill))s.events.push({at:e.at,wordId:e.wordId,skill:e.skill,correct:e.correct===true,assisted:e.assisted===true,retry:e.retry===true,sessionId:text(e.sessionId,80),relearned:e.relearned===true,mastered:e.mastered===true,latencyMs:num(e.latencyMs,120000)?e.latencyMs:0});
 for(const [char,rows] of Object.entries(raw.strokes||{}).slice(0,5000))if([...char].length===1&&Array.isArray(rows))s.strokes[char]=rows.slice(0,60).map(r=>({attempts:num(r?.attempts,1e8)?r.attempts:0,misses:num(r?.misses,1e8)?Math.min(r.misses,r.attempts||0):0}));
 for(const e of (Array.isArray(raw.exams)?raw.exams:[]).slice(-100))if(typeof e?.id==='string'&&num(e.at)&&num(e.total,100)&&num(e.correct,e.total)&&Array.isArray(e.wordIds))s.exams.push({id:text(e.id,80),at:e.at,total:e.total,correct:e.correct,level:/^N[1-5]$/.test(e.level)?e.level:'N5',wordIds:e.wordIds.filter(idOK).slice(0,100),byType:cleanScores(e.byType)});
 s.examWrongIds=[...new Set((Array.isArray(raw.examWrongIds)?raw.examWrongIds:[]).filter(x=>typeof x==='string'&&/^q040-N[1-5]-[a-z0-9]+$/.test(x)))].slice(0,100);
 s.examErrors=[...new Set((Array.isArray(raw.examErrors)?raw.examErrors:[]).filter(idOK))].slice(0,16000);
 // Exam snapshots are validated again against the trusted question bank before use.
 if(raw.exam){const e=raw.exam;if(!Array.isArray(e.ids)||!e.ids.length||e.ids.length>100||!e.ids.every(x=>typeof x==='string'&&x.length<100)||!num(e.deadline)||!num(e.startedAt)||!Number.isInteger(e.index)||e.index<0||e.index>=e.ids.length||!Array.isArray(e.answers))throw new Error('모의시험 저장 기록이 올바르지 않습니다.');s.exam={id:text(e.id,80),level:/^N[1-5]$/.test(e.level)?e.level:'N5',ids:[...e.ids],deadline:e.deadline,startedAt:e.startedAt,index:e.index,answers:e.ids.map((_,i)=>Number.isInteger(e.answers[i])&&e.answers[i]>=0&&e.answers[i]<=3?e.answers[i]:null),finished:e.finished===true,recorded:e.recorded===true};}
 if(raw.balance&&Array.isArray(raw.balance.moves))s.balance={at:num(raw.balance.at)?raw.balance.at:0,moves:raw.balance.moves.slice(0,30000).filter(m=>idOK(m?.key?.split(':')[0])&&SKILLS.includes(m.key.split(':')[1])&&num(m.before)&&num(m.after)&&m.after<=m.before).map(m=>({key:m.key,before:m.before,after:m.after}))};
 if(raw.playlist){const p=raw.playlist;s.playlist={ids:[...new Set((Array.isArray(p.ids)?p.ids:[]).filter(idOK))].slice(0,200),index:Number.isInteger(p.index)?Math.max(0,Math.min(199,p.index)):0,includeMeaning:p.includeMeaning!==false,includeExample:p.includeExample!==false,repeat:p.repeat===true};}
 return s;
}
function cleanScores(raw){const out={};for(const k of ['reading','meaning','context','synonym','usage']){const r=raw?.[k];out[k]={total:num(r?.total,100)?r.total:0,correct:num(r?.correct,r?.total||0)?r.correct:0};}return out;}
export function recordAnswer(state,t,result,old,now,latencyMs=0){
 const s=study(state),correct=result.correct===true&&!result.assisted;
 const mastered=SKILLS.every(k=>(state.memory[keyOf(t.wordId,k)]?.stage??-1)>=3)&&((old?.stage??-1)<3);
 s.events.push({at:now,wordId:t.wordId,skill:t.skill,correct,assisted:!!result.assisted,retry:t.attempt>0||!!state.session?.id&&(old?.lastSession===state.session.id||s.events.some(e=>e.sessionId===state.session.id&&e.wordId===t.wordId&&e.skill===t.skill)),sessionId:String(state.session?.id||'').slice(0,80),relearned:!correct&&(old?.successes||0)>0,mastered,latencyMs:num(latencyMs,120000)?latencyMs:0});
 if(s.events.length>30000)s.events.splice(0,s.events.length-30000);
}
export function recordStroke(state,char,index,accepted){
 if([...char].length!==1||!Number.isInteger(index)||index<0||index>=60)return;
 const rows=study(state).strokes[char]??=[];while(rows.length<=index)rows.push({attempts:0,misses:0});rows[index].attempts++;if(!accepted)rows[index].misses++;
}
export function weakItems(state,words,category='all'){
 const map=new Map(words.map(w=>[w.id,w]));
 return Object.entries(state.memory).flatMap(([key,r])=>{const [wordId,skill]=key.split(':');const w=map.get(wordId);if(!w||!SKILLS.includes(skill))return [];
  const misses=r.independentFailures??r.lapses??0;if(!misses)return [];
  if(SKILLS.includes(category)&&skill!==category)return [];
  if(category==='repeated'&&misses<3)return [];if(category==='history'&&!(misses>=3&&r.consecutive>=2))return [];
  const recent=(r.recent||[]).slice(-4).filter(x=>x===0).length;
  return [{wordId,skill,record:r,misses,score:recent*4+Math.min(misses,10)*2+(r.consecutive<2?6:0)+(r.due<=Date.now()?3:0),word:w}];
 }).sort((a,b)=>b.score-a.score||a.record.due-b.record.due);
}
export function createFolder(state,name){name=text(name,40).trim();if(!name)throw new Error('폴더 이름을 입력하세요.');const s=study(state);if(s.folders.length>=100)throw new Error('폴더는 최대 100개입니다.');if(s.folders.some(f=>f.name===name))throw new Error('같은 이름의 폴더가 있습니다.');const f={id:'folder-'+crypto.randomUUID(),name,wordIds:[]};s.folders.push(f);return f;}
export function putInFolder(state,id,wordIds,remove=false){const f=study(state).folders.find(f=>f.id===id);if(!f)throw new Error('폴더를 찾을 수 없습니다.');const ids=wordIds.filter(idOK);f.wordIds=remove?f.wordIds.filter(x=>!ids.includes(x)):[...new Set([...f.wordIds,...ids])].slice(0,16000);}
export function monthlyStats(state,words,month=dayKey().slice(0,7)){
 const ids=new Set(words.map(w=>w.id)),s=study(state),events=s.events.filter(e=>ids.has(e.wordId)&&dayKey(e.at).startsWith(month)),ind=events.filter(e=>!e.retry),newIds=words.filter(w=>state.encountered[w.id]&&dayKey(state.encountered[w.id]).startsWith(month)).map(w=>w.id);
 const missed={};for(const e of ind)if(!e.correct)missed[e.wordId]=(missed[e.wordId]||0)+1;
 const worst=Object.entries(missed).sort((a,b)=>b[1]-a[1])[0];
 const wordMap=new Map(words.map(w=>[w.id,w])),groups=new Map();for(const e of ind){const level=wordMap.get(e.wordId)?.level,key=level+':'+e.skill;const g=groups.get(key)||{level,skill:e.skill,total:0,misses:0};g.total++;if(!e.correct)g.misses++;groups.set(key,g);}const weakest=[...groups.values()].filter(g=>g.total>=3&&g.misses>0).sort((a,b)=>b.misses/b.total-a.misses/a.total||b.total-a.total)[0]||null;
 return {weakest,newIds,events,correct:ind.filter(e=>e.correct).length,total:ind.length,mastered:[...new Set(events.filter(e=>e.mastered).map(e=>e.wordId))].length,relapsed:[...new Set(events.filter(e=>e.relearned).map(e=>e.wordId))].length,worst:worst?{id:worst[0],count:worst[1]}:null,since:s.startedAt,partial:s.events.length>=30000};
}
/** Suggest earlier slots only. Never postpone an overdue or future memory deadline. */
export function spreadPlan(state,cap=60,now=Date.now()){
 cap=Number.isFinite(cap)?Math.max(10,Math.min(300,Math.round(cap))):60;const load={},moves=[];
 const rows=Object.entries(state.memory).filter(([,r])=>r.due>now).sort((a,b)=>a[1].due-b[1].due);
 for(const [,r] of rows)load[dayKey(r.due)]=(load[dayKey(r.due)]||0)+1;
 for(const [key,r] of rows){const d=dayKey(r.due);if(load[d]<=cap)continue;const maxShift=Math.min(2*86400000,Math.floor((r.due-now)*.2));
  for(let shift=86400000;shift<=maxShift;shift+=86400000){const to=r.due-shift,day=dayKey(to);if(to>now&&(load[day]||0)<cap){load[d]--;load[day]=(load[day]||0)+1;moves.push({key,before:r.due,after:to});break;}}
 }
 return {at:now,moves,unresolvedDays:Object.values(load).filter(n=>n>cap).length};
}
export function applySpread(state,plan){const moves=plan.moves.filter(m=>state.memory[m.key]?.due===m.before&&m.after>Date.now()&&m.after<=m.before);for(const m of moves)state.memory[m.key].due=m.after;study(state).balance={at:Date.now(),moves};return moves.length;}
export function undoSpread(state){let n=0;for(const m of study(state).balance?.moves||[])if(state.memory[m.key]?.due===m.after){state.memory[m.key].due=m.before;n++;}study(state).balance=null;return n;}
