"""Apply explicit, idempotent 0.3.8 source changes; all tests/gates stay enabled."""
from pathlib import Path
import json
W=Path('jlpt-quest')
def replace(path,old,new):
 p=Path(path);s=p.read_text()
 if new in s:return
 assert old in s,str(p)+' expected source not found'
 p.write_text(s.replace(old,new))

p=W/'src/catalog.js';s=p.read_text()
if "./reading-corrections.js" not in s:s="import {applyReadingCorrection,isCorrectedStableId} from './reading-corrections.js';\n"+s
s=s.replace('return {level,words,quarantine,merged,supplemental,sourceRows:', 'return {level,words:words.map(applyReadingCorrection),quarantine,merged,supplemental,sourceRows:')
s=s.replace('w.id!==idFor(w.level,w.word,w.reading)||ids.has(w.id)', '(w.id!==idFor(w.level,w.word,w.reading)&&!isCorrectedStableId(w))||ids.has(w.id)')
p.write_text(s)
fixes={'N5-cgfly3':('十','じゅう とお','じゅう',['とお']),'N3-1b97nrt':('とん','(1000','とん',[]),'N3-1d6ofkx':('賛成','Uӣ[い','さんせい',[])}
changed=[]
for level in ['N5','N4','N3','N2','N1']:
 p=W/'data'/(level+'.json');pack=json.loads(p.read_text());edited=False
 for w in pack['words']:
  if w['id'] in fixes:
   word,old,reading,alternatives=fixes[w['id']]
   assert w['word']==word and w['reading'] in [old,reading]
   w.update(reading=reading,sourceReading=old,alternateReadings=alternatives,readingRevision=1);edited=True
   changed.append({'id':w['id'],'word':word,'old':old,'reading':reading,'alternateReadings':alternatives})
 if edited:p.write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':')))
assert len(changed)==3
(W/'data/reading-corrections.json').write_text(json.dumps({'version':1,'stableIdsPreserved':True,'corrections':changed},ensure_ascii=False,indent=2))
replace(W/'src/app.js',"import {speak,stopAudio} from './audio.js';","import {speak,stopAudio,audioGeneration} from './audio.js';")
replace(W/'src/app.js',"state.session.autoPlayedTask=t.id;save();setTimeout(()=>{if(route()==='lesson'&&current(state.session)?.id===t.id&&!state.session.heard)play(false,null,true);},90);","state.session.autoPlayedTask=t.id;const autoGeneration=audioGeneration();save();setTimeout(()=>{if(audioGeneration()===autoGeneration&&route()==='lesson'&&current(state.session)?.id===t.id&&!state.session.heard)play(false,null,true);},90);")
replace(W/'src/kana-ui.js',"import {speak,stopAudio} from './audio.js';","import {speak,stopAudio,audioGeneration} from './audio.js';")
replace(W/'src/kana-ui.js',"if(!s.autoPlayed){s.autoPlayed=true;save();setTimeout(()=>{if(!dead)speak(","if(!s.autoPlayed){s.autoPlayed=true;const autoGeneration=audioGeneration();save();setTimeout(()=>{if(!dead&&audioGeneration()===autoGeneration)speak(")
replace(W/'src/course-engine.js',"w.language===word.language&&w[field]!==word[field]","w.language===word.language&&w[field]!==word[field]&&(skill!=='listening'||w.reading!==word.reading)")
p=W/'package.json';package=json.loads(p.read_text());package['version']='0.3.8'
for name in ['tests/release038.test.mjs','tests/audio-runtime038.test.mjs']:
 if name not in package['scripts']['test']:package['scripts']['test']+=' '+name
p.write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n')
replace('kotoba-android/app/build.gradle','versionCode 10','versionCode 11')
replace('kotoba-android/app/build.gradle',"versionName '0.3.7'","versionName '0.3.8'")
p=W/'sw.js';s=p.read_text().replace('kotoba-course-0.3.7','kotoba-course-0.3.8')
if './src/reading-corrections.js' not in s:s=s.replace("'./src/catalog.js'","'./src/catalog.js','./src/reading-corrections.js'")
p.write_text(s)
p=W/'scripts/verify-bundled-assets.mjs';s=p.read_text();marker="assert.equal(manifest.generator,'Kokoro-82M v1.0'"
if 'Audited pronunciation manifest required' not in s:
 pos=s.index(marker);s=s[:pos]+"assert.equal(manifest.version,3,'Audited pronunciation manifest required');\nassert.equal(manifest.audioRevision,'038-phonetic-audit-v1');\nassert(words.every(w=>/^[ぁ-ゖァ-ヶー]+$/.test(w.reading)),'Invalid reading');\n"+s[pos:]
 s=s.replace("assert(all.every(w=>manifest.clips[w.id]),'An offline pronunciation is missing');","assert(all.every(w=>manifest.clips[w.id]&&/^[ァ-ヶー]+$/.test(manifest.speechTexts[w.id])),'An audited offline pronunciation is missing');")
p.write_text(s)
p=W/'scripts/release-check.mjs';s=p.read_text()
if 'Native-speaker pronunciation review remains pending' not in s:
 pos=s.index('const required=')
 s=s[:pos]+"try{const audit=await read('../data/audio-audit-summary.json');if(audit.independentNativeReview!==true)failures.push('Native-speaker pronunciation review remains pending');}catch{failures.push('Full audio audit missing');}\n"+s[pos:]
p.write_text(s)
p=W/'CONTENT-LICENSE.md';s=p.read_text()
if '0.3.8 audio audit' not in s:s+='\n\n## 0.3.8 audio audit\n\nAll 7,050 clips were rebuilt using declared kana readings and phoneme validation rather than trusting morphology for isolated hiragana. Three malformed source readings were corrected without changing vocabulary IDs. Mastering uses 24 kHz synthesis and 64 kbps Opus. Kokoro-82M/jf_alpha remains Apache-2.0; Misaki/Cutlet MIT attribution remains applicable. No Google voice files are copied or redistributed. Independent ASR is an automated diagnostic, not native-speaker or pitch-accent certification. Unresolved screening results remain in the audit CSV and production still requires editorial approval.\n'
p.write_text(s)
print('0.3.8 source integration applied; stable reading repairs:',changed)
