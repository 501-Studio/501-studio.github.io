/** Local template comparison, not general-purpose OCR or calibrated confidence.
 * Android uses the separately integrated ML Kit recognizer; this is the web preview fallback.
 * Stroke shape is scored against an independent font glyph and known confusable glyphs.
 */
export const SIZE=64;
const CONFUSABLES=['一二三','日目曰白百自','田由甲申旧','口囗回中','王玉主生','本末未木禾米','土士干千于十','人大太犬入八','水氷永','山川出凹凸','火父文又','心必','力刀九丸','上止正下','工エ土','牛午年','鳥烏馬','貝見具真','石右古舌','待持時侍','晴清情精','問間聞','緑録縁','継断','議義儀','予子了','己已巳','良艮','練錬','抑迎','貨貸','絡格洛','抱泡胞','情性','効幼','駅訳','根恨','格各','概慨','作昨','独触','未末','想相','説税','隣燐','被彼','徴微'];
const cache=new Map();
function bounds(bits,n=SIZE){let minX=n,minY=n,maxX=-1,maxY=-1,count=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(bits[y*n+x]){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}return {minX,minY,maxX,maxY,count,width:maxX-minX+1,height:maxY-minY+1};}
export function normalizeBitmap(bits,n=SIZE){const b=bounds(bits,n),out=new Uint8Array(SIZE*SIZE);if(b.count<3)return out;const scale=Math.min((SIZE-12)/Math.max(1,b.width),(SIZE-12)/Math.max(1,b.height)),dx=(SIZE-b.width*scale)/2,dy=(SIZE-b.height*scale)/2;
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const sx=Math.floor((x-dx)/scale+b.minX),sy=Math.floor((y-dy)/scale+b.minY);if(sx>=b.minX&&sx<=b.maxX&&sy>=b.minY&&sy<=b.maxY)out[y*SIZE+x]=bits[sy*n+sx];}return out;}
export function skeletonize(input){const a=Uint8Array.from(input),n=SIZE;for(let iteration=0;iteration<40;iteration++){let any=false;for(let phase=0;phase<2;phase++){const del=[];for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){const k=y*n+x;if(!a[k])continue;const p=[a[k-n],a[k-n+1],a[k+1],a[k+n+1],a[k+n],a[k+n-1],a[k-1],a[k-n-1]],sum=p.reduce((a,b)=>a+b,0);if(sum<2||sum>6)continue;let changes=0;for(let i=0;i<8;i++)if(!p[i]&&p[(i+1)%8])changes++;if(changes!==1)continue;if(phase===0?(p[0]*p[2]*p[4]||p[2]*p[4]*p[6]):(p[0]*p[2]*p[6]||p[0]*p[4]*p[6]))continue;del.push(k);}for(const k of del)a[k]=0;if(del.length)any=true;}if(!any)break;}return a;}
export function distanceMap(bits){const n=SIZE,d=new Float32Array(n*n);d.fill(n*2);for(let i=0;i<d.length;i++)if(bits[i])d[i]=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=y*n+x;d[k]=Math.min(d[k],x?d[k-1]+1:128,y?d[k-n]+1:128,x&&y?d[k-n-1]+1.414:128,y&&x<n-1?d[k-n+1]+1.414:128);}for(let y=n-1;y>=0;y--)for(let x=n-1;x>=0;x--){const k=y*n+x;d[k]=Math.min(d[k],x<n-1?d[k+1]+1:128,y<n-1?d[k+n]+1:128,x<n-1&&y<n-1?d[k+n+1]+1.414:128,x&&y<n-1?d[k+n-1]+1.414:128);}return d;}
function skeletonFeatures(sk){const indices=[];for(let i=0;i<sk.length;i++)if(sk[i])indices.push(i);return {sk,indices,dist:distanceMap(sk)};}
function features(bits){const normalized=normalizeBitmap(bits),sk=skeletonize(normalized);return {...skeletonFeatures(sk),centerline:skeletonFeatures(skeletonize(normalizeBitmap(sk))),bits:normalized,bounds:bounds(bits)};}
function affinity(a,b){if(a.indices.length<8||b.indices.length<8)return 0;let d1=0,d2=0,near1=0,near2=0;for(const i of a.indices){d1+=Math.min(12,b.dist[i]);if(b.dist[i]<=2.8)near1++;}for(const i of b.indices){d2+=Math.min(12,a.dist[i]);if(a.dist[i]<=2.8)near2++;}const precision=near1/a.indices.length,recall=near2/b.indices.length;const f=precision+recall?2*precision*recall/(precision+recall):0;const mean=(d1/a.indices.length+d2/b.indices.length)/2;return .72*f+.28*Math.exp(-mean/3);}
function similarity(a,b){return Math.max(affinity(a,b),affinity(a.centerline,b.centerline));}
export function compareBitmaps(input,reference){return similarity(features(input),features(reference));}
function pixels(canvas){const rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,SIZE,SIZE).data;return Uint8Array.from({length:SIZE*SIZE},(_,i)=>rgba[i*4+3]>80?1:0);}
export function glyphBitmap(char){const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.font='52px "Noto Sans CJK JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(char,32,33);return pixels(canvas);}
export function strokesBitmap(lines){const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;const ctx=canvas.getContext('2d');ctx.strokeStyle='#000';ctx.lineWidth=1.8;ctx.lineCap='round';ctx.lineJoin='round';for(const line of lines){if(!line.length)continue;ctx.beginPath();ctx.moveTo(line[0][0]*SIZE,line[0][1]*SIZE);for(const p of line.slice(1))ctx.lineTo(p[0]*SIZE,p[1]*SIZE);ctx.stroke();}return pixels(canvas);}
export function inkSanity(lines){if(!Array.isArray(lines)||!lines.length||lines.length>60)return false;let length=0,points=0;for(const line of lines){if(!Array.isArray(line)||line.length>2000)return false;for(let i=0;i<line.length;i++){const p=line[i];if(!Array.isArray(p)||p.length<2||!p.slice(0,2).every(n=>Number.isFinite(n)&&n>=0&&n<=1))return false;points++;if(i)length+=Math.hypot(p[0]-line[i-1][0],p[1]-line[i-1][1]);}}return points>=3&&length>.16&&length<40;}
function glyphFeatures(char){if(!cache.has(char))cache.set(char,features(glyphBitmap(char)));return cache.get(char);}
export async function judgeShape(lines,expected){
 if(!inkSanity(lines))return {status:'wrong',correct:false,method:'shape-template',reason:'글자의 획을 충분히 써 주세요.'};
 if([...expected].length!==1)return {status:'unavailable',correct:false,method:'shape-template',reason:'한 칸에 한 글자씩 써 주세요.'};
 await document.fonts?.ready;
 const input=features(strokesBitmap(lines)),ref=glyphFeatures(expected);if(ref.indices.length<8)return {status:'unavailable',correct:false,method:'shape-template',reason:'이 기기에서 기준 글자를 표시할 수 없어요.'};
 const missing=glyphFeatures('\u0378');if(ref.bits.every((v,i)=>v===missing.bits[i]))return {status:'unavailable',correct:false,method:'shape-template',reason:'일본어 기준 글꼴이 없습니다. Android 앱의 인식을 사용해 주세요.'};
 const candidates=[...new Set([expected,...CONFUSABLES.filter(s=>s.includes(expected)).join('')])];const ranked=candidates.map(c=>({char:c,score:similarity(input,glyphFeatures(c))})).sort((a,b)=>b.score-a.score);
 const score=ranked.find(r=>r.char===expected).score,best=ranked[0],second=ranked[1];
 if(best.char!==expected&&best.score>score+.025)return {status:'wrong',correct:false,method:'shape-template',recognized:best.char,reason:'비슷한 다른 글자의 형태로 보입니다. 기준 글자와 비교해 주세요.'};
 if(score<.73)return {status:'wrong',correct:false,method:'shape-template',reason:'획의 위치와 글자 모양이 기준과 다릅니다. 다시 써 주세요.'};
 if(second&&best.score-second.score<.025)return {status:'ambiguous',correct:false,method:'shape-template',reason:'비슷한 글자와 구분하기 어려워요. 획 길이와 위치를 조금 더 분명하게 써 주세요.'};
 return {status:'correct',correct:true,method:'shape-template',recognized:expected,reason:'기준 글자와 형태가 일치해요.'};
}
export function judgeRecognized(candidates,expected,lines){
 if(!inkSanity(lines))return {status:'wrong',correct:false,method:'mlkit',reason:'충분한 획이 필요합니다.'};
 if(!Array.isArray(candidates)||!candidates.length||typeof candidates[0]!=='string')return {status:'ambiguous',correct:false,method:'mlkit',reason:'글자를 판독하지 못했어요. 다시 써 주세요.'};
 const recognized=candidates[0].normalize('NFKC').replace(/\s/gu,'');const correct=recognized===expected.normalize('NFKC');
 return {status:correct?'correct':'wrong',correct,method:'mlkit',recognized,reason:correct?'앱이 쓴 글자를 확인했어요.':`입력을 ‘${recognized}’로 읽었어요. 정답 글자와 다릅니다.`};
}
