import {LEVELS,writingChars,hash} from './catalog.js';
export const SCHEMA=3,MINUTE=60000,DAY=86400000;
export const INTERVALS=[10*MINUTE,DAY,3*DAY,7*DAY,14*DAY,30*DAY];
export const SKILLS=['meaning','listening','writing'];
export const keyOf=(id,skill)=>`${id}:${skill}`;
export const nowId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const dayKey=(time=Date.now())=>{const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export function fresh(){return {version:SCHEMA,revision:0,settings:{level:'N5',furigana:true,motion:true,haptics:true,penWidth:4,rate:.85,goal:10},memory:{},encountered:{},learned:{},completed:{},starred:[],daily:{},xp:0,session:null,legacy:null};}
export function schedule(old,correct,sessionId,now=Date.now(),method='auto'){
 const r={stage:-1,due:0,lapses:0,successes:0,lastSession:'',consecutive:0,...old};
 if(!correct)return {...r,stage:0,due:now+INTERVALS[0],lapses:r.lapses+1,consecutive:0,lastAt:now,lastSession:sessionId,method};
 if(r.lastSession===sessionId||(r.stage>=0&&r.due>now))return {...r,successes:r.successes+1,method};
 const stage=Math.min(5,r.stage+1);return {...r,stage,due:now+INTERVALS[stage],successes:r.successes+1,consecutive:r.consecutive+1,lastAt:now,lastSession:sessionId,method};
}
export function shuffle(list,rng=Math.random){const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
export function optionsFor(word,words,skill){const field=skill==='listening'?'word':'meaning',other=[...new Set(words.filter(w=>w.level===word.level&&w.language===word.language&&w[field]!==word[field]).map(w=>w[field]))];return shuffle([word[field],...shuffle(other).slice(0,3)]);}
const task=(word,phase,skill,words)=>({id:nowId(),wordId:word.id,phase,skill,attempt:0,options:['meaning','listening'].includes(skill)&&phase==='quiz'?optionsFor(word,words,skill):[]});
export function createClass(state,course,words){
 const map=new Map(words.map(w=>[w.id,w]));const selected=course.wordIds.map(id=>map.get(id));if(!selected.length||selected.some(w=>!w||!writingChars(w).length))throw new Error('이 수업의 단어 또는 쓰기 표기를 확인해야 합니다.');
 const training=selected.filter(w=>!state.learned[w.id]).flatMap(w=>[task(w,'learn','study',words),task(w,'learn','audio',words),task(w,'learn','trace',words)]);
 const quiz=SKILLS.flatMap(skill=>shuffle(selected).map(w=>task(w,'quiz',skill,words)));
 return {id:nowId(),kind:'class',course:{...course},wordIds:[...course.wordIds],queue:[...training,...quiz],index:0,originalQuiz:quiz.length,firstCorrect:0,firstAnswered:0,passed:{},feedback:null,finished:false,completed:false,ink:null,heard:false,selection:null,startedAt:Date.now(),earned:0,attempts:0,firstMisses:[],wordSnapshots:selected};
}
export function createReview(state,words,filter='due',now=Date.now()){
 const map=new Map(words.map(w=>[w.id,w]));const due=dueItems(state,words,now,filter).slice(0,15);if(!due.length)return null;
 const queue=due.map(r=>task(map.get(r.wordId),'quiz',r.skill,words));const wordIds=[...new Set(due.map(x=>x.wordId))];
 return {id:nowId(),kind:'review',wordIds,queue,index:0,originalQuiz:queue.length,firstCorrect:0,firstAnswered:0,passed:{},feedback:null,finished:false,completed:false,ink:null,heard:false,selection:null,startedAt:now,earned:0,attempts:0,firstMisses:[],wordSnapshots:wordIds.map(id=>map.get(id))};
}
export const current=s=>s?.queue?.[s.index]||null;
export function dueItems(state,words,now=Date.now(),filter='due'){
 const ids=new Set(words.filter(w=>w.level===state.settings.level).map(w=>w.id));return Object.entries(state.memory).flatMap(([key,r])=>{const [wordId,skill]=key.split(':');if(!ids.has(wordId)||!SKILLS.includes(skill))return [];if(filter==='due'&&r.due>now)return [];if(filter==='weak'&&!(r.lapses>0&&r.consecutive<2))return [];return [{...r,wordId,skill}];}).sort((a,b)=>a.due-b.due);
}
function award(state,t,correct,now){const day=dayKey(now),d=state.daily[day]||{keys:[],words:[],xp:0};const k=keyOf(t.wordId,t.skill);if(d.keys.includes(k))return 0;const n=t.phase==='quiz'?(correct?10:2):0;if(!n)return 0;d.keys.push(k);if(!d.words.includes(t.wordId))d.words.push(t.wordId);d.xp+=n;state.daily[day]=d;state.xp+=n;return n;}
export function submit(state,taskId,result,now=Date.now()){
 const s=state.session,t=current(s);if(!s||s.finished||s.feedback||t?.id!==taskId)return false;
 // No "I was right" route: quiz writing requires a recognizer verdict; audio needs completed playback.
 if(!result||result.status==='unavailable'||result.status==='ambiguous')return false;
 if((t.skill==='audio'||t.skill==='listening')&&!s.heard)return false;
 if(['trace','writing'].includes(t.skill)&&!['shape-template','mlkit'].includes(result.method))return false;
 if(t.skill==='trace'&&!result.correct)return false;
 if(t.phase==='learn'){
  state.encountered[t.wordId]=state.encountered[t.wordId]||now;
  s.feedback={correct:true,training:true,method:result.method||'study',gained:0};return true;
 }
 const correct=result.correct===true&&!result.assisted;
 const key=keyOf(t.wordId,t.skill);state.encountered[t.wordId]=state.encountered[t.wordId]||now;
 state.memory[key]=schedule(state.memory[key],correct,s.id,now,result.method||'choice');
 s.attempts++;if(t.attempt===0){s.firstAnswered++;if(correct)s.firstCorrect++;else if(!s.firstMisses.includes(key))s.firstMisses.push(key);}
 s.passed[key]=correct;
 const gained=award(state,t,correct,now);s.earned+=gained;
 if(!correct&&t.attempt<2){const retry={...t,id:nowId(),attempt:t.attempt+1};s.queue.splice(Math.min(s.index+4,s.queue.length),0,retry);}
 s.feedback={correct,method:result.method||'choice',recognized:result.recognized||'',gained,reason:result.reason||'',assisted:!!result.assisted};return true;
}
export function unresolved(s){const required=s.kind==='class'?s.wordIds.flatMap(id=>SKILLS.map(skill=>keyOf(id,skill))):[...new Set(s.queue.filter(t=>t.phase==='quiz').map(t=>keyOf(t.wordId,t.skill)))];return required.filter(key=>s.passed[key]!==true);}
export function next(state,now=Date.now()){
 const s=state.session;if(!s||!s.feedback||s.finished)return false;s.index++;s.feedback=null;s.ink=null;s.heard=false;s.selection=null;s.assisted=false;
 if(s.index<s.queue.length)return true;s.finished=true;s.completed=unresolved(s).length===0;
 if(s.completed&&s.kind==='class'){
  const previous=state.completed[s.course.id];state.completed[s.course.id]={at:now,wordIds:[...s.wordIds],attempts:s.attempts,firstCorrect:s.firstCorrect};
  for(const id of s.wordIds)state.learned[id]=state.learned[id]||now;
  if(!previous){state.xp+=25;s.earned+=25;}
 }
 return true;
}
export function remediate(state){const old=state.session;if(!old?.finished)return false;const missing=unresolved(old);if(!missing.length)return false;
 const queue=missing.map(key=>{const [id,skill]=key.split(':');const t=old.queue.find(t=>t.wordId===id&&t.skill===skill&&t.phase==='quiz');return {...t,id:nowId(),attempt:0};});
 state.session={...old,id:nowId(),queue,index:0,feedback:null,finished:false,completed:false,ink:null,heard:false,selection:null,assisted:false,earned:0,firstCorrect:0,firstAnswered:0,originalQuiz:queue.length,attempts:0,firstMisses:[],startedAt:Date.now()};return true;
}
export function levelStats(state,words,level,now=Date.now()){
 const list=words.filter(w=>w.level===level);const encountered=list.filter(w=>state.encountered[w.id]).length,learned=list.filter(w=>state.learned[w.id]).length;
 const due=list.filter(w=>SKILLS.some(k=>state.memory[keyOf(w.id,k)]?.due<=now)).length;
 const mastered=list.filter(w=>SKILLS.every(k=>(state.memory[keyOf(w.id,k)]?.stage??-1)>=3)).length;
 return {total:list.length,encountered,learned,due,mastered,unseen:list.length-encountered};
}
export function dueLabel(due,now=Date.now()){const d=due-now;return d<=0?'지금 복습':d<3600000?`${Math.ceil(d/MINUTE)}분 뒤`:d<DAY?`${Math.ceil(d/3600000)}시간 뒤`:`${Math.ceil(d/DAY)}일 뒤`;}
export function streak(state,now=Date.now()){const d=new Date(now);d.setHours(12,0,0,0);if(!state.daily[dayKey(d)]?.keys.length)d.setDate(d.getDate()-1);let n=0;while(state.daily[dayKey(d)]?.keys.length){n++;d.setDate(d.getDate()-1);}return n;}
const ID=/^N[1-5]-[a-z0-9]+$/;
export function validateState(input){
 if(!input||input.version!==SCHEMA||!LEVELS.includes(input.settings?.level))throw new Error('지원하지 않는 학습 기록 형식입니다.');
 const s=fresh(),n=(v,max=9e15)=>Number.isFinite(v)&&v>=0&&v<=max;
 s.revision=Number.isSafeInteger(input.revision)&&input.revision>=0?input.revision:0;s.xp=n(input.xp)?input.xp:0;
 s.settings={...s.settings,level:input.settings.level,furigana:input.settings.furigana!==false,motion:input.settings.motion!==false,haptics:input.settings.haptics!==false,goal:[5,10,20,30].includes(input.settings.goal)?input.settings.goal:10,rate:[.7,.85,1].includes(input.settings.rate)?input.settings.rate:.85,penWidth:[3,4,6].includes(input.settings.penWidth)?input.settings.penWidth:4};
 for(const field of ['encountered','learned'])for(const [id,time]of Object.entries(input[field]||{})){if(ID.test(id)&&n(time))s[field][id]=time;}
 for(const [key,r]of Object.entries(input.memory||{})){const [id,skill]=key.split(':');if(!ID.test(id)||!SKILLS.includes(skill))continue;
  if(!r||!Number.isInteger(r.stage)||r.stage<0||r.stage>5||!n(r.due)||!n(r.lapses)||!n(r.successes)||!n(r.consecutive))throw new Error('복습 기록이 손상되었습니다.');
  s.memory[key]={stage:r.stage,due:r.due,lapses:r.lapses,successes:r.successes,consecutive:r.consecutive,lastAt:n(r.lastAt)?r.lastAt:0,lastSession:String(r.lastSession||'').slice(0,80),method:['mlkit','shape-template','choice'].includes(r.method)?r.method:'choice'};
 }
 s.starred=[...new Set((input.starred||[]).filter(id=>typeof id==='string'&&ID.test(id)))];
 for(const [id,c]of Object.entries(input.completed||{}))if(/^N[1-5]-lesson-[a-z0-9]+$/.test(id)&&n(c?.at)&&Array.isArray(c.wordIds)&&c.wordIds.every(id=>ID.test(id)))s.completed[id]={at:c.at,wordIds:c.wordIds,attempts:n(c.attempts)?c.attempts:0,firstCorrect:n(c.firstCorrect)?c.firstCorrect:0};
 for(const [d,r]of Object.entries(input.daily||{}))if(/^\d{4}-\d{2}-\d{2}$/.test(d)&&Array.isArray(r?.keys)&&Array.isArray(r.words)&&n(r.xp))s.daily[d]={keys:[...new Set(r.keys.filter(k=>typeof k==='string'&&k.length<60))].slice(0,50000),words:r.words.filter(id=>ID.test(id)),xp:r.xp};
 if(input.session){s.session=validateSession(input.session);}
 s.legacy=input.legacy?{version:Number(input.legacy.version)||1,xp:n(input.legacy.xp)?input.legacy.xp:0,note:'이전 자가평가 기록은 자동 채점 숙련도에 합산하지 않음'}:null;
 return s;
}
function validateSession(q){
 const phase=['learn','quiz'],skills=['study','audio','trace',...SKILLS];
 if(!q||!['class','review'].includes(q.kind)||typeof q.id!=='string'||!Array.isArray(q.wordIds)||q.wordIds.length>20||!q.wordIds.every(id=>ID.test(id))||!Array.isArray(q.queue)||!q.queue.length||q.queue.length>200||!Number.isInteger(q.index)||q.index<0||q.index>q.queue.length||(!q.finished&&q.index===q.queue.length))throw new Error('진행 중인 수업 데이터가 손상되었습니다.');
 if(q.kind==='class'&&(!q.course||!/^N[1-5]-lesson-[a-z0-9]+$/.test(q.course.id)||!LEVELS.includes(q.course.level)))throw new Error('수업 정보가 손상되었습니다.');
 if(q.queue.some(t=>!t||typeof t.id!=='string'||!q.wordIds.includes(t.wordId)||!phase.includes(t.phase)||!skills.includes(t.skill)||(t.phase==='quiz'&&!SKILLS.includes(t.skill))||(t.phase==='learn'&&SKILLS.includes(t.skill))||!Array.isArray(t.options)||t.options.some(x=>typeof x!=='string'||x.length>4000)||!Number.isInteger(t.attempt)||t.attempt<0||t.attempt>2))throw new Error('수업 문항이 손상되었습니다.');
 const s={id:q.id.slice(0,80),kind:q.kind,course:q.course?{id:String(q.course.id).slice(0,100),level:q.course.level,title:String(q.course.title).slice(0,100),index:q.course.index,wordIds:[...q.wordIds]}:null,wordIds:[...q.wordIds],queue:q.queue.map(t=>({id:t.id.slice(0,80),wordId:t.wordId,phase:t.phase,skill:t.skill,attempt:t.attempt,options:t.options})),index:q.index,passed:{},feedback:null,finished:q.finished===true,completed:false,ink:null,heard:q.heard===true,selection:typeof q.selection==='string'?q.selection:null,assisted:q.assisted===true,wordSnapshots:[]};
 for(const key of ['originalQuiz','firstCorrect','firstAnswered','earned','attempts','startedAt'])s[key]=Number.isFinite(q[key])&&q[key]>=0?q[key]:0;
 for(const [key,val]of Object.entries(q.passed||{})){const [id,skill]=key.split(':');if(q.wordIds.includes(id)&&SKILLS.includes(skill)&&typeof val==='boolean')s.passed[key]=val;}
 s.firstMisses=Array.isArray(q.firstMisses)?q.firstMisses.filter(x=>typeof x==='string'&&x.length<60):[];
 if(q.feedback)s.feedback={correct:q.feedback.correct===true,training:q.feedback.training===true,method:String(q.feedback.method||'').slice(0,30),recognized:String(q.feedback.recognized||'').slice(0,60),reason:String(q.feedback.reason||'').slice(0,200),gained:Number.isFinite(q.feedback.gained)?Math.max(0,q.feedback.gained):0};
 if(q.ink&&Array.isArray(q.ink.characters)&&q.ink.characters.length<=24){s.ink={characters:q.ink.characters.map(lines=>Array.isArray(lines)?lines.slice(0,60).filter(line=>Array.isArray(line)&&line.length<=2000&&line.every(p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(n=>Number.isFinite(n)&&n>=0&&n<=1))).map(line=>line.map(p=>p.slice(0,2))):[]),active:Number.isInteger(q.ink.active)?Math.max(0,Math.min(q.ink.characters.length-1,q.ink.active)):0,results:q.ink.characters.map((_,i)=>q.ink.results?.[i]===true),...(['mlkit','shape-template'].includes(q.ink.method)?{method:q.ink.method}:{})};}
 if(Array.isArray(q.wordSnapshots))s.wordSnapshots=q.wordSnapshots.filter(w=>w&&ID.test(w.id)&&q.wordIds.includes(w.id)&&typeof w.word==='string'&&typeof w.reading==='string'&&typeof w.meaning==='string').map(w=>({id:w.id,level:w.level,word:w.word.slice(0,60),reading:w.reading.slice(0,100),meaning:w.meaning.slice(0,4000),language:w.language==='ko'?'ko':'en'}));
 s.completed=s.finished&&unresolved(s).length===0;return s;
}
