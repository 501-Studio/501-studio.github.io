#!/usr/bin/env python3
"""One-time, idempotent v0.3.1 source migration. CI saves generated runtime source back
onto the same feature branch. This script never accesses device progress or user data.
"""
from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]
android=root.parent/'kotoba-android'
p=root/'src/app.js';s=p.read_text()
if 'attachStrokePad' not in s:
    s=s.replace("import {attachInk,hasInk} from './ink.js';","import {attachStrokePad} from './stroke-pad.js';\nimport {SNAP_MODE,validPrefix} from './stroke-match.js';\nimport {loadStrokeBank,characterStrokes,requireStrokes} from './stroke-bank.js';")
    s=s.replace("import {isNative,callNative,judgeInk,installBridge} from './native.js';","import {isNative,callNative,installBridge} from './native.js';")
    a=s.index('function ensureInk(');b=s.index('function questionPage()',a)
    s=s[:a]+'''function ensureInk(s,w){
 const chars=writingChars(w);requireStrokes(chars);
 if(!s.ink||s.ink.mode!==SNAP_MODE||s.ink.characters.length!==chars.length)s.ink={mode:SNAP_MODE,characters:chars.map(()=>[]),results:chars.map(()=>false),active:0,method:'stroke-snap',hadError:false,misses:0};
 const q=s.ink;q.active=Math.min(Math.max(0,q.active),chars.length-1);
 q.characters=q.characters.map((lines,i)=>validPrefix(lines,characterStrokes(chars[i])));
 q.results=chars.map((c,i)=>q.characters[i].length===characterStrokes(c).length);return q;
}
'''+s[b:]
    a=s.index(' if(writing){');b=s.index(' if(s.feedback',a)
    s=s[:a]+''' if(writing){const q=ensureInk(s,w),chars=writingChars(w),active=q.active,guide=training||s.assisted,paths=characterStrokes(chars[active]);body=`${heading(training?'한 획씩 쓰면, 딱 맞춰져요.':'뜻을 보고, 한자로 써 보세요.',training?'초록 시작점에서 화살표 방향으로 한 획씩 그어 주세요.':'보이지 않는 한자를 떠올려 한 획씩 써 주세요.')}<div class="ink-prompt"><div><strong>${esc(w.meaning)}</strong><p lang="ja">${guide?esc(w.word):esc(writingPattern(w))}</p>${guide?showReading(w):''}</div><span class="label">${training?'획 따라 쓰기':'기억해서 쓰기'}</span></div><div class="character-tabs" role="group" aria-label="쓸 글자 선택">${chars.map((c,i)=>`<button data-action="character" data-index="${i}" class="${i===active?'active':''} ${q.results[i]?'complete':''}" aria-label="${i+1}번째 글자" ${s.feedback?'disabled':''}>${q.results[i]?icon('check'):guide?esc(c):i+1}</button>`).join('')}<span class="stroke-count" id="stroke-count">${q.characters[active].length} / ${paths.length}획</span></div><div class="ink-pad snap-pad"><div class="cross-lines"></div><canvas id="ink-canvas" aria-label="${active+1}번째 한자 획 따라 쓰기 필기장"></canvas><span class="pad-counter">${active+1} / ${chars.length}글자</span><span class="pad-local">${icon('check')}내장 · 오프라인</span></div><p class="grader-status" id="grade-status" role="status">${q.results[active]?'이 글자의 모든 획을 완성했어요.':guide?`${q.characters[active].length+1}번째 획을 그어 주세요.`:'한 획을 쓰고 손을 떼면 자동으로 확인해요.'}</p><div class="ink-toolbar">${btn('undo',icon('undo')+' 한 획 취소','text',s.feedback?'disabled':'')}${btn('clear',icon('trash')+' 다시 쓰기','text',s.feedback?'disabled':'')}${btn('replay',icon('refresh')+' 획 재생','text')}</div>${!training&&!s.feedback?btn('hint','정답 획을 보고 연습','text hint-button'):''}<p class="fine ink-fine">${training?'맞는 획은 제자리로 보정돼요. 잘못 그은 획만 다시 쓰면 돼요.':'시험에서는 획 안내를 숨깁니다. 틀리면 단어 완성 후 다시 출제해요.'}</p>`;}
'''+s[b:]
    s=s.replace("${s.feedback.method==='shape-template'?'<small>웹 형태 비교 판정</small>':''}","${s.feedback.method==='stroke-snap'?'<small>앱 내장 획순·모양 판정</small>':''}")
    a=s.index(" else if(['trace','writing'].includes(t.skill))",s.index('function footer'));b=s.index('\n else content=',a)
    s=s[:a]+''' else if(['trace','writing'].includes(t.skill)){const q=s.ink,all=q?.results.every(Boolean),done=q?.results[q.active],paths=characterStrokes(writingChars(W(t.wordId))[q.active]),left=paths.length-q.characters[q.active].length;content=`<span class="footer-hint">${q?.results.filter(Boolean).length||0}/${q?.results.length||1}글자 완성 · 한 획씩 자동 판정</span>${btn(all?'ink-done':done?'snap-next':'stroke-wait',all?'단어 쓰기 완료':done?'다음 한자 쓰기':`${left}획 더 쓰면 완성`,'primary',all||done?'':'disabled')}`;}
'''+s[b:]
    a=s.index('function render()');b=s.index('function syncButtons()',a)
    s=s[:a]+'''function render(){
 ink?.destroy();ink=null;applyMotion(state.settings);
 const t=current(state.session);document.documentElement.dataset.snap=String(route()==='lesson'&&!!t&&['trace','writing'].includes(t.skill));
 root.innerHTML=route()==='lesson'?questionPage():shell(({home,course:curriculum,review,words:wordPage,profile}[route()]||home)());
 const canvas=document.querySelector('#ink-canvas');if(canvas){const s=state.session,q=s.ink,paths=characterStrokes(writingChars(W(t.wordId))[q.active]);
  ink=attachStrokePad(canvas,paths,q.characters[q.active],{guide:t.phase==='learn'||s.assisted,motion:state.settings.motion,width:state.settings.penWidth,
   onChange(){q.results[q.active]=q.characters[q.active].length===paths.length;},
   onAttempt(result,count,total){
    if(!result.accepted){q.misses=(q.misses||0)+1;if(t.phase==='quiz')q.hadError=true;}
    document.querySelector('#grade-status').textContent=result.accepted?(count===total?'이 글자의 모든 획을 완성했어요.':`${count}획 완성. ${count+1}번째 획을 이어 주세요.`):result.reason;
    document.querySelector('#grade-status').dataset.verdict=result.accepted?'correct':'retry';
    document.querySelector('#stroke-count').textContent=`${count} / ${total}획`;
    const tab=document.querySelector(`.character-tabs [data-index="${q.active}"]`);tab?.classList.toggle('complete',q.results[q.active]);if(q.results[q.active]&&tab)tab.innerHTML=icon('check');
    document.querySelector('.lesson-footer').outerHTML=footer(s,t);haptic(state.settings,result.accepted);save();
   }});if(s.feedback)canvas.style.pointerEvents='none';
 }
}
'''+s[b:]
    s=s.replace("const g=document.querySelector('[data-action=\"grade\"]');if(g)g.disabled=busy||!hasInk(s.ink?.characters[s.ink.active]);",'')
    s=s.replace('손글씨 인식 모델은 앱이 자동으로 준비합니다. 최초 한 번은 약 20MB 다운로드 때문에 첫 판정이 조금 오래 걸릴 수 있으며, 이후에는 기기 안에서 인식합니다.','손글씨 판정과 모든 획 데이터가 APK에 내장돼 있어요. 첫 실행부터 인터넷 없이, 한 획씩 확인하고 제자리로 보정합니다. 외부 모델이나 별도 설치가 필요 없어요.')
    s=s.replace('현재 웹 형태 비교 모드입니다. Android의 ML Kit 손글씨 인식과 정확도가 같지 않습니다. 인식이 어려우면 기록을 남기지 않고 재작성을 요청합니다.','앱과 같은 획순·위치·모양 판정을 사용합니다. 이 기능은 정해진 글자를 따라 쓰는 학습 기능이며 자유 필기 OCR은 아닙니다.')
    a=s.index('async function grade()');b=s.index('function downloadJSON',a);s=s[:a]+s[b:]
    s=s.replace(" else if(a==='grade')await grade();\n",'')
    s=s.replace("else if(a==='ink-done'&&s.ink?.results.every(Boolean)){await submitCurrent({correct:true,method:s.ink.method||(isNative()?'mlkit':'shape-template'),assisted:s.assisted===true},t.phase==='learn');}","else if(a==='ink-done'&&s.ink?.results.every(Boolean)){await submitCurrent({correct:t.phase==='learn'||!s.ink.hadError,method:'stroke-snap',assisted:s.assisted===true},t.phase==='learn');}\n else if(a==='snap-next'&&s.ink&&!s.feedback){s.ink.active=s.ink.results.findIndex(v=>!v);await save();render();}")
    s=s.replace('await initializePacks();mergeWords();ready=true;render();','await initializePacks();await loadStrokeBank();mergeWords();requireStrokes(words.flatMap(writingChars));ready=true;render();')
    s=s.replace('function packsModal(){openModal(',"function packsModal(){if(isNative()){openModal(`${modalHead('앱에 모두 담겨 있어요')}<p>N5~N1 단어팩과 획 데이터가 APK 안에 들어 있어요. 다운로드나 손글씨 모델 준비 없이 사용할 수 있습니다.</p><div class=\"pack-levels\">${LEVELS.map(l=>`<div class=\"memory-row\"><b>${l}</b><span>${packInfo(l).installed.toLocaleString()}단어 내장</span></div>`).join('')}</div><p class=\"fine\">일본어 듣기는 기기에 설치된 TTS 음성을 사용합니다. 대부분의 전체팩 뜻은 영어 원문이며 한국어 검수는 진행 전입니다.</p>`);return;}openModal(")
    s=s.replace('async function installLevels(levels){if(downloading)return;','async function installLevels(levels){if(isNative())return packsModal();if(downloading)return;')
    if 'judgeInk' in s or 'hasInk' in s:raise ValueError('Old handwriting route was not fully removed')
    p.write_text(s)
