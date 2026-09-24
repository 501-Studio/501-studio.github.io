/** Offline target-stroke verification. This is a guided exercise, NOT general OCR.
 * Coordinates stay in the fixed writing square: no translation/rotation normalization.
 * A path must follow the expected stroke in order, position and direction before snapping.
 */
export const SNAP_MODE='stroke-snap-v1';
export const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function pathLength(path){return path.slice(1).reduce((n,p,i)=>n+dist(p,path[i]),0);}
export function validPath(path){return Array.isArray(path)&&path.length>=2&&path.length<=2000&&path.every(p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(n=>Number.isFinite(n)&&n>=0&&n<=1));}
export function resample(path,count=32){
 if(!path.length)return [];
 const cum=[0];for(let i=1;i<path.length;i++)cum.push(cum.at(-1)+dist(path[i-1],path[i]));
 const len=cum.at(-1);if(len<1e-8)return Array.from({length:count},()=>path[0].slice(0,2));
 let j=1;return Array.from({length:count},(_,i)=>{const d=len*i/(count-1);while(j<cum.length-1&&cum[j]<d)j++;const a=path[j-1],b=path[j],f=(d-cum[j-1])/Math.max(1e-8,cum[j]-cum[j-1]);return [a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1])];});
}
function frechet(a,b){
 let prev=new Float64Array(b.length).fill(Infinity);
 for(let i=0;i<a.length;i++){const row=new Float64Array(b.length).fill(Infinity);for(let j=0;j<b.length;j++)row[j]=Math.max(dist(a[i],b[j]),i===0&&j===0?0:Math.min(i?prev[j]:Infinity,j?row[j-1]:Infinity,i&&j?prev[j-1]:Infinity));prev=row;}return prev.at(-1);
}
export function matchStroke(input,target){
 const no=(reason,metrics={})=>({accepted:false,reason,metrics});
 if(!validPath(input)||!validPath(target))return no('한 획을 이어서 그어 주세요.');
 const il=pathLength(input),tl=pathLength(target);
 if(il<Math.max(.006,tl*.48))return no('획이 너무 짧아요. 끝까지 이어 주세요.');
 if(il>tl*1.85+.035)return no('한 번에 한 획만 그어 주세요.');
 const a=resample(input),b=resample(target),start=dist(a[0],b[0]),end=dist(a.at(-1),b.at(-1));
 const tolerance=Math.max(.042,Math.min(.105,.04+tl*.12));
 const reverse=dist(a[0],b.at(-1))+dist(a.at(-1),b[0]);
 if(dist(b[0],b.at(-1))>.05 && reverse+.025<start+end)return no('시작점부터 화살표 방향으로 그어 주세요.');
 if(start>tolerance)return no('시작 위치를 조금 더 맞춰 주세요.');
 if(end>tolerance)return no('획의 끝 위치까지 이어 주세요.');
 const forward=a.map(p=>Math.min(...b.map(q=>dist(p,q))));
 const backward=b.map(p=>Math.min(...a.map(q=>dist(p,q))));
 const mean=(forward.reduce((s,x)=>s+x,0)+backward.reduce((s,x)=>s+x,0))/(a.length+b.length);
 const order=frechet(a,b),corridor=Math.max(...forward,...backward);
 const meanLimit=Math.max(.026,Math.min(.057,.025+tl*.06));
 if(mean>meanLimit||corridor>tolerance*1.15||order>tolerance*1.18)return no('선의 위치와 꺾이는 모양을 다시 확인해 주세요.',{mean,order,corridor});
 return {accepted:true,reason:'획을 맞췄어요.',metrics:{mean,order,corridor,start,end,score:mean+order*.3}};
}
export function matchNextStroke(input,strokes,index){
 if(!Number.isInteger(index)||!Array.isArray(strokes)||index<0||index>=strokes.length)return {accepted:false,reason:'이 글자의 모든 획을 이미 썼어요.'};
 const verdict=matchStroke(input,strokes[index]);
 if(!verdict.accepted)return verdict;
 // A near-identical neighbouring line must not steal the next stroke's credit.
 for(let i=0;i<strokes.length;i++)if(i!==index){const other=matchStroke(input,strokes[i]);if(other.accepted&&other.metrics.score+.025<verdict.metrics.score)return {accepted:false,reason:`${index+1}번째 획을 먼저 그어 주세요.`};}
 return verdict;
}
export function validPrefix(lines,strokes){
 if(!Array.isArray(lines))return [];
 const accepted=[];for(let i=0;i<Math.min(lines.length,strokes.length);i++){if(!matchNextStroke(lines[i],strokes,i).accepted)break;accepted.push(lines[i].map(p=>p.slice(0,2)));}return accepted;
}
