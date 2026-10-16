import {matchNextStroke,resample,dist} from './stroke-match.js';
/** Collect only a single pointer at a time. User input is judged, never synthesized. */
export function attachStrokePad(canvas,strokes,accepted,{guide=true,motion=true,width=4,onChange=()=>{},onAttempt=()=>{}}={}){
 const ctx=canvas.getContext('2d');let box,active=null,pointer=null,anim=0,raf=0,dead=false,locked=false;
 const reduce=()=>!motion||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 function line(points,color,weight=width,alpha=1){if(!points?.length)return;ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=weight;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(points[0][0]*box.width,points[0][1]*box.height);for(const p of points.slice(1))ctx.lineTo(p[0]*box.width,p[1]*box.height);ctx.stroke();ctx.restore();}
 function base(omitLast=false){ctx.clearRect(0,0,box.width,box.height);const n=accepted.length;
  if(guide){for(let i=n;i<strokes.length;i++)line(strokes[i],i===n?'#b3a6f1':'#ece9f4',width+1);}
  for(let i=0;i<n-(omitLast?1:0);i++)line(strokes[i],'#6b50dc',width+1);
  if(guide&&strokes[n]){const p=strokes[n][0],q=resample(strokes[n],12)[2],dx=(q[0]-p[0])*box.width,dy=(q[1]-p[1])*box.height,angle=Math.atan2(dy,dx);ctx.fillStyle='#38a687';ctx.beginPath();ctx.arc(p[0]*box.width,p[1]*box.height,4,0,Math.PI*2);ctx.fill();ctx.save();ctx.translate(q[0]*box.width,q[1]*box.height);ctx.rotate(angle);ctx.strokeStyle='#38a687';ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-7,-4);ctx.lineTo(0,0);ctx.lineTo(-7,4);ctx.stroke();ctx.restore();}
 }
 function draw(){if(dead)return;base();if(active)line(active,'#886eee');}
 function resize(){box=canvas.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,3);canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
 function tick(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw();});}
 const pos=e=>[Math.max(0,Math.min(1,(e.clientX-box.left)/box.width)),Math.max(0,Math.min(1,(e.clientY-box.top)/box.height))];
 function down(e){if(dead||locked||pointer!==null||accepted.length>=strokes.length||e.button>0)return;e.preventDefault();cancelAnimationFrame(anim);box=canvas.getBoundingClientRect();pointer=e.pointerId;canvas.setPointerCapture(pointer);active=[pos(e)];tick();}
 function move(e){if(e.pointerId!==pointer||!active)return;e.preventDefault();for(const event of e.getCoalescedEvents?.().length?e.getCoalescedEvents():[e]){if(active.length>=1900)break;const p=pos(event);if(dist(p,active.at(-1))>.0007)active.push(p);}tick();}
 function up(e){if(e.pointerId!==pointer||!active)return;e.preventDefault();const p=pos(e);if(dist(p,active.at(-1))>.0007)active.push(p);const raw=active;active=null;pointer=null;try{canvas.releasePointerCapture(e.pointerId);}catch{}cancelAnimationFrame(raf);raf=0;
  const index=accepted.length,result=matchNextStroke(raw,strokes,index);
  if(result.accepted){accepted.push(raw);canvas.dataset.accepted=String(accepted.length);onChange(accepted);}
  onAttempt(result,accepted.length,strokes.length);
  if(reduce()){draw();return;}
  locked=true;const from=resample(raw),to=result.accepted?resample(strokes[index]):from,start=performance.now(),duration=result.accepted?170:260;
  function frame(now){if(dead)return;const f=Math.min(1,(now-start)/duration),ease=1-(1-f)**3;base(result.accepted);const tween=from.map((p,i)=>[p[0]+(to[i][0]-p[0])*ease,p[1]+(to[i][1]-p[1])*ease]);line(tween,result.accepted?'#6b50dc':'#ce5b65',width+1,result.accepted?1:1-f);if(f<1)anim=requestAnimationFrame(frame);else{locked=false;draw();}}
  anim=requestAnimationFrame(frame);
 }
 function cancel(e){if(pointer!==null&&(!e||e.pointerId===pointer)){active=null;pointer=null;draw();}}
 const events={pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,lostpointercapture:cancel};for(const [event,fn]of Object.entries(events))canvas.addEventListener(event,fn,{passive:false});
 const observer=new ResizeObserver(resize);observer.observe(canvas);canvas.dataset.accepted=String(accepted.length);canvas.dataset.total=String(strokes.length);resize();
 return {redraw:draw,replay(){if(locked||!accepted.length||reduce())return;locked=true;const start=performance.now(),per=320;function frame(now){if(dead)return;ctx.clearRect(0,0,box.width,box.height);const elapsed=(now-start)/per;for(let i=0;i<accepted.length;i++){if(i>elapsed)break;line(resample(strokes[i],40).slice(0,Math.max(2,Math.ceil(Math.min(1,elapsed-i)*40))),'#6b50dc',width+1);}if(elapsed<accepted.length)anim=requestAnimationFrame(frame);else{locked=false;draw();}}anim=requestAnimationFrame(frame);},destroy(){dead=true;active=null;pointer=null;observer.disconnect();cancelAnimationFrame(anim);cancelAnimationFrame(raf);for(const [event,fn]of Object.entries(events))canvas.removeEventListener(event,fn);}};
}
