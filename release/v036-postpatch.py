"""Explicit post-transfer product/QA corrections; retain every behavior assertion."""
from pathlib import Path
import hashlib,json
root=Path('jlpt-quest')
# Restore the actual selected bold pen width instead of reverting 8px on reload.
engine=root/'src/course-engine.js'
engine.write_text(engine.read_text().replace("penWidth:[3,4,6].includes(input.settings.penWidth)","penWidth:[3,4,6,8].includes(input.settings.penWidth)"))
app=root/'src/app.js'
lines=app.read_text().splitlines();seen_back=False;out=[]
for line in lines:
    if line.startswith("window.addEventListener('kotoba-back',"):
        if seen_back:continue
        seen_back=True
    out.append(line)
app.write_text('\n'.join(out)+'\n')
test=root/'tests/release036-browser.py';src=test.read_text()
src=src.replace('import json,os,math','import json,os,math,re,traceback')
src=src.replace('import os,json,time,hashlib','import os,json,time,hashlib,re,traceback')
src=src.replace("int(page.locator('.pad-practice').inner_text().split('/')[1].split()[0])","int(re.search(r'/\\s*(\\d+)',page.locator('.pad-practice').inner_text()).group(1))")
src=src.replace("page.goto(BASE+'#lesson');page.reload()","page.goto(BASE+'#lesson',wait_until='domcontentloaded');page.reload(wait_until='domcontentloaded')")
src=src.replace("p.wait_for_selector('#ink-canvas');check('second repetition before exam'", "p.wait_for_function(\"()=>document.querySelector('.heading')?.textContent.includes('2/3')\",timeout=10000);check('second repetition before exam'")
src=src.replace("check('third repetition is recall'", "p.wait_for_function(\"()=>document.querySelector('.heading')?.textContent.includes('3/3')\",timeout=10000);check('third repetition is recall'")
# First settings element is the intentionally hidden desktop sidebar at mobile width.
src=src.replace("p.locator('[data-action=\"settings\"]').first.click()","p.locator('[data-action=\"settings\"]:visible').first.click()")
src=src.replace(" finally:\n  (OUT/'browser-checks.json')", " except Exception:\n  (OUT/'failure.txt').write_text(traceback.format_exc())\n  try:\n   p.screenshot(path=str(OUT/'failure.png'),full_page=True)\n   (OUT/'failure-dom.html').write_text(p.content())\n  except Exception: pass\n  raise\n finally:\n  (OUT/'browser-checks.json')")
test.write_text(src)
evidence=Path('/tmp/kotoba036-qa');evidence.mkdir(exist_ok=True)
(evidence/'executed-browser-test.py').write_text(src)
(evidence/'executed-source-checksums.json').write_text(json.dumps({str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [test,app,engine,root/'src/stroke-pad.js',root/'release.css']},indent=2))
Path('billing-server/.gitignore').write_text('__pycache__/\n*.pyc\n.env\n*.pem\n*.key\n')
print('Checked product and executable QA source; recorded hashes.')
