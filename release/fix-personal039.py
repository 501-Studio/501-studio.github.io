"""Asserted, idempotent QA corrections for the checked 039 source delta."""
from pathlib import Path
import json
root=Path('jlpt-quest')
p=root/'tests/release036-browser.py';s=p.read_text()
old="offline=b.new_context(viewport={'width':390,'height':780},has_touch=True,offline=True)"
new=old+'\n  offline.add_init_script("Object.defineProperty(window,\'SpeechSynthesisUtterance\',{configurable:true,value:class{constructor(t){this.text=t;}}});Object.defineProperty(window,\'speechSynthesis\',{configurable:true,value:{getVoices:()=>[{lang:\'ja-JP\',localService:true}],speak(u){setTimeout(()=>u.onend?.(),50)},cancel(){}}});")'
if new not in s:
 assert old in s;s=s.replace(old,new)
s=s.replace('# Full offline HTTP routes represent APK AssetLoader. Real audio decode, no mock verdict.','# Offline routes emulate AssetLoader; installed device TTS is mocked, never the grader.')
s=s.replace('fresh offline listening works from bundled assets','offline UI works with installed-device TTS adapter (not physical audio)')
p.write_text(s)
p=root/'personal.css';s=p.read_text();extra='''\n/* Leave room for all three help controls above the fixed footer on compact phones. */
html[data-snap="true"][data-feedback="false"] .practice-focus .ink-pad{width:min(100%,300px,max(180px,calc(100dvh - var(--lesson-foot) - 350px)));height:auto!important;aspect-ratio:1/1;margin:8px auto}
'''
if extra not in s:p.write_text(s+extra)
p=root/'tests/personal039-browser.py';s=p.read_text()
if 'settled screenshot' not in s:
 s=s.replace('p.screenshot(', 'p.wait_for_timeout(500);p.screenshot(')
 old="p.wait_for_timeout(500);p.screenshot(path=str(OUT/'writing.png'));draw(p,BANK['山'][1:]);"
 new="""# settled screenshot and first-viewport help reachability
  p.wait_for_timeout(500)
  helpbox=p.locator('.writing-help').bounding_box();footbox=p.locator('.lesson-footer').bounding_box()
  check('writing help controls fit above footer without scrolling',helpbox['y']+helpbox['height']<=footbox['y']+1)
  p.screenshot(path=str(OUT/'writing.png'));draw(p,BANK['山'][1:]);"""
 assert old in s;s=s.replace(old,new)
if 'console health capture' not in s:
 s=s.replace('checks=[];errors=[];requests=[]', 'checks=[];errors=[];requests=[];console_messages=[] # console health capture')
 s=s.replace("p.on('request',lambda r:requests.append(r.url))", "p.on('request',lambda r:requests.append(r.url));p.on('console',lambda m:console_messages.append({'type':m.type,'text':m.text}) if m.type in ['error','warning'] else None)")
 s=s.replace("check('no JavaScript errors',not errors)", "check('no JavaScript errors',not errors);check('no console errors',not any(m['type']=='error' for m in console_messages))")
 s=s.replace("'checks':checks,'errors':errors,'voiceTest'", "'checks':checks,'errors':errors,'console':console_messages,'voiceTest'")
 old="  p.locator('[data-action=\"close-modal\"]').click()\n  ids=p.evaluate"
 new="""  p.evaluate("window.speechSynthesis.getVoices=()=>[{lang:'en-US',localService:true}]")
  p.locator('[data-action="speech-test"]').click();p.wait_for_function("document.querySelector('#toast').textContent.includes('일본어 오프라인 음성이 없습니다')")
  check('missing Japanese voice produces visible settings guidance','설치' in p.locator('#toast').inner_text())
  p.evaluate("window.speechSynthesis.getVoices=()=>[{lang:'ja-JP',localService:true}]")
  p.locator('[data-action="close-modal"]').click()
  ids=p.evaluate"""
 assert old in s;s=s.replace(old,new)
if 'custom count clears unrelated preset selection' not in s:
 old="p.locator('#practice-repeats').fill('2');p.wait_for_timeout(500);"
 new="p.locator('#practice-repeats').fill('2');check('custom count clears unrelated preset selection',p.locator('.repeat-options [aria-pressed=\"true\"]').count()==0);p.wait_for_timeout(500);"
 assert old in s;s=s.replace(old,new)
p.write_text(s)
p=root/'src/app.js';s=p.read_text()
if "if(event.target.id==='practice-repeats')" not in s:
 old="document.addEventListener('input',event=>{if(event.target.id==='search'){search=event.target.value;limit=80;document.querySelector('#word-results').innerHTML=wordRows();}});"
 new="""document.addEventListener('input',event=>{
 if(event.target.id==='search'){search=event.target.value;limit=80;document.querySelector('#word-results').innerHTML=wordRows();}
 if(event.target.id==='practice-repeats'){
  const count=Number(event.target.value);
  if(Number.isSafeInteger(count)&&count>=1&&count<=20)practiceRepeats=count;
  document.querySelectorAll('.repeat-options [data-count]').forEach(button=>{const selected=Number(button.dataset.count)===count;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
 }
});"""
 assert old in s;s=s.replace(old,new)
p.write_text(s)
# Android evaluateJavascript uses about:blank as the import base (confirmed logcat).
# Keep the instrumentation module URL explicit; production source is unaffected.
p=Path('kotoba-android/app/src/androidTest/java/com/studio501/kotoba/LessonRotationTest.java');s=p.read_text()
if 'Classification saves asynchronously.' not in s:
 old='''            // Lifecycle fixture, not an audio test: enter the existing lesson's first trace task.
            js(s,"(async()=>{const S=await import('./src/storage.js');const v=await S.loadState();v.session.index=v.session.queue.findIndex(t=>t.skill==='trace');v.uiRoute='lesson';await S.commit(v,v.revision);location.reload();})();true");'''
 new=r'''            // Classification saves asynchronously. Wait for the real next screen before seeding.
            until(s,"!!document.querySelector('[data-action=\"audio-done\"]')");
            SystemClock.sleep(500);
            // Lifecycle fixture only. Surface conflicts instead of racing the last survey save.
            js(s,"(async()=>{try{const S=await import('./src/storage.js');const v=await S.loadState();const index=v.session.queue.findIndex(t=>t.skill==='trace');if(index<0)throw new Error('Trace task missing after survey');v.session.index=index;v.uiRoute='lesson';await S.commit(v,v.revision);document.body.dataset.seedReady='true';}catch(e){document.body.dataset.seedError=String(e);}})();true");
            until(s,"document.body.dataset.seedReady==='true'||!!document.body.dataset.seedError");
            assertEquals("Fixture preparation failed", "true", js(s,"document.body.dataset.seedReady==='true'"));
            js(s,"location.reload();true");'''
 assert old in s;s=s.replace(old,new)
s=s.replace("await import('./src/storage.js')", "await import(new URL('./src/storage.js',location.href).href)")
s=s.replace('assertEquals("Fixture preparation failed", "true",', 'assertEquals("Fixture preparation failed: "+js(s,"document.body.dataset.seedError||\'unknown\'"), "true",')
p.write_text(s)
print('Applied offline adapter, compact controls, repeat synchronization, and explicit fixture module URL.')
