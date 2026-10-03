import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REQUIRED_RELEASE_GATES,validate_release_approval} from '../scripts/release-check.mjs';

// Independent release contract: accidentally dropping a non-billing gate must
// fail even if both the example and validation implementation are changed.
const otherGates=['physicalDeviceInk','physicalDeviceAudio','offlineRestore','accessibility','contentEditorialReview','privacyAndDataSafety','contentRating','storeListing','signedBundle','playAppSigning','closedTesting','legalDocsPublished','billingSandbox','consentAndAdFree','accountDeletion'];
const approved=()=>Object.fromEntries([...otherGates.map(key=>[key,true]),['billingEventsAndRefunds',true],['billingEventMode','poll']]);

test('explicit poll with every operator gate recorded passes gate validation only',()=>{
  assert.deepEqual(validate_release_approval(approved()),[]);
  assert.deepEqual([...REQUIRED_RELEASE_GATES].sort(),[...otherGates,'billingEventsAndRefunds'].sort());
});

test('a legacy RTDN approval never supplies the new billing-events gate',()=>{
  const legacy=approved();delete legacy.billingEventsAndRefunds;legacy.rtdnAndRefunds=true;
  assert.ok(validate_release_approval(legacy).includes('Unapproved: billingEventsAndRefunds'));
  delete legacy.billingEventMode;
  assert.equal(validate_release_approval(legacy).length,2);
});

test('missing, RTDN, unknown, or loosely typed event modes fail despite all true gates',()=>{
  for(const mode of [undefined,null,'rtdn','unknown','POLL','poll ',true,['poll'],{mode:'poll'}]){
    const record=approved();if(mode===undefined)delete record.billingEventMode;else record.billingEventMode=mode;
    assert.ok(validate_release_approval(record).some(value=>value.includes('Billing event mode must be poll')),String(mode));
  }
});

test('false/missing/loosely typed new billing evidence fails even with legacy RTDN=true',()=>{
  for(const value of [false,undefined,null,1,'true',{},[]]){
    const record=approved();record.rtdnAndRefunds=true;
    if(value===undefined)delete record.billingEventsAndRefunds;else record.billingEventsAndRefunds=value;
    assert.ok(validate_release_approval(record).includes('Unapproved: billingEventsAndRefunds'));
  }
});

test('every existing non-billing approval remains mandatory',()=>{
  for(const key of otherGates){
    const record=approved();record[key]=false;
    assert.deepEqual(validate_release_approval(record),['Unapproved: '+key]);
    delete record[key];assert.deepEqual(validate_release_approval(record),['Unapproved: '+key]);
  }
  assert.ok(validate_release_approval(Object.create(approved())).length>0);
  for(const record of [null,undefined,true,'approved',[]])assert.ok(validate_release_approval(record).length>0);
});

test('example remains unapproved and Android requires the same explicit poll/new gate contract',()=>{
  const sample=JSON.parse(readFileSync(new URL('../../release-approval.example.json',import.meta.url),'utf8'));
  assert.equal(sample.billingEventMode,'poll');
  assert.equal(Object.hasOwn(sample,'rtdnAndRefunds'),false);
  for(const key of [...otherGates,'billingEventsAndRefunds'])assert.equal(sample[key],false,key);
  assert.equal(validate_release_approval(sample).length,16);
  const gradle=readFileSync(new URL('../../kotoba-android/app/build.gradle',import.meta.url),'utf8');
  assert.doesNotMatch(gradle,/rtdnAndRefunds/);
  assert.match(gradle,/approval\.billingEventMode\s*!=\s*'poll'/);
  const guarded=gradle.match(/\[([^\]]+)'billingEventsAndRefunds'([^\]]+)\]\.each\s*\{\s*key\s*->\s*if\(approval\[key\]\s*!=\s*true\)/);
  assert.ok(guarded,'Android production task must independently reject every false approval');
  const names=[...guarded[0].matchAll(/'([A-Za-z]+)'/g)].map(match=>match[1]);
  assert.deepEqual(names.sort(),[...otherGates,'billingEventsAndRefunds'].sort());
});
