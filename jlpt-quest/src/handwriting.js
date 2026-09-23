// A real touch/pen canvas. No OCR: ratings are explicitly self-assessed.
export function attachCanvas(canvas,strokes,onChange) {
  const ctx=canvas.getContext('2d');let active=null;let pointer=null;
  const redraw=()=>{
    const box=canvas.getBoundingClientRect(),scale=Math.min(devicePixelRatio||1,3);
    canvas.width=Math.round(box.width*scale);canvas.height=Math.round(box.height*scale);
    ctx.scale(scale,scale);ctx.strokeStyle='#47573d';ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';
    for(const line of strokes){if(!line.length)continue;ctx.beginPath();ctx.moveTo(line[0][0]*box.width,line[0][1]*box.height);if(line.length===1)ctx.lineTo(line[0][0]*box.width+.1,line[0][1]*box.height+.1);else for(const [x,y]of line.slice(1))ctx.lineTo(x*box.width,y*box.height);ctx.stroke();}
  };
  const position=e=>{const b=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))];};
  const end=()=>{if(active){active=null;pointer=null;onChange(strokes);}};
  canvas.onpointerdown=e=>{if(strokes.length>=300||pointer!==null)return;e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);active=[position(e)];strokes.push(active);redraw();};
  canvas.onpointermove=e=>{if(e.pointerId!==pointer||!active||active.length>=2000)return;e.preventDefault();active.push(position(e));redraw();};
  canvas.onpointerup=end;canvas.onpointercancel=end;canvas.onlostpointercapture=end;
  const observer=new ResizeObserver(redraw);observer.observe(canvas);redraw();
  return ()=>observer.disconnect();
}
