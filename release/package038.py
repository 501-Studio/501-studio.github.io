from pathlib import Path
import json,zipfile,hashlib,shutil,os
w=Path('jlpt-quest');out=Path('/tmp/kotoba038-build');out.mkdir(exist_ok=True)
apk=Path('kotoba-android/app/build/outputs/apk/debug/app-debug.apk');aab=Path('kotoba-android/app/build/outputs/bundle/debug/app-debug.aab');checked=[]
with zipfile.ZipFile(apk) as z:
 for n in z.namelist():
  if n.startswith('assets/www/') and not n.endswith('/'):
   p=w/n.removeprefix('assets/www/');assert p.is_file() and z.read(n)==p.read_bytes(),n;checked.append(n)
coverage=json.loads((w/'data/example-coverage.json').read_text())
report={'version':'0.3.8-internal','versionCode':11,'apkBytes':apk.stat().st_size,'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'aabBytes':aab.stat().st_size,'aabSha256':hashlib.sha256(aab.read_bytes()).hexdigest(),'byteIdenticalWebAssets':len(checked),'audioClips':len(list((w/'data/audio').glob('*.ogg'))),'examples':coverage,'productionReleased':False,'physicalDeviceAudioVerified':False,'signing':'Ephemeral internal debug key; back up records before attempting an update'}
(Path(os.environ['KOTOBA_EVIDENCE_DIR'])/'package-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
shutil.copyfile(apk,out/'kotoba-v0.3.8-internal.apk');shutil.copyfile(aab,out/'kotoba-v0.3.8-internal.aab')
with zipfile.ZipFile(out/'kotoba-v0.3.8-source.zip','w',zipfile.ZIP_DEFLATED) as z:
 for base in ['jlpt-quest','kotoba-android','billing-server','release','.github/workflows']:
  for p in Path(base).rglob('*'):
   if not p.is_file() or any(x in p.parts for x in ['.git','.gradle','build','__pycache__','node_modules']):continue
   if p.suffix in ['.b64','.pyc','.pem','.key','.jks','.keystore','.ttf','.otf','.woff','.woff2'] or p.name in ['local.properties','.env'] or 'assets/www' in str(p):continue
   z.write(p,Path('kotoba-0.3.8')/p)
print(json.dumps(report,ensure_ascii=False,indent=2))