p=root/'src/course-engine.js';s=p.read_text().replace("['shape-template','mlkit'].includes(result.method)","['shape-template','mlkit','stroke-snap'].includes(result.method)").replace("['mlkit','shape-template','choice'].includes(r.method)","['mlkit','shape-template','stroke-snap','choice'].includes(r.method)").replace("['mlkit','shape-template'].includes(q.ink.method)","['mlkit','shape-template','stroke-snap'].includes(q.ink.method)")
s=s.replace("s.ink={characters:q.ink.characters","s.ink={...(q.ink.mode==='stroke-snap-v1'?{mode:'stroke-snap-v1',hadError:q.ink.hadError===true,misses:Number.isSafeInteger(q.ink.misses)&&q.ink.misses>=0?q.ink.misses:0}:{}),characters:q.ink.characters")
p.write_text(s)
p=root/'src/native.js';s=p.read_text()
if 'export async function judgeInk' in s:s=s[s.index('let seq=0;'):];s=s[:s.index('export async function judgeInk')];p.write_text(s)
p=android/'app/src/main/java/com/studio501/kotoba/MainActivity.java';s=p.read_text()
if 'APK-local stroke engine runs' not in s:
    s='\n'.join(l for l in s.split('\n') if not l.startswith('import com.google.mlkit.'))
    s=s.replace('import androidx.activity.ComponentActivity;','import android.widget.FrameLayout;\nimport androidx.core.view.ViewCompat;\nimport androidx.core.view.WindowCompat;\nimport androidx.core.view.WindowInsetsCompat;\nimport androidx.activity.ComponentActivity;')
    s=s.replace('private boolean ttsReady, destroyed, recognizing;','private boolean ttsReady, destroyed;').replace('    private DigitalInkRecognizer recognizer;\n','').replace('    private DigitalInkRecognitionModel model;\n','')
    s=s.replace('/** Native-only services. Strokes and the target answer are never sent to a server. */','/** APK-local stroke engine runs in bundled JavaScript. Native bridge: speech and backups only. */')
    a=s.index('        setContentView(web);');b=s.index('        WebSettings ws=',a)
    s=s[:a]+'''        // Inset the parent, not the WebView itself: CSS fixed buttons then stay above navigation.
        WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
        FrameLayout frame=new FrameLayout(this);frame.setBackgroundColor(Color.rgb(245,246,249));
        frame.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(frame);
        WindowCompat.getInsetsController(getWindow(),frame).setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(getWindow(),frame).setAppearanceLightNavigationBars(true);
        ViewCompat.setOnApplyWindowInsetsListener(frame,(v,insets)->{
            androidx.core.graphics.Insets i=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout()|WindowInsetsCompat.Type.ime());
            v.setPadding(i.left,i.top,i.right,i.bottom);return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(frame);
'''+s[b:]
    a=s.index('        try { DigitalInkRecognitionModelIdentifier');b=s.index('        tts=new TextToSpeech',a);s=s[:a]+s[b:]
    s='\n'.join(l for l in s.split('\n') if not any(x in l for x in ['case "status":','case "downloadModel":','case "recognize":']))
    a=s.index('    private void prepareInkModel(') if '    private void prepareInkModel(' in s else s.index('    private void recognize(')
    b=s.index('    private void speak(',a);s=s[:a]+s[b:]
    s=s.replace('if(recognizer!=null)recognizer.close();','')
    s='\n'.join(l for l in s.split('\n') if 'raw.githubusercontent.com' not in l and 'private static final String SOURCE =' not in l)
    s=s.replace('안전한 손글씨 인식을 위해 시스템 WebView를 업데이트한 뒤 앱을 다시 열어 주세요.','학습 화면과 기기 기능을 사용하려면 시스템 WebView를 업데이트한 뒤 앱을 다시 열어 주세요.')
    p.write_text(s)
