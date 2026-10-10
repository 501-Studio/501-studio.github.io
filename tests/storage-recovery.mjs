import assert from 'node:assert/strict';
import {Store,demoSnapshot,upsert} from '../dayboard/core.js';
import {isConnectionError,readableError} from '../dayboard/errors.js';
import {setupError} from '../dayboard/setup-core.js';

// Synthetic credentials and snapshots only; no live database writes.
const saved=new Map([['dayboard.key','synthetic-existing-key']]);
globalThis.localStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
globalThis.document={hidden:false};
const originalFetch=globalThis.fetch;
const store=new Store();
store.snapshot={...demoSnapshot(),workspaceId:'synthetic-workspace',revision:7};
store.undo={revision:7,operations:[]};
const before=structuredClone(store.snapshot),undo=store.undo;
const calls=[];
let mode='network';
globalThis.fetch=async(url,options)=>{
 const body=JSON.parse(options.body);
 calls.push({method:url.split('/').pop(),body});
 if(mode==='network')throw new TypeError('Failed to fetch');
 if(mode==='timeout')throw Object.assign(new Error('aborted'),{name:'AbortError'});
 if(mode==='unauthorized')return new Response(JSON.stringify({message:'UNAUTHORIZED'}),{status:401});
 return new Response(JSON.stringify(before),{status:200});
};
try {
 await assert.rejects(()=>store.connect('synthetic-candidate-key'),/STORAGE_UNREACHABLE/);
 assert.equal(calls.at(-1).body.p_key,'synthetic-candidate-key');
 assert.equal(store.key,'synthetic-existing-key');
 assert.equal(saved.get('dayboard.key'),'synthetic-existing-key');
 assert.deepEqual(store.snapshot,before);
 assert.equal(store.undo,undo);
 console.log('PASS Failed reconnect preserves existing key, snapshot and undo');

 const operation=upsert('items',{...before.state.items.find(i=>i.kind==='task'),title:'Synthetic pending edit'});
 await assert.rejects(()=>store.commit([operation]),/STORAGE_UNREACHABLE/);
 assert.equal(store.error,'STORAGE_UNREACHABLE');
 assert.equal(store.saveError,'STORAGE_UNREACHABLE');
 assert.deepEqual(store.snapshot,before);
 assert.equal(store.busy,false);
 assert.equal(calls.filter(c=>c.method==='dayboard_apply').length,1);
 const advice=readableError(store.error);
 assert(advice.includes('일시중지'));
 assert(advice.includes('기존 프로젝트를 재개'));
 assert(advice.includes('최신 내용을 불러와 결과를 확인'));
 assert(!advice.includes(store.key));
 assert(setupError(new Error(store.error)).includes('준비한 연결 정보'));
 console.log('PASS Failed write stays uncertain, keeps state and is never replayed');

 mode='timeout';
 await assert.rejects(()=>store.rpc('dayboard_read'),/STORAGE_TIMEOUT/);
 assert(isConnectionError('STORAGE_TIMEOUT'));
 assert(readableError('STORAGE_TIMEOUT').includes('기존 연결키'));
 console.log('PASS Timeout has recovery guidance without credential replacement');

 mode='unauthorized';
 await assert.rejects(()=>store.connect('synthetic-invalid-key'),error=>error.status===401&&error.message==='UNAUTHORIZED');
 assert.equal(saved.get('dayboard.key'),'synthetic-existing-key');
 assert(!readableError(new Error('UNAUTHORIZED')).includes('일시중지'));
 console.log('PASS HTTP authorization error remains distinct from unreachable storage');

 mode='success';
 let renders=0;store.onchange=()=>renders++;
 await store.refresh();
 assert.equal(store.error,'');
 assert.equal(renders,1);
 assert.deepEqual(store.snapshot,before);
 assert.equal(calls.filter(c=>c.method==='dayboard_apply').length,1);
 await store.connect(' synthetic-confirmed-key ');
 assert.equal(store.key,'synthetic-confirmed-key');
 assert.equal(saved.get('dayboard.key'),'synthetic-confirmed-key');
 assert.equal(store.saveError,'');
 console.log('PASS Successful read recovers and only verified connection replaces key');
} finally {globalThis.fetch=originalFetch;}
