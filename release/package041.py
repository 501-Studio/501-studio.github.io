from pathlib import Path
import hashlib,json,os,shutil,zipfile,xml.etree.ElementTree as ET,re
W=Path('jlpt-quest');OUT=Path('/tmp/kotoba041-build');QA=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba041-qa'));OUT.mkdir(exist_ok=True)
apk=Path('kotoba-android/app/build/outputs/apk/debug/app-debug.apk');aab=Path('kotoba-android/app/build/outputs/bundle/debug/app-debug.aab')
checked=[]
with zipfile.ZipFile(apk) as z:
 for n in z.namelist():
  if n.startswith('assets/www/') and not n.endswith('/'):
   p=W/n.removeprefix('assets/www/');assert p.is_file() and z.read(n)==p.read_bytes(),n;checked.append(n)
 assert not any(n.endswith('.ogg') for n in z.namelist())
 for name in ['src/tutorial.js','src/tutorial-ui.js','tutorial.css']:assert 'assets/www/'+name in checked
reports={}
for p in QA.rglob('checks.json'):
 d=json.loads(p.read_text());assert all(x['pass'] for x in d['checks']) and d['checks'],str(p)
 assert not d.get('errors') and not d.get('console'),str(p)
 reports[p.parent.name]=len(d['checks'])
node=(QA/'node.txt').read_text();passed=int(re.search(r'# pass (\d+)',node).group(1));assert '# fail 0' in node
native=json.loads((QA/'android-run.json').read_text());assert native['testsCompleted'] and native['tests']>=4
units=[ET.parse(p).getroot() for p in Path('kotoba-android/app/build/test-results/testDebugUnitTest').glob('TEST-*.xml')]
assert units and not sum(int(r.get('failures','0'))+int(r.get('errors','0')) for r in units)
report={'version':'0.4.1-internal','versionCode':14,'verifiedWebAssets':len(checked),'bundledAudioFiles':0,'productionReleased':False,'physicalVoiceAudibilityVerified':False,'independentLanguageReviewComplete':False,'nodePass':passed,'browserChecks':reports,'browserTotal':sum(reports.values()),'nativeTests':native['tests'],'nativeUnitTests':sum(int(r.get('tests','0')) for r in units),'apkBytes':apk.stat().st_size,'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'aabSha256':hashlib.sha256(aab.read_bytes()).hexdigest()}
(QA/'package-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
shutil.copyfile(apk,OUT/'kotoba-v0.4.1-internal.apk');shutil.copyfile(aab,OUT/'kotoba-v0.4.1-internal.aab')
with zipfile.ZipFile(OUT/'kotoba-v0.4.1-source.zip','w',zipfile.ZIP_DEFLATED) as z:
 for root in ['jlpt-quest','kotoba-android','billing-server']:
  for p in Path(root).rglob('*'):
   if not p.is_file() or any(x in p.parts for x in ['.git','.gradle','build','__pycache__','node_modules','audio']):continue
   if p.suffix.lower() in ['.b64','.pyc','.pem','.key','.jks','.keystore','.ttf','.otf','.ttc','.woff','.woff2','.ogg'] or p.name in ['local.properties','.env'] or 'assets/www' in str(p):continue
   z.write(p,Path('kotoba-0.4.1')/p)
 for name in ['.github/workflows/kotoba-041.yml','release/tutorial041.py','release/android040-check.py','release/package041.py']:
  p=Path(name);z.write(p,Path('kotoba-0.4.1')/p)
print(json.dumps(report,ensure_ascii=False,indent=2))
