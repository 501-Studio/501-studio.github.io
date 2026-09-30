from pathlib import Path
import hashlib,json,os,re,shutil,subprocess,zipfile,xml.etree.ElementTree as ET
W=Path('jlpt-quest');OUT=Path('/tmp/kotoba041-build');QA=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba041-qa'));OUT.mkdir(exist_ok=True)
apk=Path('kotoba-android/app/build/outputs/apk/debug/app-debug.apk');aab=Path('kotoba-android/app/build/outputs/bundle/debug/app-debug.aab');checked=[]
assert "versionCode 14" in Path('kotoba-android/app/build.gradle').read_text()
assert "versionName '0.4.1'" in Path('kotoba-android/app/build.gradle').read_text()
with zipfile.ZipFile(apk) as z:
 for n in z.namelist():
  if n.startswith('assets/www/') and not n.endswith('/'):
   p=W/n.removeprefix('assets/www/');assert p.is_file() and z.read(n)==p.read_bytes(),n;checked.append(n)
 assert not any(n.endswith('.ogg') for n in z.namelist())
 for f in ['src/tutorial.js','src/tutorial-state.js','tutorial.css','src/app.js','data/study040-seed.js']:
  assert 'assets/www/'+f in checked,f
report={'version':'0.4.1-internal','versionCode':14,'inputCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'verifiedWebAssets':len(checked),'bundledAudioFiles':0,'productionReleased':False,'physicalVoiceAudibilityVerified':False,'independentLanguageReviewComplete':False,'apkBytes':apk.stat().st_size,'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'aabSha256':hashlib.sha256(aab.read_bytes()).hexdigest()}
(QA/'package-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
shutil.copyfile(apk,OUT/'kotoba-v0.4.1-internal.apk');shutil.copyfile(aab,OUT/'kotoba-v0.4.1-internal.aab')
with zipfile.ZipFile(OUT/'kotoba-v0.4.1-source.zip','w',zipfile.ZIP_DEFLATED) as z:
 for root in ['jlpt-quest','kotoba-android','billing-server']:
  for p in Path(root).rglob('*'):
   if not p.is_file() or any(x in p.parts for x in ['.git','.gradle','build','__pycache__','node_modules','audio']):continue
   if p.suffix.lower() in ['.b64','.pyc','.pem','.key','.jks','.keystore','.ttf','.otf','.ttc','.woff','.woff2','.ogg'] or p.name in ['local.properties','.env'] or 'assets/www' in str(p):continue
   z.write(p,Path('kotoba-0.4.1')/p)
 for n in ['.github/workflows/kotoba-041.yml','release/tutorial041.py','release/tutorial041-tests.py','release/android040-check.py','release/package041.py']:
  z.write(n,Path('kotoba-0.4.1')/n)
# Summarize actual evidence, not a hard-coded expected pass count.
summary={'browserSuites':[],'node':{},'android':{},'package':report}
node=(QA/'node.txt').read_text()
for name in ['tests','pass','fail','skipped']:
 found=re.findall(r'^# '+name+r' (\d+)',node,re.M)
 if found:summary['node'][name]=int(found[-1])
for p in QA.rglob('*.json'):
 try:data=json.loads(p.read_text())
 except (ValueError,UnicodeError):continue
 if isinstance(data,dict) and isinstance(data.get('checks'),list):
  checks=data['checks'];summary['browserSuites'].append({'file':str(p.relative_to(QA)),'checks':len(checks),'passed':sum(bool(x.get('pass')) for x in checks),'errors':data.get('errors',[]),'console':data.get('console',[])})
for key,base in [('unit','kotoba-android/app/build/test-results/testDebugUnitTest'),('instrumentation','kotoba-android/app/build/outputs/androidTest-results/connected')]:
 suites=[ET.parse(p).getroot() for p in Path(base).rglob('TEST-*.xml')]
 summary['android'][key]={field:sum(int(s.get(field,'0')) for s in suites) for field in ['tests','failures','errors','skipped']}
(QA/'verification-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2))
