import {icon,esc} from './ui.js';
export {icon,esc};
export function btn(action,label,kind='primary',attrs=''){return `<button type="button" class="btn ${kind}" data-action="${action}" ${attrs}>${label}</button>`;}
export function mark(){return '<span class="brandmark" aria-hidden="true"><i></i><i></i><i></i></span>';}
export function ring(value,goal,size=''){const ratio=Math.min(1,value/Math.max(1,goal));return `<div class="goal-ring ${size}"><svg viewBox="0 0 140 140" aria-hidden="true"><circle class="track" cx="70" cy="70" r="59"/><circle class="fill" cx="70" cy="70" r="59" style="--offset:${371*(1-ratio)}"/></svg><div><b>${value}</b><small>오늘의 기억</small></div><i>${icon(value>=goal?'check':'spark')}</i></div>`;}
export function wave(){return `<span class="wave" aria-hidden="true">${Array.from({length:17},(_,i)=>`<i style="--h:${[12,23,37,51,29,67,45,80,60,95,73,51,38,56,35,24,12][i]}%;--d:${i*.08}s"></i>`).join('')}</span>`;}
export const heading=(title,sub='')=>`<div class="heading"><h1>${title}</h1>${sub?`<p>${sub}</p>`:''}</div>`;
export const empty=(title,sub)=>`<div class="empty">${icon('check')}<h3>${title}</h3><p>${sub}</p></div>`;
