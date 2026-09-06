// First-use setup is user-operated. Existing credentials are never reset.
export const PROJECT_ID='mahmzgdseyamqcffxwyd';
export const SETUP_SLOT='dayboard.pending-connection.v1';
export const CLIENT_PATTERN=/^\d+-[\w-]+\.apps\.googleusercontent\.com$/;
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateConnection(value){
 if(!value||value.format!=='dayboard.connection'||value.version!==1||value.projectId!==PROJECT_ID||!UUID_PATTERN.test(value.workspaceId||'')||!/^[a-f0-9]{64}$/.test(value.key||''))throw new Error('이 앱의 올바른 연결 파일이 아닙니다. 일정 백업 파일과 연결 파일은 다릅니다.');
 return {format:'dayboard.connection',version:1,projectId:PROJECT_ID,workspaceId:value.workspaceId.toLowerCase(),key:value.key};
}
export async function prepareConnection(){const key=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');return validateConnection({format:'dayboard.connection',version:1,projectId:PROJECT_ID,workspaceId:crypto.randomUUID(),key});}
export async function connectionSQL(connection){const c=validateConnection(connection);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(c.key));const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');return `-- 본인 Supabase 프로젝트의 SQL Editor에서 직접 실행하세요.\n-- 새 빈 보드 1개만 만듭니다. 기존 보드, 연결키, 권한, 요금제는 바꾸지 않습니다.\n-- 아래는 연결키 원문이 아닌 SHA-256 해시입니다.\nbegin;\ninsert into dayboard_private.workspaces (id, name, key_hash)\nvalues ('${c.workspaceId}'::uuid, 'Dayboard · 개인 보드', '${hash}')\non conflict (id) do nothing;\nselect id, name, revision from dayboard_private.workspaces\nwhere id = '${c.workspaceId}'::uuid;\ncommit;`;}
export function setupError(error){const message=error?.message||String(error);if(message.includes('UNAUTHORIZED'))return '아직 연결되지 않았습니다. 본인 Supabase SQL Editor에서 생성문을 실행했는지 확인하세요. 기존 연결 파일이라면 키가 변경되었을 수 있습니다.';if(message.includes('Failed to fetch')||message.includes('abort'))return '네트워크 연결을 확인한 뒤 다시 시도하세요. 준비한 연결 정보는 이 탭에 유지됩니다.';if(message.includes('origin_mismatch'))return 'Google 클라이언트의 승인된 JavaScript 원본에 현재 앱 주소를 추가하세요.';if(message.includes('access_denied'))return 'Google 접근에 동의하지 않았습니다. 테스트 사용자와 캘린더 권한을 확인하세요.';return message;}
