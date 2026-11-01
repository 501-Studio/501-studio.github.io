// Dayboard retired on 2026-11-02 at the owner's request.
// Do not load app modules or make any network requests.
if (location.hash) {
  history.replaceState(null, '', location.pathname + location.search);
}
try {
  localStorage.removeItem('dayboard.key');
  sessionStorage.removeItem('dayboard.pending-connection.v1');
} catch (_) {
  // Storage may be blocked by the browser; no connection is attempted.
}
const container = document.getElementById('app');
if (container) {
  container.innerHTML = '<main class="retired"><h1>Dayboard</h1><p>Dayboard 사용 및 동기화가 종료되었습니다.</p><p>이 페이지는 Supabase 또는 Google Calendar에 연결하지 않습니다.</p><p>기기에 저장된 Dayboard 연결 파일은 별도로 삭제해 주세요.</p></main>';
}
