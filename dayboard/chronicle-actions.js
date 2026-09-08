import {CATALOG,gameOperation} from './journey-domain.js';
import {chronicleUI} from './chronicle-view.js';
import {CHAPTERS,REALMS} from './chronicle-content.js';
import {chronicleOperation,journeyProgress} from './chronicle-domain.js';
export function createChronicleController({store,getState,render,notify}){
 function locate(id){requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({behavior:'auto',block:'start'}));}
 async function handle(action,id=''){
  if((action==='v3-buy'||action==='v3-equip')&&(id==='default'||CATALOG.find(i=>i.id===id)?.slot==='title')){const ops=gameOperation(getState(),action.slice(3),id);if(getState().settings.chronicle?.equippedTitle&&getState().settings.chronicle.equippedTitle!=='none')ops.push(...chronicleOperation(getState(),'title','none'));await store.commit(ops,{remember:false});chronicleUI.preview=null;notify(action==='v3-buy'?'교환하고 칭호를 장착했습니다.':'꾸미기와 칭호를 적용했습니다.');return true;}
  if(action==='v3-adventure-tab'){chronicleUI.tab=id==='journey'?'overview':id;chronicleUI.preview=null;return false;}
  if(!action.startsWith('cr-'))return false;
  if(action==='cr-tab'){if(!['overview','story','atlas','quests','shop','wardrobe','titles','codex','mastery','rewards'].includes(id))return true;chronicleUI.tab=id;chronicleUI.preview=null;render();locate('cr-main');return true;}
  if(action==='cr-read'){const c=CHAPTERS.find(c=>c.id===id);if(!c)return true;chronicleUI.reading=id;chronicleUI.realm=c.realm;chronicleUI.page=0;chronicleUI.tab='story';render();locate('cr-reader');return true;}
  if(action==='cr-page'){chronicleUI.page=Math.max(0,Math.min(2,Number(id)||0));render();locate('cr-reader');return true;}
  if(action==='cr-realm'){if(!REALMS.some(r=>r.id===id))return true;chronicleUI.realm=id;chronicleUI.tab='atlas';render();locate('cr-realm-detail');return true;}
  if(action==='cr-preview'||action==='cr-preview-clear'){chronicleUI.preview=action==='cr-preview'?id:null;render();requestAnimationFrame(()=>document.querySelector('.cr-stage')?.scrollIntoView({block:'center'}));return true;}
  if(action==='cr-shop-page'||action==='cr-title-page'){const key=action==='cr-shop-page'?'shopPage':'titlePage';chronicleUI[key]=Math.max(0,Number(id)||0);render();locate('cr-main');return true;}
  if(action==='cr-title-filter'){chronicleUI.titleFilter=['all','owned','ready'].includes(id)?id:'all';chronicleUI.titlePage=0;render();return true;}
  const kind=action.slice(3);if(['choose','mission','title','talent','role','camp'].includes(kind)){
   const [target,value]=kind==='choose'?id.split('|'):[id,undefined];
   const ops=chronicleOperation(getState(),kind==='choose'?'chapter':kind,target,value);
   await store.commit(ops,{remember:false});chronicleUI.preview=null;
   notify({choose:'이 장의 선택을 저장했습니다. 이야기는 언제든 다시 읽을 수 있습니다.',mission:'의뢰를 마치고 기억 도감에 기록했습니다.',title:'칭호를 적용했습니다.',talent:'성장의 한 걸음을 기록했습니다.',role:'여행자의 역할을 변경했습니다.',camp:'야영지를 변경했습니다.'}[kind]);
   if(kind==='choose'){chronicleUI.page=2;render();locate('cr-reader');}
   return true;
  }
  return true;
 }
 function change(e){const map={'cr-shop-type':'shopType','cr-shop-realm':'shopRealm','cr-shop-owned':'shopOwned','cr-codex-realm':'codexRealm'};const key=map[e.target.id];if(key){chronicleUI[key]=e.target.value;chronicleUI.shopPage=0;render();}if(e.target.id==='cr-story-region'){const ch=CHAPTERS.find(c=>c.realm===e.target.value);if(ch){chronicleUI.reading=ch.id;chronicleUI.page=0;render();locate('cr-reader');}}}
 function submit(form,data){if(form.id!=='cr-search-form')return false;chronicleUI.shopSearch=String(data.q||'').trim().slice(0,100);chronicleUI.shopPage=0;render();return true;}
 return {handle,change,submit};
}
