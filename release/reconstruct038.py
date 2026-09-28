"""Reconstruct exact locally tested UTF-8 source; validate every file before writing."""
from pathlib import Path
import base64,gzip,hashlib,json,os
BRANCH='refs/heads/feat/kotoba-038-study-flow'
if 'GITHUB_REF' in os.environ:assert os.environ['GITHUB_REF']==BRANCH
parts=[Path(f'release/study038.part{i}').read_text().strip() for i in [1,2]]
# Repair two identified transport transcription errors before checksum verification.
parts[1]=parts[1].replace('NDBnPT/v++9emjVx/9z//','NDBnPT/v++9emjVx/8z//').replace('SP79V9voMM02m3','SP79V9voM02m3')
raw=base64.b64decode(''.join(parts),validate=True)
assert hashlib.sha256(raw).hexdigest()=='e4aa607865ecd11ddbfb0fc3c70c55e52b174610776b13127cceb17543716bfd','Source transport checksum failed'
payload=gzip.decompress(raw);assert len(payload)<1000000
pack=json.loads(payload);assert pack['format']==1
changes=[]
def sha(s):return hashlib.sha256(s.encode('utf-8')).hexdigest()
for row in pack['files']:
 p=Path(row['path']);assert not p.is_absolute() and '..' not in p.parts
 assert str(p).startswith('jlpt-quest/') or str(p) in ['kotoba-android/app/build.gradle','kotoba-android/app/src/main/java/com/studio501/kotoba/JapaneseSpeech.java']
 old=p.read_text() if p.exists() else ''
 if sha(old)==row['sha256']:continue
 assert sha(old)==row['base'],f'Baseline mismatch: {p}'
 last=0
 for a,b,text in row['edits']:
  assert isinstance(text,str) and last<=a<=b<=len(old);last=b
 new=old
 for a,b,text in reversed(row['edits']):new=new[:a]+text+new[b:]
 assert sha(new)==row['sha256'],f'Output mismatch: {p}'
 changes.append((p,new))
for p,new in changes:p.parent.mkdir(parents=True,exist_ok=True);p.write_text(new)
for i,text in enumerate(parts,1):Path(f'release/study038.part{i}').write_text(text)
Path('/tmp/kotoba038-source-paths.json').write_text(json.dumps([r['path'] for r in pack['files']]+['release/study038.part2']))
print('Verified source files:',len(pack['files']),'materialized:',len(changes))
