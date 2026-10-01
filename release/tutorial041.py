"""Apply small, asserted integration edits. Already applied edits are left unchanged.
Only source is edited; this never opens or rewrites user learning data.
"""
from pathlib import Path
import json
ROOT=Path('jlpt-quest')
def replace(path,old,new):
 p=Path(path);s=p.read_text()
 if new in s:return
 assert old in s,f'Expected baseline missing: {path}: {old[:80]}'
 p.write_text(s.replace(old,new))
replace('jlpt-quest/src/storage.js',"import {fresh,validateState} from './course-engine.js';","import {fresh,validateState} from './course-engine.js';\nimport {normalizeTutorial,mergeTutorial} from './tutorial-state.js';")
p=ROOT/'src/storage.js';s=p.read_text()
if 'export async function loadTutorial' not in s:
 p.write_text(s+'''
/** Help is a device preference in a separate key, not a scored learning record. */
export async function loadTutorial(){return normalizeTutorial(await read('state','tutorial-v1'));}
export function storeTutorial(value){return new Promise((resolve,reject)=>{
 if(!db)return reject(new Error('안내 상태를 저장할 수 없습니다.'));
 const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),get=store.get('tutorial-v1');let saved;
 get.onsuccess=()=>{try{saved=mergeTutorial(get.result,value);store.put(saved,'tutorial-v1');}catch(error){tx.abort();reject(error);}};
 tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(tx.error||new Error('안내 저장 실패'));tx.onabort=()=>reject(tx.error||new Error('안내 저장 취소'));
});}
''')
replace('jlpt-quest/src/app.js',"import {advanced,", "import {tutorialView} from './tutorial.js';\nimport {freshTutorial,normalizeTutorial,tutorialProgress,shouldOfferTutorial,TUTORIAL_STEPS} from './tutorial-state.js';\nimport {loadTutorial,storeTutorial} from './storage.js';\nimport {advanced,")
replace('jlpt-quest/src/app.js',"let statsView={days:7,level:'all',date:null},practiceWordId=null,practiceRepeats=3;", "let tutorialRecord=freshTutorial(),tutorialSession=null,tutorialWrites=Promise.resolve(),tutorialSuppressed=false,tutorialSaveFailed=false;\nlet statsView={days:7,level:'all',date:null},practiceWordId=null,practiceRepeats=3;")
helper='''function persistTutorial(value){
 tutorialRecord=normalizeTutorial(value);const snapshot={...tutorialRecord};
 tutorialWrites=tutorialWrites.catch(()=>{}).then(()=>storeTutorial(snapshot));
 tutorialWrites.catch(()=>{tutorialSaveFailed=true;const status=modal.querySelector('.tour-storage-status');if(status)status.textContent='안내 상태를 저장하지 못했습니다. 다음 실행 때 다시 나올 수 있습니다.';toast('안내 상태를 저장하지 못했습니다. 학습 기록은 변경하지 않았습니다.');});
}
function offerTutorial(){
 if(tutorialSession||tutorialSuppressed)return;
 if(shouldOfferTutorial(tutorialRecord,{route:route(),ready,storageOK,hidden:document.hidden,modalOpen:!!modal.firstChild}))startTutorial(false);
}
function startTutorial(replay=true){
 if(tutorialSession)return;
 cancelWork();tutorialSession={step:replay?0:tutorialRecord.step,replay,route:route(),focus:document.activeElement};
 if(!replay)persistTutorial(tutorialProgress(tutorialSession.step));
 showTutorial();
}
function showTutorial(){
 if(!tutorialSession)return;
 openModal(tutorialView(tutorialSession.step,{replay:tutorialSession.replay}),true);
 const sheet=modal.querySelector('.sheet');sheet?.setAttribute('aria-describedby','tour-description');
 modal.querySelector('#sheet-title')?.focus({preventScroll:true});
 if(tutorialSaveFailed)modal.querySelector('.tour-storage-status').textContent='안내 상태를 저장하지 못했습니다. 다음 실행 때 다시 나올 수 있습니다.';
 notifyScreen('tutorial',state.session);
}
function finishTutorial(status='skipped',restore=true){
 const tour=tutorialSession;if(!tour)return;
 tutorialSession=null;tutorialSuppressed=true;
 if(status==='completed'||tutorialRecord.status!=='completed')persistTutorial(tutorialProgress(tour.step,status));
 closeModal();
 if(tour.replay&&restore&&route()===tour.route){settings();modal.querySelector('[data-action="tutorial-open"]')?.focus({preventScroll:true});}
 else if(restore){(tour.focus?.isConnected?tour.focus:root.querySelector('.appbar [data-action="settings"]'))?.focus?.({preventScroll:true});}
 notifyScreen(route()==='word-practice'?'kana-practice':route(),state.session);
}
function handleTutorialAction(action){
 if(action==='tutorial-open'){startTutorial(true);return true;}
 if(!tutorialSession)return false;
 if(action==='tutorial-skip'){finishTutorial('skipped');return true;}
 if(action==='tutorial-finish'){if(tutorialSession.step===TUTORIAL_STEPS-1)finishTutorial('completed');return true;}
 if(action==='tutorial-previous'||action==='tutorial-next'){
  tutorialSession.step=Math.min(TUTORIAL_STEPS-1,Math.max(0,tutorialSession.step+(action==='tutorial-next'?1:-1)));
  if(!tutorialSession.replay)persistTutorial(tutorialProgress(tutorialSession.step));
  showTutorial();
 }
 return true;
}
'''
replace('jlpt-quest/src/app.js', "function switchSetting(key,label,description=''){",helper+"function switchSetting(key,label,description=''){")
replace('jlpt-quest/src/app.js',"stopFitting=fitHeadwords(root);notifyScreen(route()==='word-practice'?'kana-practice':route(),state.session);", "stopFitting=fitHeadwords(root);offerTutorial();notifyScreen(tutorialSession?'tutorial':route()==='word-practice'?'kana-practice':route(),state.session);")
replace('jlpt-quest/src/app.js',"function openModal(body){if(promptClock.id)","function openModal(body,forTutorial=false){if(tutorialSession&&!forTutorial)return;cancelWork();if(promptClock.id)")
replace('jlpt-quest/src/app.js',"modalFit=fitHeadwords(modal);}","modalFit=fitHeadwords(modal);root.inert=true;}")
replace('jlpt-quest/src/app.js',"function closeModal(){audioNonce++;", "function closeModal(restore=true){if(tutorialSession){finishTutorial('skipped',restore);return;}root.inert=false;audioNonce++;")
replace('jlpt-quest/src/app.js',"${switchSetting('furigana','히라가나 표시')}","<section class=\"settings-section\"><button type=\"button\" class=\"btn soft tutorial-replay\" data-action=\"tutorial-open\">${icon('book')}<span>튜토리얼 다시 보기<small>학습·복습·단어장 사용법</small></span>${icon('next')}</button></section>${switchSetting('furigana','히라가나 표시')}")
replace('jlpt-quest/src/app.js'," try{\n if(await handleAdvanced(a,el,advancedContext()))return;", " try{\n if(handleTutorialAction(a))return;\n if(await handleAdvanced(a,el,advancedContext()))return;")
replace('jlpt-quest/src/app.js',"state=await loadState();savedRevision=state.revision;await initializePacks();", "state=await loadState();savedRevision=state.revision;try{tutorialRecord=await loadTutorial();}catch{tutorialSuppressed=true;tutorialSaveFailed=true;}await initializePacks();")
replace('jlpt-quest/src/app.js',"window.addEventListener('hashchange',()=>{cancelWork();closeModal();", "window.addEventListener('hashchange',()=>{cancelWork();closeModal(false);")
replace('jlpt-quest/src/app.js',"async function autoPronounceOnce(s,t,w){\n const stage=", "async function autoPronounceOnce(s,t,w){\n if(document.hidden||modal.firstChild||!storageOK||state.session!==s||current(s)!==t)return;\n const stage=")
replace('jlpt-quest/src/app.js',"if(stage.bit===AUTO_SPEECH_PROMPT&&state.session===s&&current(s)?.id===t.id&&!s.feedback)promptClock=", "if(nonce===audioNonce&&!document.hidden&&!modal.firstChild&&stage.bit===AUTO_SPEECH_PROMPT&&state.session===s&&current(s)?.id===t.id&&!s.feedback)promptClock=")
replace('jlpt-quest/src/app.js',"setTimeout(()=>play(false,w.id,true),90);", "const sheet=modal.firstChild;setTimeout(()=>{if(!document.hidden&&modal.firstChild===sheet&&sheet?.querySelector('.example-pane'))play(false,w.id,true);},90);")
replace('jlpt-quest/src/app.js',"if(event.shiftKey&&document.activeElement===first)","if(!all.includes(document.activeElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();}else if(event.shiftKey&&document.activeElement===first)")
replace('jlpt-quest/src/app.js','코토바 0.4.0 · 내부 테스트','코토바 0.4.1 · 내부 테스트')
replace('jlpt-quest/index.html','<link rel="stylesheet" href="./advanced.css">','<link rel="stylesheet" href="./advanced.css">\n<link rel="stylesheet" href="./tutorial.css">')
replace('jlpt-quest/scripts/sync-android.mjs',"'personal.css','advanced.css','src'","'personal.css','advanced.css','tutorial.css','src'")
replace('jlpt-quest/sw.js',"const NAME='kotoba-course-0.4.0';", "const NAME='kotoba-course-0.4.1';")
replace('jlpt-quest/sw.js',"const CORE=[", "const CORE=[\n './tutorial.css','./src/tutorial.js','./src/tutorial-state.js',")
replace('kotoba-android/app/build.gradle','versionCode 13','versionCode 14')
replace('kotoba-android/app/build.gradle',"versionName '0.4.0'","versionName '0.4.1'")
replace('kotoba-android/app/src/main/java/com/studio501/kotoba/MainActivity.java','"review","lesson","completed").contains(screen)', '"review","lesson","completed","tutorial").contains(screen)')
p=ROOT/'package.json';v=json.loads(p.read_text());v['version']='0.4.1'
for name in ['tests/tutorial041.test.mjs']:
 if name not in v['scripts']['test']:v['scripts']['test']+=' '+name
p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
print('Tutorial integration applied; study state schema/data unchanged.')
