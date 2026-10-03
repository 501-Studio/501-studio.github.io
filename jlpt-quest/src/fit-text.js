/** Keep Japanese headwords on one line without truncating or changing their text. */
export function fitHeadwords(scope=document) {
  const all=[...scope.querySelectorAll('[data-fit-word]')];
  const fit=el=>{
    if(!el.isConnected)return;
    const host=el.parentElement;
    const width=host?.clientWidth||0;
    if(width<1)return;
    const max=Number(el.dataset.maxFont)||60;
    const min=12;
    el.style.fontSize=max+'px';
    // scrollWidth has the full glyph width because CSS prohibits wrapping.
    let size=Math.max(min,Math.min(max, max*(width-2)/Math.max(1,el.scrollWidth)));
    el.style.fontSize=size.toFixed(2)+'px';
    for(let i=0;i<8&&el.scrollWidth>width;i++){
      size*=.96;el.style.fontSize=size.toFixed(2)+'px';
    }
    el.dataset.fitSize=size.toFixed(2);
  };
  let frame=0,dead=false;
  const update=()=>{if(dead)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>all.forEach(fit));};
  const observer=new ResizeObserver(update);
  for(const el of all){observer.observe(el.parentElement);fit(el);}
  document.fonts?.ready.then(update);update();
  return ()=>{dead=true;cancelAnimationFrame(frame);observer.disconnect();};
}
