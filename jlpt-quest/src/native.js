import {judgeShape,judgeRecognized} from './shape-grader.js';
let seq=0;const pending=new Map();
export const isNative=()=>!!globalThis.KotobaNative?.postMessage;
export function callNative(type,payload={},timeout=30000){if(!isNative())return Promise.reject(new Error('Android 전용 기능입니다.'));const id=String(++seq);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('기기 응답 시간이 초과되었습니다.'));},timeout);pending.set(id,{resolve,reject,timer});globalThis.KotobaNative.postMessage(JSON.stringify({id,type,payload}));});}
export function installBridge(){if(!isNative())return;globalThis.KotobaNative.onmessage=e=>{let msg;try{msg=JSON.parse(e.data);}catch{return;}const p=pending.get(msg.id);if(!p)return;clearTimeout(p.timer);pending.delete(msg.id);msg.error?p.reject(new Error(msg.error)):p.resolve(msg.result);};}
export async function judgeInk(lines,expected){if(!isNative())return judgeShape(lines,expected);try{const result=await callNative('recognize',{strokes:lines,width:1000,height:1000},180000);return judgeRecognized(result.candidates,expected,lines);}catch(e){return {status:'unavailable',correct:false,method:'mlkit',reason:e.message};}}
