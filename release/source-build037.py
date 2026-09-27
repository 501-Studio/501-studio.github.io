"""Install a deterministic build entry point that validates the distributed assets.
Regeneration is explicit. A routine build never retranslates editorial content or
replaces new neural speech with an older voice.
"""
from pathlib import Path
import json
root=Path('jlpt-quest');p=root/'package.json';package=json.loads(p.read_text())
package['scripts']['build']='npm run icons:build && node scripts/verify-bundled-assets.mjs'
package['scripts']['audio:build']='node scripts/verify-bundled-assets.mjs'
p.write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n')
validator=r'''import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {ALL_KANA} from '../src/kana-engine.js';
import {writingChars} from '../src/catalog.js';
const data=new URL('../data/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,data),'utf8'));
const levels=['N5','N4','N3','N2','N1'];
const words=(await Promise.all(levels.map(async level=>(await read(level+'.json')).words))).flat();
assert.equal(words.length,8451,'Complete JLPT catalogue required');
assert.equal(ALL_KANA.length,162,'Complete beginner kana catalogue required');
assert(words.every(w=>w.language==='ko'&&w.meaning.trim()),'Korean display meanings required');
const manifest=await read('audio-manifest.json'),coverage=await read('audio-coverage.json');
assert.equal(manifest.generator,'Kokoro-82M v1.0','Refuse a legacy voice downgrade');
assert.equal(manifest.voice,'jf_alpha');assert.equal(manifest.complete,true);assert.equal(coverage.complete,true);
const all=[...words,...ALL_KANA],names=new Set(Object.values(manifest.clips));
assert.equal(manifest.words,all.length);assert.equal(coverage.words,all.length);
assert(all.every(w=>manifest.clips[w.id]),'An offline pronunciation is missing');
assert.equal(names.size,7050);assert.equal(coverage.records.length,names.size);
const files=await readdir(new URL('audio/',data));
assert.equal(files.filter(f=>f.endsWith('.ogg')).length,names.size);
for(const r of coverage.records){
 assert(names.has(r.file));assert(/^[a-f0-9]{24}\.ogg$/.test(r.file));
 const b=await readFile(new URL('audio/'+r.file,data));assert.equal(b.subarray(0,4).toString(),'OggS');
 assert.equal(createHash('sha256').update(b).digest('hex'),r.sha256,r.file);
}
const bank=await read('strokes.json');
for(const w of all)for(const ch of writingChars(w))assert(bank.characters[ch]?.length,'Missing stroke data: '+ch);
const examples=await read('examples.json');assert.equal(examples.entries.length,164);
assert(examples.entries.every(e=>e.ja&&e.ko&&e.reading&&e.source));
for(const name of ['Kokoro-Apache-2.0.txt','KanjiVG-COPYING.txt'])assert((await readFile(new URL('licenses/'+name,data))).length>100);
console.log(JSON.stringify({valid:true,jlpt:words.length,kana:ALL_KANA.length,audio:names.size,examples:examples.entries.length,networkFetches:0}));
'''
(root/'scripts/verify-bundled-assets.mjs').write_text(validator)
testfile=root/'tests/release037.test.mjs'
testfile.write_text(testfile.read_text()+'''\nimport {execFileSync} from 'node:child_process';
test('standard source build validates all bundled neural assets without replacing content',()=>{
 const output=execFileSync(process.execPath,['scripts/verify-bundled-assets.mjs'],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
 const report=JSON.parse(output.trim());assert.equal(report.valid,true);assert.equal(report.audio,7050);assert.equal(report.kana,162);assert.equal(report.networkFetches,0);
});
''')
(root/'BUILD-037.md').write_text('''# 코토바 0.3.7 내부 빌드

## 전체 소스 ZIP에서 재빌드

Node.js 22+, Python 3.11+, JDK 17, Gradle 8.13, Android SDK 36 / build-tools 36.0.0 환경을 사용합니다.

```sh
cd jlpt-quest
npm run build
npm test
npm run android:sync
cd ../kotoba-android
gradle --no-daemon assembleDebug bundleDebug testDebugUnitTest lintDebug
```

전체 ZIP에는 한국어 어휘, 가나 획, 예문과 7,050개의 새 발음 파일이 들어 있습니다. 일반 build는 이 파일의 무결성만 검사하며, 영어 뜻이나 이전 HTS 음성으로 바꾸지 않습니다. 구형 build-offline-audio.py는 이전 버전 참고 자료이며 이 버전의 빌드 경로에서 사용하지 않습니다.

GitHub에는 대용량 음성 파일을 중복 커밋하지 않습니다. GitHub 소스로 작업할 때는 검증된 neural-audio Actions artifact를 먼저 복원해야 합니다. 단어/예문/음원 재생성은 일반 앱 빌드와 별도 작업입니다.

## 설치 서명

CI debug 인증서는 실행 환경에 따라 달라질 수 있습니다. 기존 앱의 서명과 다른 APK는 덮어쓸 수 없습니다. 기록을 백업한 뒤 설치해야 합니다. 정식 배포 전에는 운영자가 관리하는 업로드 키와 Play App Signing을 설정해야 합니다. 개인 키는 이 ZIP에 포함하지 않습니다.

## 출시 상태

이 문서는 Play 심사 통과 또는 출시 승인을 의미하지 않습니다. 운영 상품·광고 ID, 서버, 법적 문서, 스토어 설정과 실제 기기 QA/콘텐츠 검수는 release 체크에서 별도로 확인합니다. 미완료 승인 조건을 자동으로 참으로 바꾸지 않습니다.
''',encoding='utf8')
paths=json.loads(Path('/tmp/kotoba037-source-paths.json').read_text())
for name in ['jlpt-quest/package.json','jlpt-quest/scripts/verify-bundled-assets.mjs','jlpt-quest/tests/release037.test.mjs','jlpt-quest/BUILD-037.md']:
 if name not in paths:paths.append(name)
Path('/tmp/kotoba037-source-paths.json').write_text(json.dumps(paths))
print('Standard build now validates the actual distributed 0.3.7 assets, without regeneration or downgrade.')
