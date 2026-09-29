"""Small, asserted QA fixes after the checked 039 source delta."""
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
p.write_text(s)
paths=Path('/tmp/kotoba039-source-paths.json')
if paths.exists():
 files=json.loads(paths.read_text());files.extend(str(p) for p in [root/'tests/release036-browser.py',root/'personal.css',root/'tests/personal039-browser.py']);paths.write_text(json.dumps(list(dict.fromkeys(files))))
print('Applied offline TTS test adapter, compact practice layout, and settled screenshot checks.')
