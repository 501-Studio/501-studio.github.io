import {TUTORIAL_STEPS,normalizeTutorial,needsTutorial,tutorialProgress,tutorialHTML} from './tutorial.js';
/** Independent dialog: no navigation, fake answers, XP or destructive imports. */
export function createTutorial({getState,save,stop,onClosed=()=>{}}){
 let dialog=null,step=0,replay=false,saving=false,returnTo=null,focusBefore=null,scrollBefore=0;
 const isOpen=()=>!!dialog?.open;
 function lock(value){saving=value;if(!dialog)return;dialog.setAttribute('aria-busy',String(value));dialog.querySelectorAll('button').forEach(b=>b.disabled=value||(b.dataset.tourAction==='prev'&&step===0));}
 function paint(){if(!dialog)return;dialog.innerHTML=tutorialHTML(step,replay);dialog.querySelector('#tour-title')?.focus({preventScroll:true});}
 async function remember(status){
  if(replay&&!needsTutorial(getState()))return true;
  getState().tutorial=tutorialProgress(status,step);
  const ok=await save();
  if(!ok&&dialog){const label=dialog.querySelector('.tour-save-error');label.hidden=false;label.textContent='안내 진행을 저장하지 못했습니다. 다음 실행에 다시 표시될 수 있습니다.';}
  return ok;
 }
 async function finish(status='skipped'){
  if(!dialog||saving)return;lock(true);
  try{await remember(status);}finally{
   const closed=dialog;dialog=null;closed?.close();closed?.remove();document.body.classList.remove('tutorial-open');saving=false;
   if(focusBefore?.isConnected)focusBefore.focus({preventScroll:true});window.scrollTo(0,scrollBefore);
   const back=returnTo;returnTo=null;back?.();onClosed();
  }
 }
 async function move(n){
  if(!dialog||saving)return;
  if(n>=TUTORIAL_STEPS.length){await finish('completed');return;}
  step=Math.max(0,n);paint();lock(true);try{await remember('started');}finally{lock(false);}
 }
 function open({manual=false,onReturn=null}={}){
  if(dialog)return;
  replay=manual;returnTo=onReturn;step=manual?0:normalizeTutorial(getState().tutorial).step;
  focusBefore=document.activeElement;scrollBefore=window.scrollY;stop();
  dialog=document.createElement('dialog');dialog.id='function-tutorial';dialog.className='function-tutorial';dialog.setAttribute('aria-labelledby','tour-title');dialog.setAttribute('aria-describedby','tour-description');
  document.body.append(dialog);paint();dialog.showModal();dialog.querySelector('#tour-title').focus({preventScroll:true});document.body.classList.add('tutorial-open');
  dialog.addEventListener('cancel',e=>{e.preventDefault();void finish();});
  dialog.addEventListener('click',e=>{
   e.stopPropagation();const b=e.target.closest('button');if(!b||saving)return;
   if(b.dataset.tourAction==='skip')void finish();
   if(b.dataset.tourAction==='prev')void move(step-1);
   if(b.dataset.tourAction==='next')void move(step+1);
   if(b.dataset.tourStep!==undefined)void move(Number(b.dataset.tourStep));
   if(b.dataset.tourDemo){
    dialog.querySelectorAll('[data-tour-demo]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});
    dialog.querySelector('#tour-demo-status').textContent=b.dataset.tourDemo==='known'?'예시: 이번 회독에서 제외합니다. 실제 기록은 저장하지 않았습니다.':'예시: 이어서 집중 학습합니다. 실제 기록은 저장하지 않았습니다.';
   }
  });
  dialog.addEventListener('keydown',e=>{
   if(e.altKey||e.ctrlKey||e.metaKey)return;
   if(e.key==='Tab'){
    const buttons=[...dialog.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);
    if(e.shiftKey&&(document.activeElement===first||document.activeElement.id==='tour-title')){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
   if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();void move(step+(e.key==='ArrowRight'?1:-1));}
  });
  lock(true);remember('started').finally(()=>lock(false));
 }
 window.addEventListener('kotoba-back',e=>{if(isOpen()){e.stopImmediatePropagation();void finish();}},true);
 return {isOpen,open,dismiss:()=>finish(),maybeOpen(route){
  if(route==='home'&&!dialog&&!document.hidden&&!document.querySelector('#modal-root')?.firstChild&&needsTutorial(getState()))open();
 }};
}
