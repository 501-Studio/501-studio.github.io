import {baseSchedulePlan,at,addDays,uid,upsert,DEFAULTS,dateKey} from './core.js';
import {spec,repeatStatus,periodOf,weekday,day} from './journey-domain.js';
/** Count existing reservations; allocate a full session per remaining routine occurrence. */
export function schedulePlan(state,startDate,days=7,replan=false){
 const plan=baseSchedulePlan(state,startDate,days,replan),settings={...DEFAULTS,...state.settings};
 const removed=new Set(plan.operations.filter(o=>o.action==='delete'&&o.collection==='blocks').map(o=>o.id));
 const blocks=[...state.blocks.filter(b=>!removed.has(b.id)),...plan.operations.filter(o=>o.collection==='blocks'&&o.action==='upsert').map(o=>o.data)];
 for(const task of state.items.filter(i=>spec(i)&&!i.routinePaused)){
  const rule=spec(task),counted=new Set();
  for(let n=0;n<days;n++){
   const d=addDays(startDate,n),status=repeatStatus(task,d);if(!status.eligible||d<day())continue;
   const period=status.period,reserved=()=>blocks.filter(b=>b.taskId===task.id&&new Date(b.end)>new Date()&&periodOf(rule,dateKey(b.start))===period).length;
   let need=Math.max(0,rule.target-status.count-reserved());
   const weekend=[0,6].includes(weekday(d)),start=+at(d,weekend?settings.weekendStart:settings.workStart),end=+at(d,weekend?settings.weekendEnd:settings.workEnd);
   let cursor=Math.max(start,Math.ceil(Date.now()/900000)*900000),buffer=Number(settings.bufferMinutes)*60000;
   while(need>0&&cursor<end&&plan.operations.length<480){
    const lunch={start:at(d,settings.lunchStart),end:at(d,settings.lunchEnd)};
    const busy=[...blocks,lunch].filter(b=>+new Date(b.end)>start&&+new Date(b.start)<end).sort((a,b)=>+new Date(a.start)-+new Date(b.start));
    const hit=busy.find(b=>cursor<+new Date(b.end)+buffer&&cursor>=+new Date(b.start)-buffer);
    if(hit){cursor=+new Date(hit.end)+buffer;continue;}
    const next=busy.find(b=>+new Date(b.start)>cursor),limit=Math.min(end,next?+new Date(next.start)-buffer:end),length=task.estimatedMinutes*60000;
    if(cursor+length<=limit){const b={id:uid(),taskId:task.id,title:task.title,start:new Date(cursor).toISOString(),end:new Date(cursor+length).toISOString(),locked:false,source:'app',allDay:false,color:task.color||null};blocks.push(b);plan.operations.push(upsert('blocks',b));cursor+=length+buffer;need--;}
    else cursor=next?+new Date(next.end)+buffer:end;
   }
   counted.add(period);
  }
  for(const p of counted){const d=p.slice(2),completed=(task.checkins||[]).filter(c=>c.period===p).length,reserved=blocks.filter(b=>b.taskId===task.id&&+new Date(b.end)>Date.now()&&periodOf(rule,dateKey(b.start))===p).length;const remaining=Math.max(0,rule.target-completed-reserved);if(remaining)plan.skipped.push({title:`${task.title} · ${d} ${remaining}회 미배치`,minutes:remaining*task.estimatedMinutes});}
 }
 return plan;
}
