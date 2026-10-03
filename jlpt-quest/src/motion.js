export function celebrate(container, enabled=true) {
  if(!enabled||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const root=document.createElement('div');root.className='confetti';root.setAttribute('aria-hidden','true');
  for(let i=0;i<34;i++){const p=document.createElement('i');p.style.cssText=`--x:${Math.random()*100}%;--r:${Math.random()*700-350}deg;--d:${Math.random()*.45}s;--h:${[252,262,28,165][i%4]};--s:${5+Math.random()*5}px`;root.append(p);}container.append(root);setTimeout(()=>root.remove(),2200);
}
export function haptic(settings, correct=true){if(settings.haptics&&navigator.vibrate)navigator.vibrate(correct?12:[12,45,12]);}
export function applyMotion(settings){document.documentElement.dataset.motion=settings.motion===false?'off':'on';}
