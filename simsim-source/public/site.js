import {track} from './analytics.js';
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const toast=(m)=>{const e=q('[data-toast]');if(!e)return;e.textContent=m;e.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>e.classList.remove('show'),2200)};
q('#locale-select')?.addEventListener('change',e=>{track('locale_change',{locale:e.target.value});location.href=e.target.value});
q('[data-menu-toggle]')?.addEventListener('click',()=>{const n=q('[data-mobile-menu]');n.hidden=!n.hidden});
const favKey='simsim.favorites.v1',recentKey='simsim.recent.v1';const read=(k)=>{try{return JSON.parse(localStorage.getItem(k)||'[]')}catch{return[]}};const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
function refreshFav(){const set=new Set(read(favKey));qa('[data-favorite]').forEach(b=>{const on=set.has(b.dataset.favorite);b.classList.toggle('active',on);if(b.tagName==='BUTTON'){const label=b.textContent.trim();if(label.startsWith('♡')||label.startsWith('♥'))b.textContent=(on?'♥':'♡')+label.slice(1)}})}
qa('[data-favorite]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();let a=read(favKey);const s=b.dataset.favorite;a=a.includes(s)?a.filter(x=>x!==s):[s,...a].slice(0,30);write(favKey,a);refreshFav();toast(a.includes(s)?'★':'☆')}));
refreshFav();qa('[data-track]').forEach(el=>el.addEventListener('click',()=>track(el.dataset.track,{quizSlug:el.dataset.quiz,locale:document.documentElement.lang})));
window.SimsimStorage={read,write,recentKey,favKey};window.SimsimToast=toast;