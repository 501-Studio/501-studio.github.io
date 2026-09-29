"""One-time source integration only. Normal later builds use committed source directly.
All files are checked before any are written. No user data or executable payload is loaded.
"""
from pathlib import Path
import hashlib,json,os
if 'GITHUB_REF' in os.environ:assert os.environ['GITHUB_REF']=='refs/heads/feat/kotoba-040-learning-suite'
stamp=Path('release/v040/source-applied.json')
if stamp.exists():
 print('Using committed source; reconstruction is not repeated.')
 raise SystemExit(0)
changes=[];seen=set()
def sha(s):return hashlib.sha256(s.encode('utf-8')).hexdigest()
for descriptor in ['app-edits.json','engine-edits.json','support-edits.json']:
 pack=json.loads((Path('release/v040')/descriptor).read_text())
 assert pack['format']==1
 for row in pack['files']:
  path=Path(row['path']);assert not path.is_absolute() and '..' not in path.parts
  assert str(path).startswith(('jlpt-quest/','kotoba-android/')) and str(path) not in seen
  seen.add(str(path));old=path.read_text()
  if sha(old)==row['sha256']:continue
  assert sha(old)==row['base'],f'Stale source: {path}'
  last=0
  for start,end,content in row['edits']:
   assert isinstance(content,str) and last<=start<=end<=len(old)
   last=end
  new=old
  for start,end,content in reversed(row['edits']):new=new[:start]+content+new[end:]
  assert sha(new)==row['sha256'],f'Transport mismatch: {path}'
  changes.append((path,new))
for path,new in changes:path.write_text(new)
stamp.write_text(json.dumps({'version':'0.4.0','base':'e2501b5a5a16a654e4fac05b9246f044fcd6aaac','integratedFiles':sorted(seen),'nextBuild':'Use committed source, npm test, android:sync, Gradle.'},indent=2))
print('Validated',len(seen),'files; integrated',len(changes))
