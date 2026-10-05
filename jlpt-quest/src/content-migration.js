import {optionsFor} from './course-engine.js';
import {CONTENT_REVISION} from './reviewed-identities.js';

/** Refresh saved prompts while preserving vocabulary IDs, progress and scores. */
export function refreshSessionContent(state,words){
 const lookup=new Map(words.map(w=>[w.id,w]));
 for(const session of [state.session,state.suspendedSession,...(state.parkedSessions||[])].filter(Boolean)){
  const previous=new Map((session.wordSnapshots||[]).map(w=>[w.id,w]));
  if(session.contentRevision!==CONTENT_REVISION){
   for(const task of session.queue){
    const word=lookup.get(task.wordId);
    if(word&&task.phase==='quiz'&&['meaning','listening'].includes(task.skill)){
     task.options=optionsFor(word,words,task.skill);
    }
   }
   session.selection=null;session.feedback=null;session.heard=false;
   session.autoPlayedTask=null;
   if(session.queue[session.index])session.queue[session.index].autoSpeech=0;
   session.ink=null;session.contentRevision=CONTENT_REVISION;
  }
  session.wordSnapshots=session.wordIds.map(id=>lookup.get(id)||previous.get(id)).filter(Boolean);
 }
}
