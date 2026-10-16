# Google Play / AdMob 입력 문서 — v0.3.6

상태: **작성 초안. 콘솔에 저장하지 않음. 심사 제출/게시하지 않음.**
계정 요청: 501.dingerlab@gmail.com. Google 안내 이메일의 표시명은 Studio 501이지만, 법적 개인/사업자명 및 계정 종류를 확인한 것은 아닙니다.

## 1. 앱 만들기 / 기본 등록정보

| 필드 | 입력 초안 | 처리 상태 |
|---|---|---|
| 앱 이름 | 코토바: JLPT 단어 회독 | 작성됨 |
| 기본 언어 | 한국어 ko-KR | 제안 |
| 앱/게임 | 앱 | 제안 |
| 무료/유료 | 무료 다운로드, 광고 및 인앱 구매 | 요청 반영 |
| 카테고리 | 교육 | 제안 |
| 지원 이메일 | 501.dingerlab@gmail.com | 사용자가 제공 |
| 개발자 표시명 | Studio 501 | 받은 이메일에서 확인 |
| 법적명 / 주소 / 연락전화 / 세금 / 결제 프로필 | 소유자 확인 필요 | 미입력 |
| 간단한 설명 | 30단어씩 회독하고, 모르는 단어를 듣고 쓰며 익히는 일본어 학습 앱 | 작성됨 |
| 전체 설명 | store-listing-ko.txt 참조 | 작성됨 |
| 개인정보처리방침 URL | 실제 공개 HTTPS 주소 필요 | 미배포 |
| 웹사이트 / app-ads.txt URL | 실제 소유 도메인 필요 | 미배포 |

개인정보처리방침과 이용약관은 앱에 동봉합니다. 공개 페이지의 법적 주체와 스토어 개발자 정보가 일치하는지 소유자가 확인해야 합니다. 지금은 정식 법률 검토가 완료된 문서가 아닙니다.

## 2. 상품 설정 초안

구독 상품 ID: `kotoba_premium`, 이름: `코토바 프리미엄`, 설명: `코토바의 광고를 제거하고 학습에 집중하세요.`
기본 요금제 `monthly`: 자동 갱신, 1개월, 한국 출시 예정 가격 1,800원.
기본 요금제 `annual`: 자동 갱신, 1년, 연간 총액 9,000원(매월 결제가 아님).
일회성 상품 ID: `kotoba_lifetime`, 이름: `코토바 평생 이용권`, 한국 출시 예정 가격 14,000원. 소모성 소비 호출 금지, 광고 제거 비소모성 이용권.
무료 체험/할인 오퍼는 설정하지 않았습니다. 국가별 세금·가격 환산·판매 국가·유예기간·보류 정책은 콘솔 확인 후 결정합니다. 화면에는 API가 반환하는 실제 결제 가격을 우선 표시합니다.

상품과 기본 요금제는 **실제 콘솔에 생성/활성화하지 않았습니다**. 디버그 빌드는 실판매가 꺼져 있고, 등록된 상품·검증 서버·키가 확인되기 전 구매 버튼이 활성화되지 않습니다.

## 3. 광고 / 동의

AdMob 앱 표시명 `코토바`, 플랫폼 Android. 실제 출시 package `com.studio501.kotoba`를 Play 계정에서 확정하세요. `.debug` 패키지는 테스트용입니다.
광고 단위명 제안: `kotoba_home_banner`, `kotoba_chapter_break_interstitial`.
실제 AdMob 앱 ID 및 광고 단위 ID는 미확인. 현재 Google의 공식 테스트 ID만 사용합니다.
배너는 홈/단어장/내 기록 하단 별도 네이티브 영역. 필기장/정답 버튼과 겹치지 않습니다.
전면 광고는 사용자가 완료 화면에서 이동을 선택했을 때만, 최소 2챕터 및 180초 간격. 로딩 실패·오프라인·유료·구매 확인 중에는 건너뜁니다.
UMP 동의 확인 후 요청. 개인정보 선택 변경 기능 제공. 비개인화 요청도 개인정보 미처리를 의미하지 않습니다.
대상 연령이 확정되지 않았습니다. 아동 대상 포함 여부와 TFCD/TFUA 태그·Families 적합성을 확인 전 프로덕션은 차단합니다.

## 4. Data safety 작성 근거 (출시 SDK/서버 설정과 대조 필요)

