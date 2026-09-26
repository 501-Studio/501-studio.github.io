import {readFile} from 'node:fs/promises';
const failures=[];let coverage,audio,approval,legal;
const root=new URL('../',import.meta.url);
const get=async url=>JSON.parse(await readFile(url,'utf8'));
try{
 coverage=await get(new URL('../data/coverage.json',import.meta.url));
 if(!coverage.allPacksComplete)failures.push('N1~N5 전체팩 미설치');
 for(const [l,v]of Object.entries(coverage.levels||{}))if(v.english>0)failures.push(`${l} 한국어 미검수/영어 뜻 ${v.english}개`);
}catch{failures.push('전체 어휘팩 coverage.json 없음');}
try{
 audio=await get(new URL('../data/audio-coverage.json',import.meta.url));
 if(!audio.complete||audio.words!==(coverage?.levels?Object.values(coverage.levels).reduce((n,v)=>n+v.words,0):audio.words))failures.push('오프라인 음성팩 커버리지 불완전');
}catch{failures.push('오프라인 음성팩 검증 없음');}
try{
 const manifest=await readFile(new URL('../../kotoba-android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
 if(/android\.permission\.INTERNET/.test(manifest))failures.push('Android INTERNET 권한 존재');
 if(/TTS_SERVICE/.test(manifest))failures.push('외부 TTS 서비스 query 존재');
 const gradle=await readFile(new URL('../../kotoba-android/app/build.gradle',import.meta.url),'utf8');
 if(!/targetSdk\s+36/.test(gradle))failures.push('targetSdk 36 아님');
}catch{failures.push('Android 출시 설정 확인 실패');}
try{
 legal=await get(new URL('../release/legal.json',import.meta.url));
 for(const key of ['developerLegalName','supportEmail','privacyContactEmail','publicPrivacyUrl','targetAudience'])if(!legal[key]||String(legal[key]).includes('REQUIRED'))failures.push(`법적 정보 미확정: ${key}`);
 if(legal.publicPrivacyUrl&&!/^https:\/\//.test(legal.publicPrivacyUrl))failures.push('개인정보처리방침 공개 URL은 HTTPS 필요');
}catch{failures.push('release/legal.json 미작성');}
try{
 const privacy=await readFile(new URL('../privacy.html',import.meta.url),'utf8');
 const terms=await readFile(new URL('../terms.html',import.meta.url),'utf8');
 const licenses=await readFile(new URL('../licenses.html',import.meta.url),'utf8');
 if(/출시 전 입력/.test(privacy+terms))failures.push('개인정보처리방침/약관에 출시 전 placeholder 남음');
 for(const term of ['OpenJLPT','KanjiVG','NIT ATR503 M001','CC BY 3.0'])if(!licenses.includes(term))failures.push(`라이선스 고지 누락: ${term}`);
}catch{failures.push('법적/라이선스 문서 누락');}
try{
 approval=await get(new URL('../../release-approval.json',import.meta.url));
 for(const key of ['physicalDeviceInk','physicalDeviceAudio','offlineRestore','accessibility','contentEditorialReview','privacyAndDataSafety','contentRating','storeListing','signedBundle','playAppSigning','closedTesting','legalDocsPublished'])if(approval[key]!==true)failures.push(`출시 검증 미승인: ${key}`);
}catch{failures.push('실기기·콘텐츠·개인정보·서명·테스터 검증 승인 없음');}
if(failures.length){console.error('RELEASE BLOCKED\n'+failures.map(x=>' - '+x).join('\n'));process.exitCode=1;}else console.log('Recorded release gates passed. Play Console review is still required.');
