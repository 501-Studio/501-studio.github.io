import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// These are operator attestations. Passing this validation is not proof that
// device, Google, billing, refund, or publication checks have been performed.
export const REQUIRED_RELEASE_GATES=Object.freeze(['physicalDeviceInk','physicalDeviceAudio','offlineRestore','accessibility','contentEditorialReview','privacyAndDataSafety','contentRating','storeListing','signedBundle','playAppSigning','closedTesting','legalDocsPublished','billingSandbox','consentAndAdFree','billingEventsAndRefunds','accountDeletion']);
export function validate_release_approval(approval){
  if(!approval||typeof approval!=='object'||Array.isArray(approval))return ['Release approval record invalid'];
  const failures=[];
  for(const key of REQUIRED_RELEASE_GATES)if(!Object.hasOwn(approval,key)||approval[key]!==true)failures.push('Unapproved: '+key);
  if(!Object.hasOwn(approval,'billingEventMode')||approval.billingEventMode!=='poll')failures.push('Billing event mode must be poll for the no-charge production release');
  return failures;
}

export async function release_failures(){
  const failures=[];const read=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
  try{const c=await read('../data/coverage.json');if(!c.allPacksComplete)failures.push('Vocabulary coverage incomplete');for(const [l,v]of Object.entries(c.levels))if(v.english!==0)failures.push(l+': English meanings remain');}catch{failures.push('Vocabulary evidence missing');}
  try{const a=await read('../editorial/audit.json');if(!a.semanticReviewComplete)failures.push(`Semantic review incomplete: ${a.remainingSemanticReview}/${a.total} still pending`);}catch{failures.push('Editorial audit missing');}
  // Device TTS availability/quality is covered by the mandatory physicalDeviceAudio approval below.
  try{failures.push(...validate_release_approval(await read('../../release-approval.json')));}catch{failures.push('Release approval not recorded');}
  try{const l=await read('../release/legal.json');for(const k of ['developerLegalName','supportEmail','publicPrivacyUrl','publicDataDeletionUrl','targetAudience'])if(!l[k]||String(l[k]).includes('REQUIRED'))failures.push('Legal field not confirmed: '+k);}catch{failures.push('Actual legal metadata not supplied');}
  try{const ads=await read('../release/admob-production.json');for(const [env,key]of [['ADMOB_APP_ID','appId'],['ADMOB_BANNER_ID','bannerId'],['ADMOB_INTERSTITIAL_ID','interstitialId']]){const id=process.env[env]||ads[key];if(!id||id.includes('3940256099942544'))failures.push('Production configuration missing: '+env);}if(ads.accountReviewStatus!=='approved')failures.push('AdMob account/app approval pending');}catch{failures.push('Production AdMob configuration missing');}
  for(const k of ['KOTOBA_VERIFICATION_URL','KOTOBA_ENTITLEMENT_PUBLIC_KEY','GOOGLE_OAUTH_CLIENT_ID','PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER'])if(!process.env[k])failures.push('Production configuration missing: '+k);
  return failures;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const failures=await release_failures();
  if(failures.length){console.error('RELEASE BLOCKED\n'+failures.map(f=>' - '+f).join('\n'));process.exitCode=1;}
  else console.log('Recorded gates passed; account declarations still require owner review.');
}
