import {VERSION} from './core.js';
import {readableError} from './errors.js';
import {shell as baseShell,icon,NAV} from './views.js';
import {effectiveItems,day,spec,repeatStatus} from './journey-domain.js';
import {calendarV3,statsView,ji,completion} from './journey-view.js';
import {adventureView} from './journey-adventure-v4.js';
const additions=[['stats','통계와 회고','stats'],['adventure','모험','compass']];
export function shell(ctx){
 const rawState=ctx.state,display={...rawState,items:effectiveItems(rawState.items,ctx.date)};
 if(ctx.view==='today')display.items=display.items.filter(i=>!spec(i)||repeatStatus(i,ctx.date).eligible);
 const special=additions.some(n=>n[0]===ctx.view),t=document.createElement('template');
 t.innerHTML=baseShell({...ctx,state:display,rawState,view:special?'today':ctx.view});
 const root=t.content,content=root.querySelector('.content');
 if(special||['week','month'].includes(ctx.view)){
  for(const el of [...content.children])if(!el.classList.contains('page-heading')&&!el.classList.contains('notice'))el.remove();
  const section=document.createElement('main');section.className='j-view-main';
  section.innerHTML=ctx.view==='stats'?statsView({...ctx,rawState}):ctx.view==='adventure'?adventureView({...ctx,rawState}):calendarV3({...ctx,rawState});content.append(section);
 }
 if(special){const h=root.querySelector('.page-heading');h.querySelector('.eyeline').remove();h.querySelector('h1').textContent=ctx.view==='stats'?'통계와 회고':'하루의 숲';h.querySelector('p').textContent=ctx.view==='stats'?'기록을 읽고, 나에게 맞는 내일을 설계하세요.':'나의 작은 실행이 모험의 다음 장을 엽니다.';h.querySelector('.date-controls')?.remove();}
 const navItems=[...NAV.filter(x=>x[0]!=='settings'),...additions,NAV.find(x=>x[0]==='settings')];
 function navItem([id,title,ic]){return `<button type="button" data-action="${id==='more'?'v3-more':'nav'}" data-id="${id}" class="${ctx.view===id?'active':''}" aria-current="${ctx.view===id?'page':'false'}">${['stats','compass'].includes(ic)?ji(ic):icon(ic)}<span>${title}</span></button>`;}
 root.querySelector('.nav').innerHTML=navItems.map(navItem).join('');
 root.querySelector('.mobile-nav').innerHTML=[...NAV.slice(0,4),additions[0],['more','더보기','more']].map(navItem).join('');
 root.querySelector('.topbar-right').insertAdjacentHTML('afterbegin',`<button type="button" class="iconbutton j-top-more" data-action="v3-more" aria-label="통계 · 모험 · 설정">${icon('more')}</button>`);
 root.querySelector('.shell').dataset.version=VERSION;
 if(ctx.store.saveError&&!ctx.store.error){
  const notice=document.createElement('div');notice.className='notice warning save-error';notice.setAttribute('role','status');
  const text=document.createElement('span');text.textContent='변경이 저장되지 않았습니다. '+readableError(ctx.store.saveError);
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='button';dismiss.dataset.action='dismiss-save-error';dismiss.textContent='확인';
  notice.append(text,dismiss);content.prepend(notice);
  const status=root.querySelector('.sync');if(status)status.lastChild.textContent='변경 미저장';
 }
 if(ctx.view==='today'){
  const completed=rawState.items.filter(i=>i.kind!=='project'&&!rawState.items.some(c=>c.parentId===i.id)&&(spec(i)?repeatStatus(i,ctx.date).eligible&&repeatStatus(i,ctx.date).done:i.status==='done'&&i.completedAt&&day(i.completedAt)===ctx.date));
  if(completed.length){const a=document.createElement('details');a.className='j-completed-strip';a.innerHTML=`<summary>오늘 완료한 업무 ${completed.length}개 · 완료 취소</summary>`;for(const i of completed){const line=document.createElement('div');line.className='j-completed-line';line.innerHTML=completion(i,ctx.date);const name=document.createElement('span');name.textContent=i.title;line.append(name);a.append(line);}content.append(a);}
 }
 return t.innerHTML;
}
