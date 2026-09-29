/** Independent wordbook drill; never replaces a lesson or mutates SRS/XP. */
import {writingChars} from './catalog.js';
import {characterStrokes} from './stroke-bank.js';
import {validPrefix,SNAP_MODE} from './stroke-match.js';
export const REPEAT_OPTIONS=[1,3,5,10,20];
const validId=id=>typeof id==='string'&&/^N[1-5]-[a-z0-9]+$/.test(id);
const integer=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
export function startWordPractice(state,w,repeats=3){
 if(!w||!validId(w.id)||!writingChars(w).length)throw new Error('쓰기 연습에 필요한 단어가 없습니다.');
 if(!Number.isSafeInteger(repeats)||repeats<1||repeats>20)throw new Error('반복 횟수는 1~20회로 선택하세요.');
 for(const c of writingChars(w))if(!characterStrokes(c).length)throw new Error('획 데이터가 없습니다.');
 state.wordPractice={wordId:w.id,repeats,completed:0,guide:true,ink:null,finished:false};
 return state.wordPractice;
}
export function practiceInk(p,w){
 const chars=writingChars(w);
 if(!p.ink||p.ink.characters.length!==chars.length)p.ink={mode:SNAP_MODE,characters:chars.map(()=>[]),results:chars.map(()=>false),active:0};
 const q=p.ink;q.active=Math.max(0,Math.min(chars.length-1,q.active));
 q.characters=q.characters.map((lines,i)=>validPrefix(lines,characterStrokes(chars[i]),{character:chars[i]}));
 q.results=chars.map((c,i)=>q.characters[i].length===characterStrokes(c).length);
 return q;
}
export function advanceWordPractice(state,w,now=Date.now()){
 const p=state.wordPractice;if(!p||p.finished||p.wordId!==w.id)return false;
 const q=practiceInk(p,w);if(!q.results[q.active])return false;
 if(!q.results.every(Boolean)){q.active=q.results.findIndex(v=>!v);return true;}
 p.completed++;p.ink=null;p.finished=p.completed>=p.repeats;
 const d=new Date(now),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 state.practiceLog??={};const log=state.practiceLog[key]??={rounds:0,wordIds:[]};
 log.rounds++;if(!log.wordIds.includes(w.id))log.wordIds.push(w.id);
 return true;
}
export function validateWordPractice(p){
 if(!p)return null;
 if(!validId(p.wordId)||!integer(p.repeats,20)||p.repeats<1||!integer(p.completed,p.repeats))throw new Error('단어장 쓰기 기록을 확인할 수 없습니다.');
 const out={wordId:p.wordId,repeats:p.repeats,completed:p.completed,guide:p.guide!==false,finished:p.completed===p.repeats,ink:null};
 if(p.ink){
  const q=p.ink;if(!Array.isArray(q.characters)||!q.characters.length||q.characters.length>24||!integer(q.active,q.characters.length-1))throw new Error('저장된 필기 기록을 확인할 수 없습니다.');
  if(q.characters.some(lines=>!Array.isArray(lines)||lines.length>60||lines.some(line=>!Array.isArray(line)||line.length>2000||line.some(pt=>!Array.isArray(pt)||pt.length!==2||pt.some(v=>!Number.isFinite(v)||v<0||v>1)))))throw new Error('저장된 획이 올바르지 않습니다.');
  out.ink={mode:SNAP_MODE,characters:q.characters.map(lines=>lines.map(line=>line.map(pt=>[...pt]))),active:q.active,results:q.characters.map(()=>false)};
 }
 return out;
}
export function validatePracticeLog(input){
 const out={};for(const [key,v]of Object.entries(input||{}))if(/^\d{4}-\d{2}-\d{2}$/.test(key)&&integer(v?.rounds,1000000)&&Array.isArray(v.wordIds))out[key]={rounds:v.rounds,wordIds:[...new Set(v.wordIds.filter(validId))].slice(0,10000)};
 return out;
}
