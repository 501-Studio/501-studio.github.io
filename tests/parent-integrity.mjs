import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {Store,newItem,applyLocal,demoSnapshot,upsert} from '../dayboard/core.js';
import {assertHierarchy} from '../dayboard/hierarchy.js';
import {rpcError,readableError,isConnectionError} from '../dayboard/errors.js';
globalThis.localStorage={getItem:()=>'',setItem:()=>{},removeItem:()=>{}};
globalThis.document={hidden:false};
const checks=[];
async function test(name,fn){await fn();checks.push(name);console.log('PASS',name);}
const p=newItem({kind:'project',title:'P'}),t=newItem({parentId:p.id,title:'T'}),a=newItem({kind:'subtask',parentId:t.id,title:'A'}),b=newItem({kind:'subtask',parentId:t.id,title:'B'});
const seed=()=>({...demoSnapshot(),workspaceId:'test-only',revision:1,state:{items:[p,t,a,b],blocks:[],settings:{}}});
await test('Valid 3-level tree and standalone task accepted',()=>assertHierarchy([...seed().state.items,newItem({title:'independent'})]));
await test('Regression: task-under-task rejects without mutating input',()=>{const state=seed().state,prior=JSON.stringify(state);assert.throws(()=>applyLocal(state,[upsert('items',{id:a.id,kind:'task'})]),/INVALID_PARENT/);assert.equal(JSON.stringify(state),prior);});
await test('Orphan, cycle, subtask without parent and parented project rejected',()=>{
 assert.throws(()=>assertHierarchy([a]),/INVALID_PARENT/);
 assert.throws(()=>assertHierarchy([p,{...t,parentId:a.id},a]),/INVALID_PARENT/);
 assert.throws(()=>assertHierarchy([{...a,parentId:null}]),/SUBTASK_REQUIRES_PARENT/);
 assert.throws(()=>assertHierarchy([{...p,parentId:t.id},t]),/PROJECT_CANNOT_HAVE_PARENT/);
});
await test('Duplicate IDs rejected; final-state validation allows ordered batch creation',()=>{
 assert.throws(()=>assertHierarchy([p,p]),/DUPLICATE_ID/);
 assertHierarchy(applyLocal({items:[],blocks:[],settings:{}},[a,t,p,b].map(i=>upsert('items',i))).items);
});
await test('Invalid local proposal never calls the network',async()=>{const s=new Store();s.snapshot=seed();let calls=0;s.rpc=async()=>{calls++;};await assert.rejects(()=>s.propose('bad',[upsert('items',{id:a.id,kind:'task'})]),/INVALID_PARENT/);assert.equal(calls,0);assert.equal(s.error,'');assert(s.saveError);});
await test('Invalid commit preserves revision/state and does not claim disconnected',async()=>{const s=new Store();s.snapshot=seed();const before=JSON.stringify(s.snapshot);let calls=0;s.rpc=async()=>{calls++;};await assert.rejects(()=>s.commit([upsert('items',{id:a.id,kind:'task'})]),/INVALID_PARENT/);assert.equal(calls,0);assert.equal(s.error,'');assert.equal(JSON.stringify(s.snapshot),before);assert.equal(s.busy,false);});
await test('Server validation error remains a save error, not network status',async()=>{const s=new Store();s.snapshot=seed();s.rpc=async()=>{throw rpcError({message:'INVALID_PARENT'},400);};await assert.rejects(()=>s.commit([upsert('items',{id:a.id,title:'New A'})]),/INVALID_PARENT/);assert.equal(s.error,'');assert.equal(s.saveError,'INVALID_PARENT');});
await test('Success after error clears warning and saves normally',async()=>{const s=new Store();s.snapshot=seed();s.saveError='INVALID_PARENT';s.demo=true;await s.commit([upsert('items',{id:a.id,title:'New A'})]);assert.equal(s.saveError,'');assert.equal(s.error,'');assert.equal(s.snapshot.revision,2);});
await test('Network error keeps result unknown instead of claiming a successful save',async()=>{const s=new Store();s.snapshot=seed();s.rpc=async()=>{throw new TypeError('Failed to fetch');};await assert.rejects(()=>s.commit([upsert('items',{id:a.id,title:'Pending'})]));assert.equal(s.error,'Failed to fetch');assert.equal(s.snapshot.revision,1);});
await test('Unchanged successful refresh redraws a previously stale connection banner',async()=>{const s=new Store();s.key='test';s.snapshot=seed();s.error='Failed to fetch';let rendered=0;s.onchange=()=>rendered++;s.rpc=async()=>structuredClone(s.snapshot);await s.refresh();assert.equal(rendered,1);assert.equal(s.error,'');assert(s.lastRead>0);});
await test('Stale write reads new revision, clears network warning and never replays',async()=>{const s=new Store();s.snapshot=seed();const calls=[];s.rpc=async(name)=>{calls.push(name);if(name==='dayboard_apply')throw rpcError({message:'VERSION_CONFLICT'},400);return {...seed(),revision:3};};await assert.rejects(()=>s.commit([upsert('items',{id:a.id,title:'Stale'})]),/다른 기기/);assert.equal(s.snapshot.revision,3);assert.equal(s.error,'');assert.deepEqual(calls,['dayboard_apply','dayboard_read']);});
await test('A slow refresh cannot overwrite a newer revision',async()=>{const s=new Store();s.key='test';s.snapshot={...seed(),revision:5};s.rpc=async()=>({...seed(),revision:4});await s.refresh();assert.equal(s.snapshot.revision,5);});
await test('Connection key is not changed or removed by rejected validation',async()=>{const s=new Store();s.key='private-test-key';s.snapshot=seed();await assert.rejects(()=>s.commit([upsert('items',{id:a.id,kind:'task'})]));assert.equal(s.key,'private-test-key');});
await test('Hierarchy errors have Korean guidance and hostile titles remain data',()=>{assert(readableError(new Error('INVALID_PARENT')).includes('상위 연결'));assert.equal(isConnectionError(rpcError({message:'INVALID_PARENT'},400)),false);assert(isConnectionError(rpcError({},503)));});
mkdirSync('dayboard-test-output/parent-fix',{recursive:true});
writeFileSync('dayboard-test-output/parent-fix/domain.json',JSON.stringify({passed:checks.length,failed:0,checks},null,2));
console.log('RESULT',checks.length,'passed, 0 failed');
