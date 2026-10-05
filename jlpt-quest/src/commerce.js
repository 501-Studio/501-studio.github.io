import {isNative,callNative} from './native.js';
import {esc,icon} from './view.js';
export const PLANS=Object.freeze({
 monthly:{title:'월간',price:'₩1,800',period:'매월',productId:'kotoba_premium',basePlan:'monthly'},
 annual:{title:'연간',price:'₩9,000',period:'매년',productId:'kotoba_premium',basePlan:'annual'},
 lifetime:{title:'평생',price:'₩14,000',period:'한 번 결제',productId:'kotoba_lifetime',basePlan:null}
});
let status={premium:false,kind:null,pending:false,available:false,products:[],privacyOptionsRequired:false};
export const commerceStatus=()=>structuredClone(status);
let refreshPromise=null,lastScreen='';
export function mergeProducts(items){
 return Object.entries(PLANS).map(([plan,definition])=>{
  const item=(items||[]).find(x=>x.plan===plan&&x.productId===definition.productId&&typeof x.price==='string'&&x.price.length<80);
  return {...definition,plan,price:item?.price||definition.price,available:!!item?.available};
 });
}
export async function refreshCommerce(){
 if(!isNative())return status;
 if(refreshPromise)return refreshPromise;
 refreshPromise=(async()=>{
  try{const native=await callNative('commerceStatus',{},15000);status={...status,...native};
   const products=await callNative('commerceProducts',{},15000);status.products=products.items||[];status.available=status.products.some(p=>p.available);
  }catch{status.available=false;}
  finally{refreshPromise=null;}
  return status;
 })();return refreshPromise;
}
export function premiumScreen(){
 const owned=status.premium;
 return `<section class="premium-plans"><div class="premium-intro"><span>${icon('spark')}</span><h3>광고 없이, 내 속도로.</h3><p>단어와 필기, 듣기에만 집중하세요.</p></div>${owned?`<div class="premium-owned">${icon('check')} ${status.kind==='lifetime'?'평생 이용권 사용 중':'프리미엄 이용 중'}</div>`:''}<div class="price-options">${mergeProducts(status.products).map(p=>`<div class="price-card ${p.plan==='annual'?'recommended':''}"><div><strong>${p.title}</strong><span>${p.period}</span></div><div class="price-amount"><b>${esc(p.price)}</b><small>${p.plan==='annual'?'연간 금액 전액 결제':p.plan==='lifetime'?'자동 갱신 없음':'월 단위 결제'}</small></div><button class="btn ${p.plan==='annual'?'primary':'soft'}" data-action="purchase-${p.plan}" ${owned||status.pending||!p.available?'disabled':''}>${owned?'이용 중':status.pending?'구매 확인 중':p.available?'선택':'구매 준비 중'}</button></div>`).join('')}</div><p class="subscription-disclosure">월간·연간 상품은 취소할 때까지 자동 갱신됩니다. 연간 상품은 표시된 연간 금액을 한 번에 결제합니다. 평생 이용권은 코토바의 광고 제거를 위한 일회성 구매입니다. 무료로도 모든 학습 기능을 이용할 수 있습니다.</p>${!status.available&&!owned?'<p class="purchase-note" role="status">상품 정보를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요. 표시 가격은 한국 출시 예정 가격이며 구매 시 Google Play의 최종 가격을 확인해 주세요.</p>':''}<div class="purchase-links"><button data-action="restore-purchases">구매 복원</button><button data-action="manage-subscription">구독 관리</button><a href="./terms.html">이용약관</a><a href="./privacy.html">개인정보처리방침</a></div></section>`;
}
export async function handleCommerceAction(action,toast){
 if(!isNative()){toast('Google Play에서 설치한 앱에서 구매를 이용할 수 있어요.');return;}
 if(action.startsWith('purchase-')){
  const plan=action.replace('purchase-','');if(!PLANS[plan])return;
  if(status.premium||status.pending)return;
  const item=mergeProducts(status.products).find(p=>p.plan===plan);if(!item?.available){toast('상품 정보를 다시 확인해 주세요.');return;}
  const response=await callNative('commerceBuy',{plan},180000);
  toast(response.pending?'결제 완료 후 앱을 다시 열고 구매 복원에서 확인해 주세요.':response.premium?'광고 없이 학습할 수 있어요.':'구매 상태를 확인하고 있어요.');
  await refreshCommerce();return;
 }
 const type={'restore-purchases':'commerceRestore','manage-subscription':'commerceManage','privacy-options':'adPrivacyOptions'}[action];
 if(!type)return;
 const result=await callNative(type,{},30000);
 if(action==='restore-purchases'){status={...status,...result};toast(status.premium?'구매한 이용권을 복원했어요.':status.pending?'구매 내역을 확인하고 있어요.':'현재 이용할 수 있는 구매 내역이 없어요.');}
}
export function notifyScreen(route,session){
 if(!isNative())return;
 const completed=route==='lesson'&&session?.finished&&session?.completed;
 const screen=completed?'completed':route;
 const key=screen+':'+(completed?session.id:'');if(key===lastScreen)return;lastScreen=key;
 callNative('commerceScreen',{screen,completionId:completed?session.id:''},5000).catch(()=>{});
}
