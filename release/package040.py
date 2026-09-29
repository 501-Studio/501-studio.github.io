from pathlib import Path
import hashlib,json,os,shutil,zipfile
W=Path('jlpt-quest');OUT=Path('/tmp/kotoba040-build');QA=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba040-qa'));OUT.mkdir(exist_ok=True)
apk=Path('kotoba-android/app/build/outputs/apk/debug/app-debug.apk');aab=Path('kotoba-android/app/build/outputs/bundle/debug/app-debug.aab')
checked=[]
with zipfile.ZipFile(apk) as z:
 for n in z.namelist():
  if n.startswith('assets/www/') and not n.endswith('/'):
   p=W/n.removeprefix('assets/www/');assert p.is_file() and z.read(n)==p.read_bytes(),n;checked.append(n)
 assert not any(n.endswith('.ogg') for n in z.namelist()),'Bundled audio unexpectedly present'
 for required in ['src/advanced-ui.js','src/learning-policy.js','src/exam-engine.js','data/study040-seed.js','advanced.css']:assert 'assets/www/'+required in checked,required
report={'version':'0.4.0-internal','versionCode':13,'verifiedWebAssets':len(checked),'bundledAudioFiles':0,'productionReleased':False,'physicalVoiceAudibilityVerified':False,'independentLanguageReviewComplete':False,'originalExamItems':100,'originalExampleSentences':206,'apkBytes':apk.stat().st_size,'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'aabSha256':hashlib.sha256(aab.read_bytes()).hexdigest()}
(QA/'package-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
shutil.copyfile(apk,OUT/'kotoba-v0.4.0-internal.apk');shutil.copyfile(aab,OUT/'kotoba-v0.4.0-internal.aab')
with zipfile.ZipFile(OUT/'kotoba-v0.4.0-source.zip','w',zipfile.ZIP_DEFLATED) as z:
 for root in ['jlpt-quest','kotoba-android','billing-server','release/v040']:
  for p in Path(root).rglob('*'):
   if not p.is_file() or any(x in p.parts for x in ['.git','.gradle','build','__pycache__','node_modules','audio']):continue
   if p.suffix.lower() in ['.b64','.pyc','.pem','.key','.jks','.keystore','.ttf','.otf','.woff','.woff2','.ogg'] or p.name in ['local.properties','.env'] or 'assets/www' in str(p):continue
   z.write(p,Path('kotoba-0.4.0')/p)
 for p in [Path('.github/workflows/kotoba-040.yml'),Path('release/finish040.py'),Path('release/apply040.py'),Path('release/package040.py')]:z.write(p,Path('kotoba-0.4.0')/p)
print(json.dumps(report,ensure_ascii=False,indent=2))
