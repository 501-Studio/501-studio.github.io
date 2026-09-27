"""Explicit corrections after transport; preserve every behavioral assertion."""
from pathlib import Path
import hashlib,json
p=Path('jlpt-quest/tests/release037-browser.py');text=p.read_text()
text=text.replace('p.wait_for_function("document.querySelector', 'p.wait_for_function("()=>document.querySelector')
p.write_text(text)
out=Path('/tmp/kotoba037-qa');out.mkdir(exist_ok=True)
paths=[p for base in ['jlpt-quest/src','jlpt-quest/tests','kotoba-android/app/src'] for p in Path(base).rglob('*') if p.is_file() and 'assets' not in p.parts]
(out/'executed-source-checksums.json').write_text(json.dumps({str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},indent=2))
(out/'executed-browser037.py').write_text(text)
print('CSP-safe QA predicates; no production CSP relaxation.')