p=android/'app/build.gradle';s=p.read_text();s='\n'.join(l for l in s.split('\n') if 'com.google.mlkit' not in l);s=re.sub(r'versionCode \d+','versionCode 5',s);s=re.sub(r"versionName '[^']+'","versionName '0.3.2'",s);p.write_text(s)
p=android/'app/src/main/AndroidManifest.xml';s=p.read_text().replace('    <uses-permission android:name="android.permission.INTERNET" />\n','');p.write_text(s)
p=root/'package.json';j=json.loads(p.read_text());j['version']='0.3.2';j['scripts']['strokes:build']='python3 scripts/bundle-strokes.py';j['scripts']['build']='npm run icons:build && npm run content:fetch && npm run strokes:build';j['scripts']['test']='node --test tests/course.test.mjs tests/curriculum.test.mjs tests/recognition.test.mjs tests/stroke-snap.test.mjs';p.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n')
p=root/'index.html';s=p.read_text();s=s if './snap.css' in s else s.replace('</head>','<link rel="stylesheet" href="./snap.css"></head>');p.write_text(s)
p=root/'sw.js';s=p.read_text().replace('0.3.1','0.3.2')
if './snap.css' not in s:s=s.replace("'./src/app.js',","'./snap.css','./data/strokes.json','./data/licenses/KanjiVG-COPYING.txt','./src/stroke-match.js','./src/stroke-bank.js','./src/stroke-pad.js','./src/app.js',")
p.write_text(s)
p=root/'scripts/sync-android.mjs';s=p.read_text()
if "'snap.css'" not in s:s=s.replace("'course.css',","'course.css','snap.css',")
s=s.replace("process.env.KOTOBA_ANDROID_DIR||'../android'","process.env.KOTOBA_ANDROID_DIR||'../kotoba-android'")
if "for(const old of" not in s:s=s.replace("console.log('Android web assets synchronized:',target);","for(const old of ['shape-grader.js','engine.js','handwriting.js','content.js','ink.js'])await rm(path.join(target,'src',old),{force:true});\nconsole.log('Android web assets synchronized:',target);")
p.write_text(s)
