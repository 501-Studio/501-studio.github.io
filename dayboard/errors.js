// Keep validation failures separate from network/session failures.
const COPY = {
  CHRONICLE_VERSION: "모험 데이터 버전을 확인해 주세요. 새로고침 후 다시 시도하세요.",
  CHRONICLE_ORDER: "이야기는 앞 장부터 진행합니다. 최신 기록을 불러와 주세요.",
  CHRONICLE_LOCKED: "이야기 해금에 필요한 누적 예상시간이 아직 부족합니다.",
  CHRONICLE_HISTORY_IMMUTABLE: "이미 저장한 이야기와 획득 기록은 덮어쓰거나 삭제할 수 없습니다.",
  CHRONICLE_TIME: "모험 기록 시각이 올바르지 않습니다.",
  CHRONICLE_RECORDS: "모험 기록 형식이나 보관 개수를 확인해 주세요.",
  CHRONICLE_DUPLICATE: "이미 보관한 모험 기록입니다.",
  CHRONICLE_MISSION_LOCKED: "이 의뢰에 필요한 이야기와 실행 기록을 먼저 채워 주세요.",
  CHRONICLE_TITLE_LOCKED: "칭호를 얻기 위한 조건이 아직 부족합니다.",
  CHRONICLE_TITLE_OWNERSHIP: "먼저 획득한 칭호만 장착할 수 있습니다.",
  CHRONICLE_TALENT_POINTS: "이야기 4장마다 얻는 숙련 포인트가 필요합니다.",
  CHRONICLE_TALENT_ORDER: "이 길의 앞 단계부터 습득해 주세요.",
  CHRONICLE_TALENT_HISTORY: "이미 습득한 성장 기록은 보존됩니다.",
  CHRONICLE_CAMP_LOCKED: "아직 열리지 않은 대륙입니다. 앞 이야기와 시간 조건을 확인해 주세요.",
  CHRONICLE_SHOP_LOCKED: "이 지역 상품은 앞 이야기와 누적 예상시간 조건을 채우면 열립니다.",

  INVALID_PARENT: '업무의 상위 연결이 맞지 않습니다. 업무는 프로젝트에, 세부 업무는 상위 업무에 연결해 주세요. 최신 일정을 불러온 뒤 확인하세요.',
  SUBTASK_REQUIRES_PARENT: '세부 업무에는 상위 업무를 선택해야 합니다.',
  PROJECT_CANNOT_HAVE_PARENT: '프로젝트에는 상위 업무를 지정할 수 없습니다.',
  DUPLICATE_ID: '같은 업무 또는 일정이 중복되어 있습니다. 가져올 항목을 확인해 주세요.',
  INVALID_KIND_STATUS: '업무 구분이나 상태를 확인해 주세요.',
  UNKNOWN_TASK: '연결할 업무가 없거나 삭제되었습니다. 최신 일정을 불러와 다시 선택해 주세요.',
  INVALID_STATE: '일정 데이터 형식을 확인해 주세요. 기존 저장 데이터는 유지됩니다.',
  UNAUTHORIZED: '연결키가 맞지 않거나 재발급된 키입니다. 연결키를 확인하세요.',
  VERSION_CONFLICT: '다른 기기에서 일정이 바뀌었습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.',
  PROPOSAL_EXPIRED: '제안의 유효기간이 지났습니다. 새 제안을 만들어 주세요.',
  PINNED_ORDER: '핀 고정 순서는 AI가 변경할 수 없습니다. 앱에서 고정을 해제하세요.',
  LOCKED_EVENT: '고정된 일정은 자동으로 변경할 수 없습니다. 고정을 해제하거나 다른 시간을 선택하세요.',
  APPROVAL_REQUIRED: '변경 내용을 먼저 확인하고 승인해 주세요.',
  INVALID_TIME_RANGE: '일정 종료 시간은 시작 시간보다 뒤여야 합니다.',
  TIMEZONE_REQUIRED: '일정 시간에 시간대 정보가 필요합니다.',
  INSUFFICIENT_STARS: '별조각이 부족합니다. 완료 기록과 보유 별조각을 확인해 주세요.',
  ITEM_NOT_OWNED: '먼저 상점에서 교환한 아이템만 장착할 수 있습니다.',
  SHOP_LEVEL_LOCKED: '아직 이 아이템의 필요 레벨에 도달하지 않았습니다.',
  CHECKIN_OUTSIDE_TARGET: '설정한 반복 목표 횟수를 초과할 수 없습니다.',
  CHECKIN_DATE_NOT_ALLOWED: '반복 시작일과 실행 요일을 확인해 주세요. 미래 날짜에는 완료를 기록할 수 없습니다.',
  DUPLICATE_CHECKIN: '이미 기록한 완료 회차입니다. 최신 상태를 확인해 주세요.',
  ROUTINE_USE_CHECKINS: '반복 업무는 각 회차의 완료 버튼으로 기록해 주세요.'
};
export const errorMessage = error => error?.message || String(error || '알 수 없는 오류');
export function isConnectionError(error) {
  const message = errorMessage(error);
  return error?.name === 'AbortError' || error?.status >= 500 ||
    [401, 403, 408, 429].includes(error?.status) ||
    /UNAUTHORIZED|Failed to fetch|NetworkError|network request failed|aborted|timeout|HTTP 5\d\d/i.test(message);
}
export function readableError(error) {
  const message = errorMessage(error);
  const code = Object.keys(COPY).find(key => message === key || message.startsWith(key + ':'));
  if (code) return COPY[code] + (error?.itemTitle ? ` (항목: ${error.itemTitle})` : '');
  if (isConnectionError(error)) return '연결이 원활하지 않습니다. 저장 결과를 확인할 수 없으니 새로고침으로 최신 상태를 확인한 뒤 다시 시도하세요.';
  return message;
}
export function rpcError(payload, status) {
  const error = new Error(payload?.message || `HTTP ${status}`);
  error.status = status;
  error.code = payload?.code || '';
  return error;
}
