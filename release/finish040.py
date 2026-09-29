"""Explicit, idempotent 0.4 source corrections. No user records are touched."""
from pathlib import Path
r=Path('jlpt-quest')
p=r/'src/example-quality.js';s=p.read_text().replace("['N4','頼む'","['N5','頼む'")
s=s.replace("register:['N1','N2'].includes(row.level)?'문어·격식':'일상',koTargets:[row.meaning]", "register:'학습 용례',koTargets:[row.meaning.replace(/(하다|되다|함)$/,'')]")
s=s.replace("register:'일상'});}","register:'일상',koTargets:surface==='頼んだ'?[sense==='부탁하다'?'부탁했다':'주문했다']:surface==='聞きました'?['물었습니다']:sense==='돌보다'?['돌봅니다']:sense==='듣다'?['듣는']:['봅니다']});}")
p.write_text(s)
p=r/'src/playlist.js';s=p.read_text().replace("current=null,options={};","current=null,options={},speechTimer=null;")
s=s.replace("const timeout=setTimeout(","const timeout=speechTimer=setTimeout(")
s=s.replace("function stopBrowser(){generation++;","function stopBrowser(){clearTimeout(speechTimer);generation++;")
s=s.replace("if('mediaSession'in navigator){navigator.mediaSession.metadata=", "if('mediaSession'in navigator&&typeof MediaMetadata==='function'){navigator.mediaSession.metadata=")
p.write_text(s)
p=r/'src/examples.js';s=p.read_text()
s=s.replace('<p class="example-meta">${esc(meta.sense)}', '<p class="example-meta">${e.tier?(e.tier===\'easy\'?\'쉬운 문장\':\'자연스러운 문장\')+\' · \':\'\'}${esc(meta.sense)}')
p.write_text(s)
p=r/'src/app.js';s=p.read_text()
s=s.replace("if(a==='practice-character'&&p.ink){const i=Number(el.dataset.index);if(Number.isInteger(i)&&i>=0&&i<p.ink.characters.length)p.ink.active=i;}","if(a==='practice-character'&&p.ink){const i=Number(el.dataset.index),first=p.ink.results.findIndex(x=>!x);if(Number.isInteger(i)&&i>=0&&i<p.ink.characters.length&&(first<0||i<=first))p.ink.active=i;}")
p.write_text(s)
p=r/'src/learning-policy.js';s=p.read_text()
s=s.replace("if(!correct||same||early){result.intervalMs=previous.intervalMs??Math.max(0,base.due-(base.lastAt||now));return result;}","if(!correct){result.intervalMs=600000;return result;}\n if(same||early){result.intervalMs=previous.intervalMs??Math.max(0,base.due-(base.lastAt||now));return result;}")
p.write_text(s)
# Tests use literal setup branches rather than new Function, leaving app CSP intact.
p=r/'tests/advanced040-browser.py';s=p.read_text()
start=s.index('def fixture(');end=s.index('def click(',start)
s=s[:start]+'''def fixture(p,body,route='home'):
 mode='history' if 's.suspendedSession=' in body else 'writing'
 p.evaluate("""async mode=>{const E=await import('./src/course-engine.js'),S=await import('./src/storage.js'),C=await import('./src/catalog.js');const old=await S.loadState(),s=E.fresh(),all=(await Promise.all(['N5','N4','N3','N2','N1'].map(l=>fetch('./data/'+l+'.json').then(r=>r.json())))).flatMap(p=>p.words);const w=all.find(x=>x.word==='学校'&&x.level==='N5');if(mode==='writing'){s.session=E.createTargetReview(s,all,[{wordId:w.id,skill:'writing'}],{label:'쓰기 검증'});s.uiRoute='lesson';}else{s.session=E.createClass(s,C.courses(all,'N5')[0],all);s.memory[E.keyOf(w.id,'writing')]={stage:1,due:Date.now()+86400000,lapses:4,successes:3,consecutive:2,lastAt:Date.now()-86400000,lastSession:'old',method:'stroke-snap',recent:[0,0,1,1],independentFailures:4};s.suspendedSession=E.createTargetReview(s,all,[{wordId:w.id,skill:'meaning'}],{label:'이전 복습'});s.encountered[w.id]=Date.now();s.study.strokes['学']=[{attempts:3,misses:2}];}await S.commit(s,old.revision);}""",mode)
 navigate(p,route)
''' + s[end:]
p.write_text(s)
p=Path('kotoba-android/app/src/androidTest/java/com/studio501/kotoba/LessonRotationTest.java');s=p.read_text()
old='''            // Classification saves asynchronously. Wait for the real next screen before seeding.
            until(s,"!!document.querySelector('[data-action=\\"audio-done\\"]')");'''
new='''            // Very first training phase now shows the word before pronunciation.
            until(s,"!!document.querySelector('[data-action=\\"studied\\"]')");
            js(s,"document.querySelector('[data-action=\\"studied\\"]').click();true");
            until(s,"!!document.querySelector('[data-action=\\"audio-done\\"]')");'''
if new not in s:
 assert old in s,'Lifecycle fixture marker missing';s=s.replace(old,new)
p.write_text(s)
