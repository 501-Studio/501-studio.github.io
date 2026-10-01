/** Per-install help preference. Deliberately separate from learning/backup records. */
export const TUTORIAL_VERSION = 1;
export const TUTORIAL_STEPS = 5;
export const freshTutorial = () => ({version:TUTORIAL_VERSION,status:'new',step:0});
export function normalizeTutorial(value){
 if(!value||value.version!==TUTORIAL_VERSION)return freshTutorial();
 const status=['new','active','completed','skipped'].includes(value.status)?value.status:'new';
 const step=Number.isInteger(value.step)?Math.min(TUTORIAL_STEPS-1,Math.max(0,value.step)):0;
 return {version:TUTORIAL_VERSION,status,step};
}
export function tutorialProgress(step,status='active'){
 return normalizeTutorial({version:TUTORIAL_VERSION,status,step});
}
export function shouldOfferTutorial(value,{route='home',ready=false,storageOK=false,hidden=false,modalOpen=false}={}){
 const r=normalizeTutorial(value);
 return ready&&storageOK&&!hidden&&!modalOpen&&route==='home'&&['new','active'].includes(r.status);
}
/** A second tab's stale progress cannot make a dismissed guide appear again. */
export function mergeTutorial(previous,next){
 const a=normalizeTutorial(previous),b=normalizeTutorial(next);
 if(a.status==='completed')return a;
 if(a.status==='skipped'&&['new','active'].includes(b.status))return a;
 return b;
}
