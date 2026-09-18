import { CONTENT_VERSION, TESTS, RESULT_KEYS, PAIR_KEYS } from './definitions.mjs';
export const ANSWER_COUNT = 8;
// Options are stored in semantic order. The UI rotates their display order.
// Each row contributes to planning, initiative, connection and recovery.
export const OPTION_WEIGHTS = Object.freeze([[3,1,1,0],[0,3,1,1],[1,0,3,1],[1,1,0,3]]);
export function validAnswers(a){return Array.isArray(a)&&a.length===ANSWER_COUNT&&a.every(n=>Number.isInteger(n)&&n>=0&&n<4);}
export function validProgress(a){return Array.isArray(a)&&a.length<=ANSWER_COUNT&&a.every(n=>Number.isInteger(n)&&n>=0&&n<4);}
export function scoreSolo(answers){
 if(!validAnswers(answers))throw new TypeError('Invalid answer vector');
 const counts=[0,0,0,0],sums=[0,0,0,0];
 answers.forEach(n=>{counts[n]++;OPTION_WEIGHTS[n].forEach((v,i)=>sums[i]+=v);});
 const order=counts.map((n,i)=>({n,i})).sort((a,b)=>b.n-a.n||a.i-b.i);
 let index=order[0].i;
 // Hybrid outcomes require evidence from both styles, not a random tie-break.
 if(counts[0]>=3&&counts[1]>=3&&Math.abs(counts[0]-counts[1])<=1)index=4;
 else if(counts[2]>=3&&counts[3]>=3&&Math.abs(counts[2]-counts[3])<=1)index=5;
 return Object.freeze({index,key:RESULT_KEYS[index],counts,metrics:sums.map(n=>Math.round(n/(3*ANSWER_COUNT)*100)),mixed:order[0].n===order[1].n});
}
const AGREEMENT = Object.freeze([[100,40,70,55],[40,100,55,25],[70,55,100,70],[55,25,70,100]]);
export function scorePair(a,b){
 if(!validAnswers(a)||!validAnswers(b))throw new TypeError('Invalid paired answers');
 const points=a.map((v,i)=>AGREEMENT[v][b[i]]);
 const score=Math.round(points.reduce((s,n)=>s+n,0)/points.length);
 const index=score>=95?5:score>=85?4:score>=75?3:score>=65?2:score>=50?1:0;
 const metrics=Array.from({length:4},(_,i)=>Math.round((points[i*2]+points[i*2+1])/2));
 return Object.freeze({index,key:PAIR_KEYS[index],score,metrics,matches:a.filter((v,i)=>v===b[i]).length});
}
function checksum(text){let n=0x5d;for(const c of text)n=((n*33)^c.charCodeAt(0))&0xffff;return n.toString(36);}
// The payload is compact, validated and URL-safe, NOT encrypted or authenticated.
// Eight low-sensitivity preference answers are intentionally disclosed to recipients.
export function encodeAnswers(testId,answers){
 if(!Number.isInteger(testId)||!TESTS[testId]||!validAnswers(answers))throw new TypeError('Invalid quiz payload');
 let bits=0;answers.forEach((v,i)=>bits|=v<<(i*2));
 const body=`${CONTENT_VERSION}.${testId.toString(36)}.${bits.toString(36)}`;
 return `${body}.${checksum(body)}`;
}
export function decodeAnswers(token,expectedId){
 if(typeof token!=='string'||token.length>40||!/^1\.[0-9a-z]{1,2}\.[0-9a-z]{1,4}\.[0-9a-z]{1,4}$/.test(token))return null;
 const parts=token.split('.'),body=parts.slice(0,3).join('.');
 if(checksum(body)!==parts[3])return null;
 const id=parseInt(parts[1],36),bits=parseInt(parts[2],36);
 if(!TESTS[id]||id!==expectedId||!Number.isInteger(bits)||bits<0||bits>65535)return null;
 const answers=Array.from({length:ANSWER_COUNT},(_,i)=>(bits>>(i*2))&3);
 return encodeAnswers(id,answers)===token?answers:null;
}
export function optionOrder(testId,question){const offset=(testId+question*3)%4;return Array.from({length:4},(_,i)=>(i+offset)%4);}
export function quizPath(base,locale,slug){return `${base}${locale}/tests/${slug}/`;}
export function resultPath(base,locale,slug,key){return `${base}${locale}/results/${slug}/${key}/`;}
export function safeStorageRead(storage,key,fallback){try{return JSON.parse(storage.getItem(key))??fallback;}catch{return fallback;}}
export function safeStorageWrite(storage,key,value){try{storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
export function normalizeLocale(input){const exact=String(input||'').toLowerCase();if(exact.startsWith('pt'))return 'pt-BR';if(exact.startsWith('zh'))return 'zh-CN';const base=exact.split('-')[0];return ['en','ko','es','ja','id','hi','de','fr','ar','vi','th','tr'].includes(base)?base:'en';}
export function safeReferrer(value){try{return new URL(value).origin;}catch{return '';}}
