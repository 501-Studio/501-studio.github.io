import {readFile} from 'node:fs/promises';
const failures=[];const read=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
try{const c=await read('../data/coverage.json');if(!c.allPacksComplete)failures.push('Vocabulary coverage incomplete');for(const [l,v]of Object.entries(c.levels))if(v.english!==0)failures.push(l+': English meanings remain');}catch{failures.push('Vocabulary evidence missing');}
try{const a=await read('../editorial/audit.json');if(!a.semanticReviewComplete)failures.push(`Semantic review incomplete: ${a.remainingSemanticReview}/${a.total} still pending`);}catch{failures.push('Editorial audit missing');}
try{
 const a=await read('../data/audio-coverage.json'),m=await read('../data/audio-manifest.json');
 const {ALL_KANA}=await import('../src/kana-engine.js');
 const all=[...ALL_KANA];
 for(const l of ['N5','N4','N3','N2','N1'])all.push(...(await read('../data/'+l+'.json')).words);
 if(!a.complete||!m.complete||a.words!==all.length||m.words!==all.length||all.some(w=>!m.clips[w.id]))failures.push('Offline audio incomplete');
 for(const file of new Set(Object.values(m.clips))){const b=await readFile(new URL('../data/audio/'+file,import.meta.url));if(b.length<180||b.subarray(0,4).toString()!=='OggS')throw Error('bad audio');}
}catch{failures.push('Offline audio evidence missing or invalid');}
const required=['physicalDeviceInk','physicalDeviceAudio','offlineRestore','accessibility','contentEditorialReview','privacyAndDataSafety','contentRating','storeListing','signedBundle','playAppSigning','closedTesting','legalDocsPublished','billingSandbox','consentAndAdFree','rtdnAndRefunds'];
try{const a=await read('../../release-approval.json');for(const k of required)if(a[k]!==true)failures.push('Unapproved: '+k);}catch{failures.push('Release approval not recorded');}
try{const l=await read('../release/legal.json');for(const k of ['developerLegalName','supportEmail','publicPrivacyUrl','targetAudience'])if(!l[k]||String(l[k]).includes('REQUIRED'))failures.push('Legal field not confirmed: '+k);}catch{failures.push('Actual legal metadata not supplied');}
for(const k of ['ADMOB_APP_ID','ADMOB_BANNER_ID','ADMOB_INTERSTITIAL_ID','KOTOBA_VERIFICATION_URL','KOTOBA_ENTITLEMENT_PUBLIC_KEY'])if(!process.env[k]||process.env[k].includes('3940256099942544'))failures.push('Production configuration missing: '+k);
if(failures.length){console.error('RELEASE BLOCKED\n'+failures.map(f=>' - '+f).join('\n'));process.exitCode=1;}else console.log('Recorded gates passed; account declarations still require owner review.');
