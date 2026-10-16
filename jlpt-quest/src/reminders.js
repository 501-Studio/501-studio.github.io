import {isNative,callNative} from './native.js';
let previous='',permissionAsked=false;
/** Every level is included; only due times leave JS, never vocabulary or backup contents. */
export function reminderSchedule(state){
 const times=[...Object.values(state.memory).map(r=>r.due),...Object.values(state.kana?.progress||{}).map(r=>r.due)].filter(n=>Number.isFinite(n)&&n>0);
 return {enabled:state.settings.reviewNotifications!==false,dueTimes:[...new Set(times)].sort((a,b)=>a-b).slice(0,30000)};
}
export async function syncReminders(state){if(!isNative())return;const payload=reminderSchedule(state),signature=JSON.stringify(payload);if(signature===previous)return;await callNative('reviewSync',payload);previous=signature;}
export async function requestReviewPermission(){if(!isNative())return {granted:false,unsupported:true};permissionAsked=true;return callNative('reviewPermission',{},120000);}
export async function offerReviewPermission(state){
 if(!isNative()||permissionAsked||state.settings.reviewNotifications===false||(!Object.keys(state.memory).length&&!Object.keys(state.kana?.progress||{}).length))return;
 const status=await callNative('reviewStatus');
 if(!status.permissionRequested&&!status.granted)await requestReviewPermission();
}
