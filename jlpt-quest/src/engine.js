import {WORDS, WORD_MAP, UNITS, STEPS, SKILLS} from './content.js';
export const STORAGE_KEY = 'kotoba-quest:v1';
export const MINUTE = 60000;
export const DAY = 86400000;
export const INTERVALS = [10*MINUTE, DAY, 3*DAY, 7*DAY, 14*DAY, 30*DAY];
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function dayKey(time=Date.now()) { const d=new Date(time); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function defaults() { return {version:1, revision:0, settings:{level:'N4',goal:10,furigana:true,rate:0.9}, units:{}, memory:{}, seen:[], starred:[], daily:{}, xp:0, session:null}; }
export function normalizeJapanese(value) {
  return String(value).normalize('NFKC').trim().replace(/\s+/gu,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
}
export function isCorrect(word, answer) { const a=normalizeJapanese(answer); return !!a && [word.word,word.reading,...word.accepted].some(x=>normalizeJapanese(x)===a); }
export function shuffle(items, random=Math.random) { const copy=[...items]; for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1)); [copy[i],copy[j]]=[copy[j],copy[i]];} return copy; }
export function recordKey(wordId,skill) { return `${wordId}:${skill}`; }
export function freshRecord() { return {stage:-1,due:0,lapses:0,successes:0,consecutive:0,lastAt:0,lastSession:''}; }
export function schedule(old, correct, sessionId, now=Date.now(), assisted=false) {
  const r={...freshRecord(),...old};
  if(!correct || assisted) return {...r, stage:0,due:now+INTERVALS[0],lapses:r.lapses+1,consecutive:0,lastAt:now,lastSession:sessionId};
  // Same-session rescue and early voluntary practice must NOT postpone a scheduled review.
  if(r.lastSession===sessionId || (r.lastAt>0 && r.due>now)) return {...r,successes:r.successes+1};
  const stage=Math.min(r.stage+1,INTERVALS.length-1);
  return {...r,stage,due:now+INTERVALS[stage],successes:r.successes+1,consecutive:r.consecutive+1,lastAt:now,lastSession:sessionId};
}
export function isWeak(r) { return !!r && r.lapses>0 && r.consecutive<2; }
export function reviews(state, filter='due', now=Date.now()) {
  return Object.entries(state.memory).flatMap(([key,r])=>{
    const [wordId,skill]=key.split(':'); const w=WORD_MAP[wordId];
    if(!w || w.level!==state.settings.level || !SKILLS[skill])return [];
    const include=filter==='due'? r.due<=now : filter==='weak'?isWeak(r):true;
    return include?[{wordId,skill,...r}]:[];
  }).sort((a,b)=>(a.due-b.due)||(b.lapses-a.lapses));
}
export function unitProgress(state,id) { return state.units[id]||{completed:[],laps:0}; }
export function unitUnlocked(state,id) { const units=UNITS.filter(u=>u.level===UNITS.find(x=>x.id===id)?.level); const i=units.findIndex(u=>u.id===id); return i===0 || unitProgress(state,units[i-1]?.id).laps>0; }
export function nextStep(state,id) {const p=unitProgress(state,id); return STEPS.find(s=>!p.completed.includes(s.id))||STEPS[0];}
export function choicesFor(word) { return shuffle([word.meaning,...shuffle(WORDS.filter(w=>w.level===word.level && w.meaning!==word.meaning)).slice(0,3).map(w=>w.meaning)]); }
function task(wordId,skill,retry=false) {return {id:uid(),wordId,skill,retry,options:['meaning','listening'].includes(skill)?choicesFor(WORD_MAP[wordId]):[]};}
export function createSession(state,config) {
  let queue=[];
  if(config.review) queue=reviews(state,config.review).slice(0,24).map(r=>task(r.wordId,r.skill));
  else {
    const words=shuffle(WORDS.filter(w=>w.level===state.settings.level && (!config.unit || w.unit===config.unit) && (!config.starred || state.starred.includes(w.id)))).slice(0,8);
    if(config.skill==='boss') queue=words.flatMap((w,i)=>[task(w.id,['meaning','writing','listening'][i%3]),...(i<4?[task(w.id,['writing','listening','meaning'][i%3])]:[])]);
    else queue=words.map(w=>task(w.id,config.skill));
  }
  if(!queue.length) return null;
  return {id:uid(),config,queue,index:0,total:queue.length,initialCorrect:0,firstAnswered:0,skipped:0,rescues:0,combo:0,bestCombo:0,earned:0,failed:[],feedback:null,revealed:false,assisted:false,finished:false,passed:false,createdAt:Date.now()};
}
export function currentTask(s) {return s?.queue[s.index];}
export function award(state,wordId,skill,correct,now,assisted) {
  const key=dayKey(now); const d=state.daily[key]||{count:0,xp:0,keys:[],words:[]}; const token=recordKey(wordId,skill);
  if(d.keys.includes(token))return 0;
  const xp=skill==='read'?3:correct&&!assisted?10:2;
  d.count++;d.xp+=xp;d.keys.push(token); if(!d.words.includes(wordId))d.words.push(wordId);
  state.daily[key]=d;state.xp+=xp; return xp;
}
// One answer, scheduling change and session snapshot are persisted together by the caller.
export function answerTask(state,correct,{now=Date.now(),assisted=false}={}) {
  const s=state.session; if(!s || s.finished || s.feedback)return null;
  const t=currentTask(s); const key=recordKey(t.wordId,t.skill);
  const effective=correct&&!assisted;
  if(t.skill==='read') { if(!state.seen.includes(t.wordId))state.seen.push(t.wordId); }
  state.memory[key]=schedule(state.memory[key],correct,s.id,now,assisted);
  const gained=award(state,t.wordId,t.skill,correct,now,assisted);
  s.earned+=gained;
  if(!t.retry) {s.firstAnswered++;if(effective)s.initialCorrect++;}
  if(effective) {s.combo++;s.bestCombo=Math.max(s.combo,s.bestCombo);if(t.retry)s.rescues++;}
  else {
    s.combo=0; if(!s.failed.includes(key))s.failed.push(key);
    // At most two spaced rescue attempts per word/skill; never an infinite queue.
    const attempts=s.queue.filter(q=>q.wordId===t.wordId&&q.skill===t.skill&&q.retry).length;
    if(attempts<2) s.queue.splice(Math.min(s.index+4,s.queue.length),0,task(t.wordId,t.skill,true));
  }
  s.feedback={correct,assisted,gained};return s.feedback;
}
export function skipTask(state) { const s=state.session; if(!s||s.feedback||s.finished)return;const t=currentTask(s);if(!t.retry)s.skipped++;s.feedback={skipped:true,gained:0}; }
export function advance(state) {
  const s=state.session; if(!s||!s.feedback||s.finished)return;
  s.index++;s.feedback=null;s.revealed=false;s.assisted=false;
  if(s.index<s.queue.length)return;
  s.finished=true;
  const accuracy=s.total ? s.initialCorrect/s.total:0;
  s.passed=s.skipped===0 && (s.config.skill!=='boss' || accuracy>=0.7);
  if(s.config.lesson && s.passed) {
    const p=structuredClone(unitProgress(state,s.config.unit));
    if(!p.completed.includes(s.config.skill))p.completed.push(s.config.skill);
    if(s.config.skill==='boss' && STEPS.every(step=>p.completed.includes(step.id))){p.laps++;p.completed=[];}
    state.units[s.config.unit]=p;
  }
}
export function streak(state,now=Date.now()) {
  let d=new Date(now);d.setHours(12,0,0,0);let count=0;
  if(!state.daily[dayKey(d)]?.count)d.setDate(d.getDate()-1);
  while(state.daily[dayKey(d)]?.count){count++;d.setDate(d.getDate()-1);}return count;
}
export function dueLabel(due,now=Date.now()) {
  const delta=due-now; if(delta<=0)return '지금 복습'; if(delta<60*MINUTE)return `${Math.ceil(delta/MINUTE)}분 뒤`;
  if(delta<DAY)return `${Math.ceil(delta/(60*MINUTE))}시간 뒤`;return `${Math.ceil(delta/DAY)}일 뒤`;
}
export function masteredCount(state) { return WORDS.filter(w=>w.level===state.settings.level && ['meaning','writing','listening'].every(k=>(state.memory[recordKey(w.id,k)]?.stage??-1)>=3)).length; }
// Imported files are untrusted. Only rebuild known fields; never merge arbitrary keys or executable content.
export function validateState(value) {
  if(!value || typeof value!=='object' || value.version!==1 || !value.settings || !value.memory || !value.daily)throw new Error('지원하지 않는 백업 형식입니다.');
  const s=defaults();const int=(v,max=1e12)=>Number.isInteger(v)&&v>=0&&v<=max;
  if(!['N4','N5'].includes(value.settings.level)||![10,20,30].includes(value.settings.goal)||!int(value.xp))throw new Error('학습 데이터가 올바르지 않습니다.');
  s.settings={level:value.settings.level,goal:value.settings.goal,furigana:value.settings.furigana!==false,rate:[0.7,0.9,1].includes(value.settings.rate)?value.settings.rate:0.9};
  s.xp=value.xp;s.revision=int(value.revision)?value.revision:0;
  for(const [key,r] of Object.entries(value.memory)) {
    const [id,skill]=key.split(':');if(!WORD_MAP[id]||!SKILLS[skill])continue;
    if(!r||!Number.isInteger(r.stage)||r.stage<0||r.stage>5||!int(r.due,9e15)||!int(r.lastAt,9e15)||!['lapses','successes','consecutive'].every(k=>int(r[k])))throw new Error('복습 일정이 손상되었습니다.');
    s.memory[key]={stage:r.stage,due:r.due,lapses:r.lapses,successes:r.successes,consecutive:r.consecutive,lastAt:r.lastAt,lastSession:String(r.lastSession||'').slice(0,100)};
  }
  for(const name of ['seen','starred']) s[name]=Array.isArray(value[name])?[...new Set(value[name].filter(id=>!!WORD_MAP[id]))]:[];
  for(const u of UNITS) {const p=value.units?.[u.id]; if(p && int(p.laps,1e6)&&Array.isArray(p.completed))s.units[u.id]={laps:p.laps,completed:[...new Set(p.completed.filter(x=>STEPS.some(y=>y.id===x)))]};}
  for(const [date,d] of Object.entries(value.daily).slice(-5000)) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!d||!int(d.count)||!int(d.xp)||!Array.isArray(d.keys)||!Array.isArray(d.words))continue;
    s.daily[date]={count:d.count,xp:d.xp,keys:d.keys.filter(k=>typeof k==='string'&&k.length<50).slice(0,500),words:d.words.filter(id=>!!WORD_MAP[id])};
  }
  const q=value.session;
  if(q && typeof q==='object' && typeof q.id==='string' && Array.isArray(q.queue) && q.queue.length>0 && q.queue.length<=400 && int(q.index,400) && (q.index<q.queue.length || (q.index===q.queue.length&&q.finished===true)) && q.queue.every(t=>t&&WORD_MAP[t.wordId]&&[...Object.keys(SKILLS),'read'].includes(t.skill)&&typeof t.id==='string'&&Array.isArray(t.options)&&t.options.every(x=>typeof x==='string'&&x.length<100)) && q.config && typeof q.config==='object' && (!q.config.unit||UNITS.some(u=>u.id===q.config.unit)) && (!q.config.skill||[...Object.keys(SKILLS),'boss'].includes(q.config.skill)) && (!q.config.review||['due','weak','all'].includes(q.config.review)) && [q.total,q.initialCorrect,q.firstAnswered,q.skipped,q.rescues,q.combo,q.bestCombo,q.earned].every(n=>int(n,1e8)) && Array.isArray(q.failed) && q.failed.every(x=>typeof x==='string') && (!q.feedback||typeof q.feedback==='object')) {
    s.session=structuredClone(q);
    s.session.draft=typeof q.draft==='string'?q.draft.slice(0,200):'';
    s.session.selected=typeof q.selected==='string'?q.selected.slice(0,100):null;
    s.session.strokes=Array.isArray(q.strokes)?q.strokes.slice(0,300).filter(line=>Array.isArray(line)&&line.every(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))).map(line=>line.slice(0,2000)):[];
  }
  return s;
}
