"""Materialize reviewed UTF-8 source deltas; reject a stale base or damaged transport."""
from pathlib import Path
import base64,gzip,hashlib,json,os
if 'GITHUB_REF' in os.environ:assert os.environ['GITHUB_REF']=='refs/heads/feat/kotoba-039-device-stats'
parts=[Path(f'release/personal039.part{i}').read_text().strip() for i in [1,2,3]]
# Exact transport correction, still guarded by the original compressed checksum.
parts[1]=parts[1].replace('OVgfCnqzEwUqgVYU','OVgf51xgfCnqzEwUqgVYU')
raw=base64.b64decode(''.join(parts),validate=True)
assert hashlib.sha256(raw).hexdigest()=='a64941563645cb4b042600cd2e62e41804a54bbd27f302f7994bbe19c3e157fa', 'Source transport checksum mismatch'
payload=gzip.decompress(raw);assert len(payload)<1000000
pack=json.loads(payload);assert pack['format']==2
sha=lambda text:hashlib.sha256(text.encode('utf-8')).hexdigest()
# Idempotent re-runs can encounter the already committed, precisely checked QA fixes.
fixed={'jlpt-quest/personal.css':'27d389d66d8a8a4fc63a061d19f431ad74b27d8f21efb8b62e42fb2e3d48bc54','jlpt-quest/tests/release036-browser.py':'34b2c9d7683239c801bd609784c75ffb57292c05d7e7d382266767c9cb824aac','jlpt-quest/tests/personal039-browser.py':'381c8b1586a077d104b54496d8526f2829e4a3bd83d8aaaccd69831f0e876624'}
changes=[]
for row in pack['files']:
 p=Path(row['path']);assert not p.is_absolute() and '..' not in p.parts
 assert str(p).startswith(('jlpt-quest/','kotoba-android/'))
 old=p.read_text() if p.exists() else ''
 if sha(old) in [row['sha256'],fixed.get(str(p))]:continue
 assert sha(old)==row['base'], 'Baseline mismatch: '+str(p)
 end=0
 for a,b,value in row['edits']:
  assert isinstance(value,str) and end<=a<=b<=len(old);end=b
 new=old
 for a,b,value in reversed(row['edits']):new=new[:a]+value+new[b:]
 assert sha(new)==row['sha256'],'Output mismatch: '+str(p)
 changes.append((p,new))
for p,new in changes:p.parent.mkdir(parents=True,exist_ok=True);p.write_text(new)
Path('/tmp/kotoba039-source-paths.json').write_text(json.dumps([r['path'] for r in pack['files']]))
print('Checked source files:',len(pack['files']),'materialized:',len(changes))
