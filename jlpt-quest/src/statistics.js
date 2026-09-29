import {DAY,SKILLS,dayKey,keyOf,streak} from './course-engine.js';
import {LEVELS} from './catalog.js';
/** Aggregates actual stored records. Older daily data has no per-answer accuracy. */
export function statistics(state,words,{days=7,level='all',now=Date.now()}={}){
 days=[7,30,90].includes(days)?days:7;level=LEVELS.includes(level)?level:'all';
 const map=new Map(words.map(w=>[w.id,w])),selected=words.filter(w=>level==='all'||w.level===level),ids=new Set(selected.map(w=>w.id));
 const active=id=>ids.has(id),matches=key=>active(key.split(':')[0]);
 const dates=[];const date=new Date(now);date.setHours(12,0,0,0);
 for(let i=days-1;i>=0;i--){const d=new Date(date);d.setDate(d.getDate()-i);dates.push(dayKey(d));}
 const activity=dates.map(date=>{
  const d=state.daily[date],keys=[...new Set(d?.keys||[])].filter(matches),wordIds=[...new Set(d?.words||[])].filter(active),p=state.practiceLog?.[date];
  return {date,questions:keys.length,words:wordIds.length,wordIds,keys,xp:level==='all'?(d?.xp||0):null,practice:level==='all'?(p?.rounds||0):null};
 });
 const periods=new Set(activity.flatMap(d=>d.wordIds)),totals={known:0,learned:0,learning:0,unseen:0,mastered:0};
 for(const w of selected){if(state.known[w.id])totals.known++;else if(state.learned[w.id])totals.learned++;else if(state.encountered[w.id])totals.learning++;else totals.unseen++;
  if(SKILLS.every(k=>(state.memory[keyOf(w.id,k)]?.stage??-1)>=3))totals.mastered++;
 }
 const skills=SKILLS.map(skill=>{
  const rows=Object.entries(state.memory).filter(([key])=>key.endsWith(':'+skill)&&matches(key)).map(([,r])=>r);
  return {skill,total:rows.length,long:rows.filter(r=>r.stage>=3).length,due:rows.filter(r=>r.due<=now).length,stages:Array.from({length:6},(_,i)=>rows.filter(r=>r.stage===i).length)};
 });
 const completed=Object.entries(state.completed).filter(([id])=>level==='all'||id.startsWith(level+'-'));
 const forecast=Array.from({length:7},(_,i)=>{const d=new Date(date);d.setDate(d.getDate()+i);return {date:dayKey(d),count:0};});
 for(const [key,r]of Object.entries(state.memory)){if(!matches(key))continue;const keyDate=r.due<=now?dayKey(now):dayKey(r.due),cell=forecast.find(d=>d.date===keyDate);if(cell)cell.count++;}
 const allQuestions=Object.values(state.daily).reduce((sum,d)=>sum+[...new Set(d.keys)].filter(matches).length,0);
 return {level,days,total:selected.length,totals,skills,activity,forecast,periodWords:periods.size,periodQuestions:activity.reduce((s,d)=>s+d.questions,0),activeDays:activity.filter(d=>d.questions||d.practice).length,allQuestions,chapters:completed.length,laps:completed.reduce((s,[,c])=>s+(c.laps||1),0),streak:streak(state,now),xp:state.xp,today:activity.at(-1),map};
}
export function wordStatus(state,id,skill){
 const record=state.memory[keyOf(id,skill)];
 return record?{kind:'tested',record}:state.known[id]?{kind:'known'}:{kind:'unseen'};
}
