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
 if(live(state.session)&&state.session.kind==='review')return 'resume';
 if(live(state.suspendedSession)&&state.suspendedSession.kind==='review'){
  swapSession(state);return 'resume';
 }
 const review=createReview(state,words,filter,now);
 // Do not park/erase a lesson when there is nothing to review.
 if(!review)return 'empty';
 if(live(state.session)){
  if(live(state.suspendedSession))throw new Error('보관한 수업을 먼저 이어서 진행해 주세요.');
  state.suspendedSession=state.session;
 }
 state.session=review;return 'started';
}
export function finishSession(state){
 if(live(state.session))return false;
 state.session=null;
 if(live(state.suspendedSession))swapSession(state);
 else state.suspendedSession=null;
 return live(state.session);
}
export function restartSession(state,words){
 const old=state.session;if(!live(old))return false;
 if(old.kind==='class'){state.session=createClass(state,old.course,words);state.session.id=old.id;}
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
 return s.kind==='review'?(s.reviewMode==='preview'?'미리 복습':'복습'):`${s.course?.level||''} 제${s.course?.index||''}장`;
}

/** Keep any in-flight review when deliberately replacing/starting a main class. */
export function startClassSession(state,course,words){
 const review=[state.session,state.suspendedSession].find(s=>live(s)&&s.kind==='review')||null;
 const lesson=createClass(state,course,words);
 state.session=lesson;state.suspendedSession=review;return lesson;
}
