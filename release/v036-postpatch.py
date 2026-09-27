"""Explicit post-transfer QA corrections. Retain all behavioral assertions.
Wait for durable async UI transitions, not an already-present old canvas or audio load.
"""
from pathlib import Path
import hashlib,json
root=Path('jlpt-quest')
test=root/'tests/release036-browser.py'
src=test.read_text()
src=src.replace('import json,os,math','import json,os,math,re')
src=src.replace('import os,json,time,hashlib','import os,json,time,hashlib,re')
src=src.replace("int(page.locator('.pad-practice').inner_text().split('/')[1].split()[0])","int(re.search(r'/\\s*(\\d+)',page.locator('.pad-practice').inner_text()).group(1))")
src=src.replace("page.goto(BASE+'#lesson');page.reload()","page.goto(BASE+'#lesson',wait_until='domcontentloaded');page.reload(wait_until='domcontentloaded')")
# The next canvas exists before the async save finishes. Wait for its new practice number.
src=src.replace("p.wait_for_selector('#ink-canvas');check('second repetition before exam'", "p.wait_for_function(\"()=>document.querySelector('.heading')?.textContent.includes('2/3')\",timeout=10000);check('second repetition before exam'")
src=src.replace("check('third repetition is recall'", "p.wait_for_function(\"()=>document.querySelector('.heading')?.textContent.includes('3/3')\",timeout=10000);check('third repetition is recall'")
test.write_text(src)
evidence=Path('/tmp/kotoba036-qa');evidence.mkdir(exist_ok=True)
(evidence/'executed-browser-test.py').write_text(src)
(evidence/'executed-source-checksums.json').write_text(json.dumps({str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [test,root/'src/app.js',root/'src/stroke-pad.js',root/'release.css']},indent=2))
Path('billing-server/.gitignore').write_text('__pycache__/\n*.pyc\n.env\n*.pem\n*.key\n')
print('Checked executable QA source and recorded hashes.')
