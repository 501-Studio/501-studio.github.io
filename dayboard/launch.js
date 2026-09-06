// A private connection file may supply a key in the URL fragment.
// Remove the fragment before any network request; never use a query parameter.
import { Store } from './core.js';
let connectionError = '';
const fragment = new URLSearchParams(location.hash.slice(1));
const connectionKey = fragment.get('connect');
if (connectionKey !== null) {
  history.replaceState(null, '', location.pathname + location.search);
  if (!/^[a-f0-9]{64}$/i.test(connectionKey)) {
    connectionError = '연결 파일이 올바르지 않습니다. 전달받은 연결키로 다시 연결하세요.';
  } else {
    try {
      const bootstrapStore = new Store();
      await bootstrapStore.connect(connectionKey);
    } catch {
      connectionError = '개인 연결에 실패했습니다. 네트워크를 확인하거나 연결키를 직접 입력하세요.';
    }
  }
}
await import('./app.js?v=1.0.1');
if (connectionError) {
  const errorElement = document.getElementById('connect-error');
  if (errorElement) errorElement.textContent = connectionError;
}
