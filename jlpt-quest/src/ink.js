/** Touch-first ink. Normalized points survive resizing; no network, keyboard, or OCR. */
export function hasInk(lines) {
  return Array.isArray(lines) && lines.some(line => line.length > 3 && line.slice(1).reduce((sum,p,i) => sum + Math.hypot(p[0]-line[i][0],p[1]-line[i][1]),0) > .055);
}
export function attachInk(canvas, lines, {width=4, onChange=()=>{}, onStart=()=>{}}={}) {
  const ctx=canvas.getContext('2d'); let box, active=null, pointer=null, frame=0, replay=0, destroyed=false;
  function resize(){box=canvas.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,3);canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
  function stroke(line){if(!line?.length)return;ctx.beginPath();ctx.moveTo(line[0][0]*box.width,line[0][1]*box.height);ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#6251dc';
    if(line.length===1){ctx.lineTo(line[0][0]*box.width+.1,line[0][1]*box.height+.1);}
    else {for(let i=1;i<line.length-1;i++){const p=line[i],n=line[i+1];ctx.quadraticCurveTo(p[0]*box.width,p[1]*box.height,(p[0]+n[0])/2*box.width,(p[1]+n[1])/2*box.height);}const last=line.at(-1);ctx.lineTo(last[0]*box.width,last[1]*box.height);}ctx.stroke();}
  function draw(view=lines){if(destroyed)return;ctx.clearRect(0,0,box.width,box.height);view.forEach(stroke);}
  function requestDraw(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});}
  const point=e=>[Math.max(0,Math.min(1,(e.clientX-box.left)/box.width)),Math.max(0,Math.min(1,(e.clientY-box.top)/box.height))];
  const finish=e=>{if(e && pointer!==e.pointerId)return;if(active){active=null;pointer=null;onChange(lines);}};
  const down=e=>{if(pointer!==null||lines.length>=60||e.button>0)return;e.preventDefault();cancelAnimationFrame(replay);box=canvas.getBoundingClientRect();pointer=e.pointerId;canvas.setPointerCapture(pointer);active=[point(e)];lines.push(active);onStart();requestDraw();};
  const move=e=>{if(pointer!==e.pointerId||!active)return;e.preventDefault();const events=e.getCoalescedEvents?.()||[];for(const ev of events.length?events:[e]){if(active.length>=1600)break;const p=point(ev),last=active.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])>.001)active.push(p);}requestDraw();};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);canvas.addEventListener('lostpointercapture',finish);
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  return {redraw:()=>draw(), replay(){cancelAnimationFrame(replay);if(!lines.length)return;const total=lines.reduce((n,l)=>n+l.length,0),start=performance.now();const run=now=>{let left=Math.floor((now-start)/Math.max(2,1300/total));const view=[];for(const line of lines){if(left<=0)break;view.push(line.slice(0,left));left-=line.length;}draw(view);if(now-start<Math.max(2,1300/total)*total)replay=requestAnimationFrame(run);else draw();};replay=requestAnimationFrame(run);},destroy(){finish();destroyed=true;observer.disconnect();cancelAnimationFrame(frame);cancelAnimationFrame(replay);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',finish);canvas.removeEventListener('pointercancel',finish);canvas.removeEventListener('lostpointercapture',finish);}};
}
