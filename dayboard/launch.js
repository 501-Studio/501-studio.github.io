// Remove private URL fragments before requests. Never put credentials in query parameters.
import {Store} from './core.js';
let connectionError='';
const fragment=new URLSearchParams(location.hash.slice(1));
const connectionKey=fragment.get('connect');
if(connectionKey!==null){history.replaceState(null,'',location.pathname+location.search);if(!/^[a-f0-9]{64}$/i.test(connectionKey)){connectionError='연결 파일이 올바르지 않습니다. 전달받은 연결키로 다시 연결하세요.';}else{try{const bootstrapStore=new Store();await bootstrapStore.connect(connectionKey);}catch{connectionError='개인 연결에 실패했습니다. 네트워크를 확인하거나 연결키를 직접 입력하세요.';}}}
await import('./app.js?v=2.0.0');
if(connectionError){const el=document.getElementById('connect-error');if(el)el.textContent=connectionError;}
// Onboarding augments fixed entry slots without changing schedule or credential APIs.
const {installSetup}=await import('./setup.js?v=1.0.2');
installSetup();
