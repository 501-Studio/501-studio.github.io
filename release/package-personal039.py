"""Package internal build only; never modify production signing or release approvals."""
from pathlib import Path
import json,zipfile,hashlib,shutil,os
W=Path('jlpt-quest');OUT=Path('/tmp/kotoba039-build');OUT.mkdir(exist_ok=True)
QA=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba039-qa'));QA.mkdir(exist_ok=True)
apk=Path('kotoba-android/app/build/outputs/apk/debug/app-debug.apk');aab=Path('kotoba-android/app/build/outputs/bundle/debug/app-debug.aab')
checked=[]
with zipfile.ZipFile(apk) as z:
 assert not any(n.endswith('.ogg') or '/data/audio/' in n or n.endswith('audio-manifest.json') for n in z.namelist()), 'Device-only APK contains prerecorded audio'
 for n in z.namelist():
  if n.startswith('assets/www/') and not n.endswith('/'):
   source=W/n.removeprefix('assets/www/');assert source.is_file() and source.read_bytes()==z.read(n),n;checked.append(n)
 assert z.read('assets/www/personal.css')==Path('jlpt-quest/personal.css').read_bytes()
 assert b'word-practice.js' in z.read('assets/www/src/course-engine.js')
coverage=json.loads((W/'data/example-coverage.json').read_text())
report={'version':'0.3.9-internal','versionCode':12,'apkBytes':apk.stat().st_size,'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'aabBytes':aab.stat().st_size,'aabSha256':hashlib.sha256(aab.read_bytes()).hexdigest(),'byteIdenticalWebAssets':len(checked),'bundledAudioClips':0,'audioMode':'installed Japanese device TTS only','words':coverage['totalWords'],'physicalDeviceAudioVerified':False,'productionReleased':False,'signing':'ephemeral debug signing key; back up existing records before installing'}
(QA/'package-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
shutil.copyfile(apk,OUT/'kotoba-v0.3.9-internal.apk');shutil.copyfile(aab,OUT/'kotoba-v0.3.9-internal.aab')
with zipfile.ZipFile(OUT/'kotoba-v0.3.9-source.zip','w',zipfile.ZIP_DEFLATED) as z:
 for base in ['jlpt-quest','kotoba-android','billing-server']:
  for p in Path(base).rglob('*'):
   if not p.is_file() or any(s in p.parts for s in ['.git','.gradle','build','__pycache__','node_modules']):continue
   if p.suffix in ['.b64','.pyc','.pem','.key','.jks','.keystore','.ttf','.otf','.woff','.woff2','.ogg'] or p.name in ['local.properties','.env','audio-manifest.json','audio-coverage.json'] or 'assets/www' in str(p):continue
   z.write(p,Path('kotoba-0.3.9')/p)
 for name in ['.github/workflows/kotoba-039-device.yml','release/apply-personal039.py','release/package-personal039.py']:
  z.write(name,Path('kotoba-0.3.9')/name)
print(json.dumps(report,ensure_ascii=False,indent=2))
