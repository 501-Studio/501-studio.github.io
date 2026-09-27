"""Explicit corrections after transport; preserve behavioral assertions and release gates."""
from pathlib import Path
import hashlib,json,subprocess,zipfile
p=Path('jlpt-quest/tests/release037-browser.py');text=p.read_text()
text=text.replace('p.wait_for_function("document.querySelector', 'p.wait_for_function("()=>document.querySelector')
text=text.replace("p.screenshot(path=str(OUT/'example.png'))", "p.wait_for_timeout(500);check('example sheet is fully visible',p.locator('.sheet').evaluate('(el)=>Number(getComputedStyle(el).opacity)')>.99);check('kana example header is not duplicated',p.locator('.example-headword').inner_text().strip()=='おまわりさん');check('example reading toggle applies to header and sentence',p.evaluate(\"async()=>{const {exampleBody}=await import('./src/examples.js');const w={word:'山',reading:'やま'};return !exampleBody(w,false).includes('<small') && !exampleBody(w,false).includes('example-reading') && exampleBody(w,true).includes('やま');}\"));p.screenshot(path=str(OUT/'example.png'))")
text=text.replace("check('kana grid fits '+str(width),p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))", "check('kana grid fits '+str(width),p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));check('every kana row remains complete '+str(width),p.locator('.kana-letterline strong').evaluate_all('(els)=>els.every(e=>e.scrollWidth<=e.parentElement.clientWidth+1)'))")
p.write_text(text)
k=Path('jlpt-quest/src/kana-ui.js');s=k.read_text()
s=s.replace('<strong lang="ja">${l.title}</strong>','<div class="kana-letterline"><strong lang="ja" data-fit-word data-max-font="23">${l.title}</strong></div>')
s=s.replace('data-script="${s}" class=', 'data-script="${s}" aria-pressed="${s===k.script}" class=')
k.write_text(s)
e=Path('jlpt-quest/src/examples.js');t=e.read_text()
oldhead='${esc(w.word)}<small>${esc(w.reading)}</small>'
newhead='${esc(w.word)}${showReading&&w.reading&&w.reading!==w.word?`<small lang="ja">${esc(w.reading)}</small>`:\'\'}'
assert oldhead in t,'example header changed';e.write_text(t.replace(oldhead,newhead))
css=Path('jlpt-quest/release.css');css.write_text(css.read_text()+'\n.kana-letterline{width:100%;min-width:0;overflow:hidden}.kana-letterline strong{display:block;max-width:100%;white-space:nowrap;line-height:1.5}.kana-tabs button.active{background:#ece6ff;color:#5d47c6;font-weight:700}.example-headword{font-weight:700;margin-bottom:16px}.example-headword small{display:block;font-weight:400;color:#77718b;margin-top:5px}\n')
# Drive the actual public UI. Evaluate booleans inside the WebView rather than
# comparing serialized strings, which Android may return with Unicode escapes.
n=Path('kotoba-android/app/src/androidTest/java/com/studio501/kotoba/LessonRotationTest.java');src=n.read_text()
lines=src.splitlines(keepends=True)
replacement=r'''            js(s,"document.querySelector('[data-action=\"start-course\"][data-id=\"N5-chapter-1\"]').click();true");
            int unknown=0;
            StringBuilder observed=new StringBuilder();
            for(int index=1;index<=30;index++){
                until(s,"!!document.querySelector('.survey-card') && document.querySelector('.session-label>span:last-child').textContent==='"+index+"/30'");
                observed.append(js(s,"document.querySelector('.survey-card .big-japanese strong').textContent.trim()")).append(",");
                boolean mountain="true".equals(js(s,"document.querySelector('.survey-card .big-japanese strong').textContent.trim()==='山'"));
                if(mountain)unknown++;
                js(s,"document.querySelector('[data-action=\""+(mountain?"unknown-word":"known-word")+"\"]').click();true");
            }
            assertEquals("Exactly one unknown target must enter practice; observed="+observed,1,unknown);
            until(s,"!!document.querySelector('[data-action=\"audio-done\"]:not([disabled])')");
            js(s,"document.querySelector('[data-action=\"audio-done\"]').click();true");
'''
found=0
for i,line in enumerate(lines):
    if 'const E=await import' in line and 'n.session=E.createClass' in line:lines[i]=replacement;found+=1
assert found==1,'native fixture changed'
src=''.join(lines).replace('// Create a real current-class state via the same domain engine and IndexedDB.','// Start and classify the actual lesson through its public UI.')
src=src.replace('fail("Condition not satisfied: "+predicate+" result="+last);','fail("Condition not satisfied: "+predicate+" result="+last+" page="+js(s,"JSON.stringify({url:location.href,seedError:document.body.dataset.seedError,body:document.body.innerText.slice(0,2400)})"));')
n.write_text(src)
subprocess.run(['node','scripts/generate-icons.mjs'],cwd='jlpt-quest',check=True)
gate=Path('jlpt-quest/scripts/release-check.mjs');g=gate.read_text()
old="try{const a=await read('../data/audio-coverage.json');if(!a.complete||a.words!==8451)failures.push('Offline audio incomplete');}catch{failures.push('Offline audio evidence missing');}"
new="""try{
 const a=await read('../data/audio-coverage.json'),m=await read('../data/audio-manifest.json');
 const {ALL_KANA}=await import('../src/kana-engine.js');
 const all=[...ALL_KANA];
 for(const l of ['N5','N4','N3','N2','N1'])all.push(...(await read('../data/'+l+'.json')).words);
 if(!a.complete||!m.complete||a.words!==all.length||m.words!==all.length||all.some(w=>!m.clips[w.id]))failures.push('Offline audio incomplete');
 for(const file of new Set(Object.values(m.clips))){const b=await readFile(new URL('../data/audio/'+file,import.meta.url));if(b.length<180||b.subarray(0,4).toString()!=='OggS')throw Error('bad audio');}
}catch{failures.push('Offline audio evidence missing or invalid');}"""
assert old in g,'audio gate baseline changed'
gate.write_text(g.replace(old,new))
paths=json.loads(Path('/tmp/kotoba037-source-paths.json').read_text())
for name in [str(p),str(k),str(css),str(n),str(e),'jlpt-quest/scripts/release-check.mjs','jlpt-quest/icon-192.png','jlpt-quest/icon-512.png']:
    if name not in paths:paths.append(name)
Path('/tmp/kotoba037-source-paths.json').write_text(json.dumps(paths))
out=Path('/tmp/kotoba037-qa');out.mkdir(exist_ok=True)
files=[p for base in ['jlpt-quest','kotoba-android','billing-server','release'] for p in Path(base).rglob('*') if p.is_file() and not any(x in p.parts for x in ['assets','audio','.git','__pycache__','build','.gradle']) and p.suffix not in ['.b64','.pyc','.ttf','.otf','.woff','.woff2','.jks','.keystore','.pem','.key']]
(out/'executed-source-checksums.json').write_text(json.dumps({str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in files},indent=2))
with zipfile.ZipFile(out/'executed-source.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in files:z.write(p,str(p))
(out/'executed-browser037.py').write_text(text)
print('Real native UI fixture; complete kana rows; nonduplicating privacy-respecting example readings. No approval bypass.')
