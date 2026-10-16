import {matchNextStroke,resample,dist} from './stroke-match.js';
/** Matching is synchronous on pointerup; animation never owns or locks the pointer. */
export function attachStrokePad(canvas,strokes,accepted,{guide=true,motion=true,width=6,onChange=()=>{},onAttempt=()=>{}}={}) {
 const ctx=canvas.getContext('2d');let box,active=null,pointer=null,raf=0,dead=false,effect=null,replaying=null;
 const reduce=()=>!motion||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const weight=Math.max(5,width)+2;
 function line(points,color,w=weight,alpha=1){if(!points?.length)return;ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=w;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(points[0][0]*box.width,points[0][1]*box.height);for(const p of points.slice(1))ctx.lineTo(p[0]*box.width,p[1]*box.height);ctx.stroke();ctx.restore();}
 function draw(now=performance.now()){
  if(dead||!box?.width)return;ctx.clearRect(0,0,box.width,box.height);
  const n=accepted.length;
  if(guide){for(let i=n;i<strokes.length;i++)line(strokes[i],i===n?'#ac9de8':'#e7e2f2',weight+1);}
  if(replaying){
   const elapsed=(now-replaying)/220;
   for(let i=0;i<n;i++){if(i>elapsed)break;line(resample(strokes[i],40).slice(0,Math.max(2,Math.ceil(Math.min(1,elapsed-i)*40))),'#6550d7');}
   if(elapsed<n){schedule();return;}replaying=null;
  }
  for(let i=0;i<n;i++)if(effect?.index!==i||!effect?.accepted)line(strokes[i],'#6550d7');
  if(guide&&strokes[n]){const p=strokes[n][0];ctx.fillStyle='#23816c';ctx.beginPath();ctx.arc(p[0]*box.width,p[1]*box.height,4,0,Math.PI*2);ctx.fill();}
  if(effect){const f=Math.min(1,(now-effect.start)/110),e=1-(1-f)**3;
   const path=effect.from.map((p,i)=>[p[0]+(effect.to[i][0]-p[0])*e,p[1]+(effect.to[i][1]-p[1])*e]);
   line(path,effect.accepted?'#6550d7':'#c54a60',weight,effect.accepted?1:1-f);
   if(f<1)schedule();else{effect=null;schedule();}
  }
  if(active)line(active,'#7460de');
 }
 function schedule(){if(!raf)raf=requestAnimationFrame(now=>{raf=0;draw(now);});}
 function resize(){box=canvas.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,3);canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
 const point=e=>[Math.max(0,Math.min(1,(e.clientX-box.left)/box.width)),Math.max(0,Math.min(1,(e.clientY-box.top)/box.height))];
 function down(e){if(dead||pointer!==null||accepted.length>=strokes.length||e.button>0)return;
  e.preventDefault();effect=null;replaying=null;box=canvas.getBoundingClientRect();pointer=e.pointerId;
  try{canvas.setPointerCapture(pointer);}catch{}active=[point(e)];schedule();
 }
 function move(e){if(pointer!==e.pointerId||!active)return;e.preventDefault();const coalesced=e.getCoalescedEvents?.()||[];
  for(const ev of coalesced.length?coalesced:[e]){if(active.length>=1900)break;const p=point(ev);if(dist(p,active.at(-1))>.0007)active.push(p);}schedule();
 }
 function up(e){if(e.pointerId!==pointer||!active)return;e.preventDefault();const p=point(e);if(dist(p,active.at(-1))>.0007)active.push(p);
  const raw=active;active=null;pointer=null;try{canvas.releasePointerCapture(e.pointerId);}catch{}
  const index=accepted.length,result=matchNextStroke(raw,strokes,index);
  if(result.accepted){accepted.push(raw);canvas.dataset.accepted=String(accepted.length);onChange(accepted);}
  // Commit accepted count immediately. A new down event can start at any moment.
  if(!reduce()){const from=resample(raw);effect={index,accepted:result.accepted,from,to:result.accepted?resample(strokes[index]):from,start:performance.now()};}
  onAttempt(result,accepted.length,strokes.length);schedule();
 }
 function cancel(e){if(pointer!==null&&(!e||e.pointerId===pointer)){const id=pointer;pointer=null;active=null;try{canvas.releasePointerCapture(id);}catch{}schedule();}}
 const events={pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,lostpointercapture:cancel};
 for(const [name,fn]of Object.entries(events))canvas.addEventListener(name,fn,{passive:false});
 const observer=new ResizeObserver(resize);observer.observe(canvas);canvas.dataset.accepted=String(accepted.length);canvas.dataset.total=String(strokes.length);resize();
 return {redraw:()=>draw(),replay(){if(active||!accepted.length||reduce())return;effect=null;replaying=performance.now();schedule();},destroy(){dead=true;active=null;pointer=null;observer.disconnect();cancelAnimationFrame(raf);for(const[name,fn]of Object.entries(events))canvas.removeEventListener(name,fn);}};
}
