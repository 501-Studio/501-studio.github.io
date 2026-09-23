import {readFile} from 'node:fs/promises';
const failures=[];let coverage,approval;
try{coverage=JSON.parse(await readFile(new URL('../data/coverage.json',import.meta.url),'utf8'));if(!coverage.allPacksComplete)failures.push('N1~N5 전체팩 미설치');for(const [l,v]of Object.entries(coverage.levels||{}))if(v.english>0)failures.push(`${l} 한국어 미검수/영어 뜻 ${v.english}개`);}catch{failures.push('전체 어휘팩 coverage.json 없음');}
try{approval=JSON.parse(await readFile(new URL('../../release-approval.json',import.meta.url),'utf8'));for(const key of ['physicalDeviceInk','physicalDeviceAudio','offlineRestore','contentEditorialReview','privacyAndDataSafety','signedBundle','closedTesting'])if(approval[key]!==true)failures.push(`출시 검증 미승인: ${key}`);}catch{failures.push('실기기·콘텐츠·개인정보·서명·테스터 검증 승인 없음');}
if(failures.length){console.error('RELEASE BLOCKED\n'+failures.map(x=>' - '+x).join('\n'));process.exitCode=1;}else console.log('Recorded release gates passed. Play Console review is still required.');
