/** One active lesson plus one parked lesson. SRS/XP never roll back on a restart. */
import {createClass,createReview,nowId} from './course-engine.js';
const live=s=>!!s&&!s.finished;
export function swapSession(state){
 if(!live(state.suspendedSession))return false;
 const previous=live(state.session)?state.session:null;
 state.session=state.suspendedSession;state.suspendedSession=previous;
 return true;
}
export function enterReview(state,words,filter='due',now=Date.now()){
 const matches=s=>live(s)&&s.kind==='review'&&(s.reviewMode||'due')===filter&&s.wordIds.every(id=>id.startsWith(state.settings.level+'-'));
 if(matches(state.session))return 'resume';
 if(matches(state.suspendedSession)){swapSession(state);return 'resume';}
 const parked=(state.parkedSessions||[]).find(matches);
 if(parked){restoreParked(state,parked.id);return 'resume';}
 const review=createReview(state,words,filter,now);
 if(!review)return 'empty';
 activateSession(state,review);return 'started';
}
export function finishSession(state){
 if(live(state.session))return false;
 state.session=null;
 if(live(state.suspendedSession))swapSession(state);
 else state.suspendedSession=null;
 if(!state.session&&state.parkedSessions?.length)state.session=state.parkedSessions.pop();
 return live(state.session);
}
export function restartSession(state,words){
 const old=state.session;if(!live(old))return false;
 if(old.kind==='class'){state.session=createClass({...state,settings:{...state.settings,intensity:old.intensity}},old.course,words);state.session.id=old.id;}
 else {
  const seen=new Set(),queue=[];
  for(const t of old.queue){
   if(t.phase!=='quiz')continue;
   const key=`${t.wordId}:${t.skill}`;if(seen.has(key))continue;seen.add(key);
   queue.push({...t,id:nowId(),attempt:0,options:[...t.options]});
  }
  if(!queue.length)return false;
  state.session={...old,id:old.id,queue,index:0,originalQuiz:queue.length,
   firstCorrect:0,firstAnswered:0,passed:{},feedback:null,finished:false,
   completed:false,finalized:false,ink:null,heard:false,selection:null,
   assisted:false,startedAt:Date.now(),earned:0,attempts:0,firstMisses:[],
   autoPlayedTask:null,showExample:false,exampleIndex:0};
 }
 return true;
}
export function lessonName(s){
 if(!s)return '';
 return s.kind==='review'?(s.label|| (s.reviewMode==='preview'?'미리 복습':'복습')):`${s.course?.level||''} 제${s.course?.index||''}장`;
}

/** Keep any in-flight review when deliberately replacing/starting a main class. */
export function startClassSession(state,course,words){
 const review=[state.session,state.suspendedSession].find(s=>live(s)&&s.kind==='review')||null;
 const lesson=createClass(state,course,words);
 state.session=lesson;state.suspendedSession=review;return lesson;
}

export function activateSession(state,next){
 if(!next)return false;
 state.parkedSessions??=[];
 if(live(state.session)&&live(state.suspendedSession)){
  if(state.parkedSessions.length>=8)throw new Error('보관 중인 학습을 먼저 마쳐 주세요.');
  state.parkedSessions.push(state.suspendedSession);
 }
 if(live(state.session))state.suspendedSession=state.session;
 state.session=next;return true;
}
export function restoreParked(state,id){const i=(state.parkedSessions||[]).findIndex(s=>s.id===id);if(i<0)return false;const [s]=state.parkedSessions.splice(i,1);return activateSession(state,s);}
