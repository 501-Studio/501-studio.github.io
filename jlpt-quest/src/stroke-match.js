/** Offline target-stroke verification for guided handwriting.
 * v0.3.3 intentionally ignores absolute start position and scores stroke SHAPE.
 * A roughly 60% similar stroke with the right direction can snap to the canonical target.
 */
export const SNAP_MODE='stroke-snap-v2';
export const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function pathLength(path){return path.slice(1).reduce((n,p,i)=>n+dist(p,path[i]),0);}
export function validPath(path){return Array.isArray(path)&&path.length>=2&&path.length<=2000&&path.every(p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(n=>Number.isFinite(n)&&n>=0&&n<=1));}
export function resample(path,count=32){
 if(!path.length)return [];
 const cum=[0];for(let i=1;i<path.length;i++)cum.push(cum.at(-1)+dist(path[i-1],path[i]));
 const len=cum.at(-1);if(len<1e-8)return Array.from({length:count},()=>path[0].slice(0,2));
 let j=1;return Array.from({length:count},(_,i)=>{const d=len*i/(count-1);while(j<cum.length-1&&cum[j]<d)j++;const a=path[j-1],b=path[j],f=(d-cum[j-1])/Math.max(1e-8,cum[j]-cum[j-1]);return [a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1])];});
}
function normalizeShape(path){
 const p=resample(path),xs=p.map(v=>v[0]),ys=p.map(v=>v[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const cx=(minX+maxX)/2,cy=(minY+maxY)/2,scale=Math.max(maxX-minX,maxY-minY,.035);
 return p.map(([x,y])=>[(x-cx)/scale,(y-cy)/scale]);
}
function frechet(a,b){
 let prev=new Float64Array(b.length).fill(Infinity);
 for(let i=0;i<a.length;i++){const row=new Float64Array(b.length).fill(Infinity);for(let j=0;j<b.length;j++)row[j]=Math.max(dist(a[i],b[j]),i===0&&j===0?0:Math.min(i?prev[j]:Infinity,j?row[j-1]:Infinity,i&&j?prev[j-1]:Infinity));prev=row;}return prev.at(-1);
}
function directionCos(a,b){
 const av=[a.at(-1)[0]-a[0][0],a.at(-1)[1]-a[0][1]],bv=[b.at(-1)[0]-b[0][0],b.at(-1)[1]-b[0][1]],al=Math.hypot(...av),bl=Math.hypot(...bv);
 return al<.02||bl<.02?1:(av[0]*bv[0]+av[1]*bv[1])/(al*bl);
}
export function shapeSimilarity(input,target){
 if(!validPath(input)||!validPath(target))return 0;
 const a=normalizeShape(input),b=normalizeShape(target);
 const mean=a.reduce((n,p,i)=>n+dist(p,b[i]),0)/a.length,order=frechet(a,b);
 return Math.max(0,Math.min(1,1-(mean*.68+order*.32)/.72));
}
export function matchStroke(input,target){
 const no=(reason,metrics={})=>({accepted:false,reason,metrics});
 if(!validPath(input)||!validPath(target))return no('한 획을 이어서 그어 주세요.');
 const il=pathLength(input),tl=pathLength(target),ratio=il/Math.max(.001,tl);
 if(il<.018||ratio<.32)return no('획이 너무 짧아요. 조금 더 길게 써 주세요.');
 if(ratio>2.9)return no('한 번에 한 획만 그어 주세요.');
 const a=resample(input),b=resample(target),direction=directionCos(a,b);
 if(direction<.12)return no('획 방향을 반대로 쓴 것 같아요.',{direction});
 const similarity=shapeSimilarity(input,target);
 if(similarity<.60)return no('모양을 조금 더 비슷하게 써 주세요.',{similarity,direction,ratio});
 return {accepted:true,reason:'모양이 맞아요. 제자리로 맞췄어요.',metrics:{similarity,direction,ratio,score:1-similarity}};
}
export function matchNextStroke(input,strokes,index){
 if(!Number.isInteger(index)||!Array.isArray(strokes)||index<0||index>=strokes.length)return {accepted:false,reason:'이 글자의 모든 획을 이미 썼어요.'};
 return matchStroke(input,strokes[index]);
}
export function validPrefix(lines,strokes){
 if(!Array.isArray(lines))return [];
 const accepted=[];for(let i=0;i<Math.min(lines.length,strokes.length);i++){if(!matchNextStroke(lines[i],strokes,i).accepted)break;accepted.push(lines[i].map(p=>p.slice(0,2)));}return accepted;
}
