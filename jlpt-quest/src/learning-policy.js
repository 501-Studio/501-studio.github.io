/** Automatic grading policy. Multipliers are bounded heuristics, not calibrated recall probabilities. */
export const INTENSITIES=Object.freeze({
 veryeasy:{label:'매우 쉬움',study:1,audio:0,trace:0,meaning:1,listening:0,writing:0},
 easy:{label:'쉬움',study:1,audio:1,trace:1,meaning:1,listening:1,writing:1},
 medium:{label:'중간',study:1,audio:1,trace:3,meaning:1,listening:2,writing:2},
 hard:{label:'어려움',study:1,audio:2,trace:5,meaning:2,listening:3,writing:3}
});
export const intensityKey=k=>Object.hasOwn(INTENSITIES,k)?k:'medium';
export const intensity=k=>INTENSITIES[intensityKey(k)];
export function policyDescription(k){const p=intensity(k);return `단어당 뜻 ${p.meaning} · 듣기 ${p.listening} · 쓰기 ${p.writing}문제 / 듣기 연습 ${p.audio} · 쓰기 연습 ${p.trace}회`;}
/** Keep kana suffixes in place and reveal only completed target characters, in order. */
export function completedWord(w,results=[],guide=false){
 let i=0;const han=/\p{Script=Han}/u.test(w.word);
 return [...w.word].map(c=>{
  const target=han?/\p{Script=Han}/u.test(c):/[\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(c);
  if(!target)return c;
  return (guide||results[i++]===true)?c:'□';
 }).join('');
}
export function adaptiveInterval(record,base,{correct,sessionId,now,latencyMs=0,enabled=true}={}){
 const previous=record||{};
 const same=previous.lastSession===sessionId;
 const early=(previous.stage??-1)>=0&&previous.due>now;
 const recent=Array.isArray(previous.recent)?previous.recent.slice(-11):[];
 // Retries in the same session are not independent recall observations.
 const observed=!same&&(!early||!correct);
 const recentNext=observed?[...recent,correct?1:0]:recent;
 const result={...base,recent:recentNext,independentFailures:(previous.independentFailures??previous.lapses??0)+(observed&&!correct?1:0),intervalMs:base.due-now};
 if(!correct||same||early){result.intervalMs=previous.intervalMs??Math.max(0,base.due-(base.lastAt||now));return result;}
 const samples=Math.min(1000,previous.latencySamples||0),average=previous.averageMs||0;
 const validTime=Number.isFinite(latencyMs)&&latencyMs>=250&&latencyMs<=120000;
 if(validTime){result.averageMs=average?(average*samples+latencyMs)/(samples+1):latencyMs;result.latencySamples=samples+1;}
 if(!enabled||!record)return result;
 let factor=1;
 if(recent.length>=2&&recent.slice(-2).every(x=>x===0))factor=.6;
 else if((previous.independentFailures??previous.lapses??0)===0&&(previous.consecutive||0)>=2)factor=1.4;
 else if(recent.slice(-4).includes(0))factor=.85;
 // Slow relative to this user's history for this item; no inference after a background interruption.
 if(samples>=3&&validTime&&latencyMs>Math.max(5000,average*1.8))factor=Math.min(factor,.85);
 const ms=Math.max(600000,Math.min(60*86400000,Math.round((base.due-now)*factor)));
 return {...result,due:now+ms,intervalMs:ms,policy:'adaptive-v1',factor};
}
