"""Idempotent source integration. Never edit user databases or production settings."""
from pathlib import Path
import json
ROOT=Path('jlpt-quest')
def replace(path,old,new):
 p=Path(path);s=p.read_text()
 if new in s:return
 assert old in s,f'Baseline mismatch: {path}: {old[:100]}'
 p.write_text(s.replace(old,new))
app='jlpt-quest/src/app.js'
replace(app,"import {advanced,hubEntry", "import {createTutorial} from './tutorial-ui.js';\nimport {advanced,hubEntry")
replace(app,"const route=()=>location.hash.slice(1)||'home';", "const route=()=>location.hash.slice(1)||'home';\nconst tutorial=createTutorial({getState:()=>state,save,stop:cancelWork});")
replace('jlpt-quest/src/course-engine.js',"import {intensity,intensityKey", "import {normalizeTutorial} from './tutorial.js';\nimport {intensity,intensityKey")
replace('jlpt-quest/src/course-engine.js',"export function fresh(){return {version:SCHEMA,revision:0,", "export function fresh(){return {version:SCHEMA,revision:0,tutorial:normalizeTutorial(),")
replace('jlpt-quest/src/course-engine.js',"s.study=validateStudy(input.study);", "s.study=validateStudy(input.study);s.tutorial=normalizeTutorial(input.tutorial);")
replace(app," if(route()==='lesson'&&t&&state.session&&!state.session.finished){", " if(storageOK)tutorial.maybeOpen(route());\n if(route()==='lesson'&&t&&state.session&&!state.session.finished){")
replace(app,"async function autoPronounceOnce(s,t,w){", "async function autoPronounceOnce(s,t,w){\n if(document.hidden||modal.firstChild||tutorial.isOpen()||state.session!==s||current(s)!==t)return;")
replace(app,"if(stage.bit===AUTO_SPEECH_PROMPT&&state.session===s&&current(s)?.id===t.id&&!s.feedback)promptClock", "if(nonce===audioNonce&&stage.bit===AUTO_SPEECH_PROMPT&&route()==='lesson'&&!document.hidden&&!modal.firstChild&&!tutorial.isOpen()&&state.session===s&&current(s)?.id===t.id&&!s.feedback)promptClock")
replace(app,"setTimeout(()=>play(false,w.id,true),90);", "const shown=modal.firstChild;setTimeout(()=>{if(modal.firstChild===shown&&!document.hidden&&!tutorial.isOpen())play(false,w.id,true);},90);")
replace(app,"if(!el||el.disabled||!ready)return;", "if(!el||el.disabled||!ready||tutorial.isOpen())return;")
replace(app," if(await handleAdvanced(a,el,advancedContext()))return;", " if(a==='tutorial-start'){closeModal();tutorial.open({manual:true,onReturn:settings});return;}\n if(await handleAdvanced(a,el,advancedContext()))return;")
replace(app,"document.addEventListener('keydown',event=>{if(!modal.firstChild)return;", "document.addEventListener('keydown',event=>{if(tutorial.isOpen()||!modal.firstChild)return;")
replace(app,"${switchSetting('furigana','히라가나 표시')}", "<section class=\"settings-section tutorial-entry\"><h3>사용 방법</h3>${btn('tutorial-start',icon('book')+' 기능 튜토리얼 다시 보기','soft wide')}<p class=\"fine\">회독·쓰기·복습·단어장·설정, 5단계 안내</p></section>${switchSetting('furigana','히라가나 표시')}")
replace(app,"코토바 0.4.0 · 내부 테스트", "코토바 0.4.1 · 내부 테스트")
replace('jlpt-quest/index.html','<link rel="stylesheet" href="./advanced.css">','<link rel="stylesheet" href="./advanced.css">\n<link rel="stylesheet" href="./tutorial.css">')
replace('jlpt-quest/scripts/sync-android.mjs',"'personal.css','advanced.css','src'", "'personal.css','advanced.css','tutorial.css','src'")
replace('jlpt-quest/sw.js',"const NAME='kotoba-course-0.4.0';", "const NAME='kotoba-course-0.4.1';")
replace('jlpt-quest/sw.js','const CORE=[',"const CORE=[\n './src/tutorial.js','./src/tutorial-ui.js','./tutorial.css',")
replace('kotoba-android/app/build.gradle','versionCode 13','versionCode 14')
replace('kotoba-android/app/build.gradle',"versionName '0.4.0'","versionName '0.4.1'")
p=ROOT/'package.json';d=json.loads(p.read_text());d['version']='0.4.1'
if 'tests/tutorial041.test.mjs' not in d['scripts']['test']:d['scripts']['test']+=' tests/tutorial041.test.mjs'
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
# Returning-user regression cases explicitly dismiss the new first-run overlay.
# New-install, migration, accessibility, failure and replay paths have a separate suite.
for name in ['continuation040','autopronounce041','advanced040','personal039','release038','examples038','release037','release036']:
 p=ROOT/f'tests/{name}-browser.py';s=p.read_text()
 if 'from tutorial_helpers import returning_user' not in s:s='from tutorial_helpers import returning_user\n'+s
 if 'p=c.new_page();returning_user(p);' not in s:s=s.replace('p=c.new_page();','p=c.new_page();returning_user(p);')
 if 'P.chromium.launch(executable_path=' not in s:s=s.replace('P.chromium.launch(','P.chromium.launch(executable_path=os.environ.get(\'KOTOBA_CHROMIUM\') or None,')
 if "Object.assign(E.fresh(),{tutorial:" not in s:s=s.replace('E.fresh()',"Object.assign(E.fresh(),{tutorial:{version:1,status:'skipped',step:0}})")
 p.write_text(s)
path='kotoba-android/app/src/androidTest/java/com/studio501/kotoba/LessonRotationTest.java'
replace(path,'// Start and classify the actual lesson through its public UI.', '''// Dismiss the first-run tutorial through its public button when present.
            js(s,"document.querySelector('#function-tutorial [data-tour-action=\\\"skip\\\"]')?.click();true");
            until(s,"!document.querySelector('#function-tutorial[open]')");
            // Start and classify the actual lesson through its public UI.''')
print('Tutorial 041 source integrated; existing learning state schema preserved.')
