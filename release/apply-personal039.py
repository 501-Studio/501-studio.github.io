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
changes=[]
for row in pack['files']:
 p=Path(row['path']);assert not p.is_absolute() and '..' not in p.parts
 assert str(p).startswith(('jlpt-quest/','kotoba-android/'))
 old=p.read_text() if p.exists() else ''
 if sha(old)==row['sha256']:continue
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