| 데이터 | 현재 계획/구현 | 양식 검토 메모 |
|---|---|---|
| 단어 진도 / 필기 획 / 별표 | 기기 내부만. 광고 요청/검증 서버로 전송하지 않음 | 수집/공유와 로컬 처리를 구분 |
| IP 기반 대략 위치 | Google Ads SDK 데이터 안내상 사용 가능 | 정밀 위치 권한 없음. 근사 위치 검토 |
| 기기/기타 식별자 | Ads SDK 광고/분석 목적 사용 가능 | SDK 및 동의 지역별 실제 설정 검토 |
| 광고 상호작용 | Ads SDK 수집/공유 | 광고/마케팅, 분석, 사기 방지 목적 검토 |
| 진단/성능 | Ads SDK | 진단/분석 목적 검토 |
| 구매 토큰 / 상품 / 설치 식별자 | 검증 서버와 Google Play에 전송 예정 | 구매 내역/앱 기능/사기 방지. 서비스 제공자 예외 적용은 소유자 확인 |
| 카드번호 | 앱/검증 서버가 받지 않음 | Google Play 결제 화면에서 처리 |

실제 API gateway 로그/IP 보관, RTDN 영수증 저장 정책은 서버 배포 전 확정해야 합니다. 개인정보 보관기간을 임의 숫자로 선언하지 않습니다. 학습 기록 JSON 내보내기는 사용자 동작이며 자체 서버 업로드가 아닙니다.

## 5. 앱 액세스 / 등급 / 타겟층

학습 로그인 없음. 모든 핵심 학습 기능은 무료 이용 가능합니다. 프리미엄 검증은 Play 라이선스 테스터로 별도 수행해야 합니다. 가짜 결제 계정/심사용 비밀번호를 만들지 않았습니다.
콘텐츠 등급 설문: 단어 데이터에 사망·폭력·성·음주 관련 사전 항목이 포함될 수 있습니다. `content-rating-review.json`에 실제 어휘 예시가 있으므로 자동으로 모든 질문에 '없음'을 선택하지 마세요.
대상 연령, 판매 국가, 광고 여부, 앱 액세스, Data safety, IARC 설문은 **작성 근거만 준비했으며 실제 저장하지 않았습니다**.

## 6. 업로드 직전 절차 / 소유자 확인

- 개발자 인증과 앱 서명키 등록 상태 확인. 해당 계정의 2026-09-30 기한 안내 이메일이 있습니다. 완료 상태는 콘솔에서 확인해야 합니다.
- 업로드 키를 생성·암호화 보관하고 Play App Signing을 설정하세요. CI 임시 debug 서명을 운영 키로 쓰지 마세요.
- 별도 공개 개인정보처리방침, 이용약관, 지원 이메일을 등록하고 웹 접근성을 확인하세요.
- AdMob 개인정보 메시지와 실제 ID, Play 상품/기본 요금제를 등록한 뒤 검증 서버에 최소 권한 자격 증명을 설정하세요.
- 구독 신규/갱신/취소/유예/보류/복원, 평생 구매/환불/구매대기, 네트워크 실패, 광고 동의 철회, 광고 제거를 실기기 라이선스 테스터로 검증하세요.
- 해당되는 개인 계정은 비공개 테스터 요구를 충족해야 합니다. 계정 생성일/종류를 추정하지 마세요.
- signed release AAB 업로드, 사전 출시 보고서, 접근성/TalkBack/큰 글씨/16KB 기기 검토, 결제/광고 SDK 데이터 신고 확인 후 진행하세요.
- **변경사항 검토 → 심사 제출/게시 직전 정지. 사용자의 별도 승인 없이 제출하지 않습니다.**

## 공식 확인 자료

확인 기준일 2026-09-27. 정책은 콘솔 제출 시 재확인합니다.
- Billing 구현: https://developer.android.com/google/play/billing/integrate
- Billing 보안: https://developer.android.com/google/play/billing/security
- 구독 수명주기: https://developer.android.com/google/play/billing/lifecycle/subscriptions
- Ads 데이터 공개: https://developers.google.com/admob/android/privacy/play-data-disclosure
- UMP/동의: https://developers.google.com/admob/android/privacy
- AdMob 테스트: https://developers.google.com/admob/android/test-ads
- 개인정보 정책: https://support.google.com/googleplay/android-developer/answer/10144311
- Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- 구독 정책: https://support.google.com/googleplay/android-developer/answer/9900533
- 타겟 API: https://support.google.com/googleplay/android-developer/answer/11926878
- 계정별 테스트: https://support.google.com/googleplay/android-developer/answer/14151465

특정 콘솔 계정의 최신 요구가 이 문서보다 우선합니다. Chrome 연결 도구가 없어 계정 화면을 직접 확인하지 못했습니다.
