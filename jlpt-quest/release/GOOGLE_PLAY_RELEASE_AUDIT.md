# Google Play 출시 점검 — JLPT 단어장 - 코토바 v0.4.2

재검증일: 2026-10-03. 소스와 Google 공식 문서에 근거한 출시 준비 기록이며 실제 콘솔 신고·게시, 법률 검토 또는 실기기 검증 완료를 뜻하지 않는다.

## 확인된 출시 범위

- 이름: **JLPT 단어장 - 코토바**. 지원 이메일: **501.dingerlab@gmail.com**.
- 운영자: **백하성**, 개발자 표시명: **Studio 501**. 운영자명은 사용자가 제공했다. 계정 인증·주소·결제 프로필 등 콘솔 상태는 별도로 확인한다.
- 출시 국가: **대한민국(KR)**. 대상: **13세 이상(13–15세, 16–17세, 18세 이상)**. 대상 연령 선언과 IARC 콘텐츠 등급은 별개이며 등급 결과를 미리 확정하지 않는다.
- 정식 패키지: `com.studio501.kotoba`. 내부 빌드는 `.debug` 패키지이며 운영 업로드 키로 서명된 release AAB가 아니다.

## 현재 기술 상태

- Android targetSdk / compileSdk **36 / 36**, minSdk **24**.
- 어휘·한국어 뜻·예문·획 데이터는 앱에 포함한다. 학습 기록·설정·필기·단어장 폴더는 기기 내부에 저장하며 자체 학습 동기화 서버는 없다.
- 발음은 **기기에 설치된 일본어 오프라인 TTS 음성만** 사용한다. Android는 네트워크가 필요한 음성과 미설치 음성을 제외하고 웹은 `localService === true`인 일본어 음성을 선택한다. 음성이 없으면 설치 안내를 표시한다. **내장 Ogg 음원과 내장 음원 대체 재생은 없다.** 일본어 음성 설치에는 엔진에 따라 인터넷이 필요할 수 있다.
- 필기는 번들 획 데이터의 모양·방향을 비교하여 연습한다. 현재 Android 의존성에 ML Kit Digital Ink가 없으며 범용 필기 인식 정확도를 검증한 앱으로 표현하지 않는다.
- **INTERNET / ACCESS_NETWORK_STATE 권한이 있다.** 광고·Google Play 상품/구매 조회·향후 구매 검증에 네트워크를 사용한다.
- Google Mobile Ads **25.4.0**, UMP **4.0.0**, Billing Library **9.1.0**, AndroidX WebKit **1.14.0**을 사용한다. 자체 분석 SDK는 없지만 광고 SDK 진단·상호작용 수집은 별도 신고 대상이다.
- 기본 구성은 Google 테스트 광고 ID이며 판매는 `KOTOBA_SELLING_ENABLED=false`다. 상품은 준비 중이고 구매 버튼은 비활성화된다. Billing 상품/기존 구매 조회는 실행될 수 있으므로 판매 비활성화를 모든 네트워크 통신의 부재로 해석하지 않는다.
- 선택한 무료 서버는 `billing-worker/`의 Cloudflare Workers Free·SQLite Durable Objects이며, `BILLING_EVENT_MODE=poll`로 구매마다 Google에서 상태를 확인하고 정기적으로 Voided Purchases API를 대조한다. Google 계정 귀속, Play Integrity, 암호화한 영구 구매 소유권, 환불·삭제 차단을 구현하고 로컬·CI에서 검사했다. 실제 Free 계정 확인·운영 배포·Google 자격증명·예약 작업·Play 결제 검증은 완료되지 않았다. Android 판매와 서버 운영 승인 기본값은 계속 비활성화다. `billing-server/`의 Python RTDN 구현은 별도 참고 소스이며 선택한 무료 배포 방식이 아니다.
- 사용자가 승인한 계정 전환에 따라 기존 AdMob 게시자 `pub-1681642990054558`에서 2026-10-03 앱·배너·전면 광고를 생성했다. 공개 ID는 `admob-production.json`에 기록한다. AdMob 활성화는 완료했지만 AdMob 계정 승인은 대기 중이고, 앱은 Play 스토어 미등록·검토 필요 상태이며 심사 준비 완료를 검증하지 않았다. 개인정보 메시지·app-ads.txt 공개·실제 동의 및 광고 게재도 미검증이다. 내부 테스트는 공식 테스트 광고 ID만 사용한다. Play Console 계정과 지원 이메일 `501.dingerlab@gmail.com`은 기존 설정을 유지한다.
- 소스 `2dabefb`의 CI에서 웹 단위 테스트 210개·Python 서버 테스트 73개·Android 계측 테스트 11개·브라우저 9개 스위트·Worker 테스트 69개가 통과했다. 이 소스 검사 결과는 새 AdMob 계정의 승인·실제 게재, 운영 서버·Google 연결, 실기기 결제 또는 출시 승인 증거가 아니다. 운영 승인 값은 계속 false다.

## Google Play 요건

### Target API와 서명

2026-08-31부터 모바일 신규 앱/업데이트는 API 36 이상이 필요하다. 현재 설정은 36이다. 신규 앱은 **Android App Bundle(AAB)** 및 **Play App Signing**으로 게시한다. 업로드 키를 안전하게 보관하고 실제 release AAB 서명을 검증한다.

공식: https://support.google.com/googleplay/android-developer/answer/11926878
공식: https://support.google.com/googleplay/android-developer/answer/9844279
공식: https://support.google.com/googleplay/android-developer/answer/9842756

### 등록정보

제목은 30자 이하여야 한다. 현재 이름은 이 제한 안에 있다. 순위·할인·공식 승인·합격 보장 표현을 사용하지 않는다. 설명은 제공 기능과 일본어 음성 설치 조건을 밝히며 준비 중인 상품을 현재 판매 중인 기능으로 홍보하지 않는다.

공식: https://support.google.com/googleplay/android-developer/answer/9898842

### 개인정보와 Data safety

Play Console과 앱 내부에 접근 가능한 개인정보처리방침이 필요하다. 현재 정책은 백하성 / Studio 501 / 지원 이메일을 반영한 공개 전 검토본이다. 공개 HTTPS URL, 시행일, 실제 처리 사업자·보관기간·해외 처리 고지를 배포 구성에 맞춰 확정한다.

**현재 앱을 “사용자 데이터 수집·공유 없음”으로 신고할 수 없다.** 로컬 학습 기록과 광고 SDK 처리를 구분한다. IP 기반 대략 위치, 기기/계정 식별자, 광고·제품 상호작용, 진단 정보를 실제 SDK/동의/아동 보호 설정과 대조한다. Google 광고 데이터 안내의 최신 SDK 버전과 프로젝트의 25.4.0 버전 차이도 검토한다. 구매 검증 활성화 시 구매 토큰·상품·설치 식별자·구매 상태의 목적과 보관 정책을 추가한다.

공식: https://support.google.com/googleplay/android-developer/answer/10144311
공식: https://support.google.com/googleplay/android-developer/answer/10787469
공식: https://developers.google.com/admob/android/privacy/play-data-disclosure

### 13세 이상 대상과 광고·동의

사용자가 지정한 최종 대상은 13세 이상이다. Play Console 대상 연령은 13–15세 / 16–17세 / 18세 이상이며 13세 미만 대상 선언은 하지 않는다. 기기에서만 저장하는 연령대 선택은 만 14세 미만 / 14~15세 / 16세 이상이며, 미선택과 14세 미만에는 UMP/GMA 초기화·광고 요청을 차단한다. 14~15세에는 CHILD와 UMP under-age, 16세 이상에는 TEEN을 적용하며 G/npa/게시자 개인화 비활성화를 유지한다. 이전 13~15세 선택은 정확한 경계를 모르므로 재선택한다. 이 결정은 보호자 동의 검증이 구현되지 않은 앱의 보수적인 운영 정책이다. 모든 13세 광고가 일률적으로 법률상 금지된다는 뜻이 아니다.

구매·복원은 별도 만 14세 이상 확인 후에만 Google 계정 연결을 열며 생년월일·보호자 정보를 수집하지 않는다. 미선택·취소·14세 미만에는 Google 구매 인증과 서버 요청이 없다. 법률·정책 준수 완료 또는 실제 SDK 네트워크 동작을 코드 테스트만으로 인증하지 않는다.

앱의 실제 내용·표현이 아동을 대상으로 평가되거나 대상 범위를 변경하면 Families 요건도 다시 검토한다. IARC 설문은 대상 연령 선택과 별개로 실제 어휘·예문에 맞춰 작성한다. 사망·폭력·성·음주 관련 사전 항목도 문맥에 따라 검토하며 등급 결과를 미리 확정하지 않는다.

공식: https://support.google.com/googleplay/android-developer/answer/9893335
공식: https://support.google.com/googleplay/android-developer/answer/9859655

### 계정별 테스트와 16 KB 호환성

구매 확인용 Google SSO는 기기 간 동일 이용권 소유자를 인증하므로 계정 생성·삭제 신고를 적용한다. 설정의 계정 연결·데이터 삭제 요청과 공개 웹 요청 페이지를 준비했다. 공개 URL, 본인 확인, 실제 서버 삭제·필요한 법정 보관·백업 복구 시 삭제 재적용을 검증해야 하며 Google nonce·짧은 인증 수명·Origin·명시적 확인이 있는 재설치 불필요 웹 삭제 코드와 삭제 계정의 구매 조회·복원·재연결 차단을 추가했다. 선택한 polling 서버에서도 삭제 확정 뒤 이용권이 새로 발급되거나 계정 정보가 재생성되지 않는지 실제 운영 환경에서 검사한다. 실제 OAuth 웹 흐름, 보관기간·백업 복구 운영까지는 완료되지 않아 `accountDeletion` gate는 아직 미완료다. [Google Play 계정 삭제 요구사항](https://support.google.com/googleplay/android-developer/answer/13327111).

### 비용 없는 구매·환불 확인 방식의 운영 검증

서버·저장소에 비용을 발생시키지 않는다는 사용자 요청을 적용한다. 실제 Cloudflare 계정이 Workers Free인지 확인하고 유료 부가 기능·자동 유료 전환을 사용하지 않는다. Pub/Sub는 공식 시작 조건에 청구 계정이 필요하므로 활성화하지 않는다. Android Publisher와 Play Integrity도 실제 계정에서 청구 연결 없이 필요한 권한과 호출이 동작하는지 확인해야 한다. 소스의 무료 구성만으로 운영 비용이나 Google 연결 검증을 완료했다고 인증하지 않는다. [Pub/Sub 시작 조건](https://docs.cloud.google.com/pubsub/docs/publish-receive-messages-console).

출시 전 실제 시간별 예약 실행과 Google 환불 조회의 성공 기록을 확인한다. 모든 페이지를 완료해야 성공 시각이 갱신되어야 하며 실패·반복 페이지·30일 초과 대사 공백은 복구 검증 없이 완료로 기록하지 않는다. 마지막 성공 시각이 2시간보다 오래됐거나 미래이면 새 이용권 발급이 차단되는지, 장애 때 기존 이용권을 연장하지 않는지 실제 배포에서 검사한다. 이용권은 최대 1시간이고 구독 만료가 더 빠르면 그 시각에 종료한다. 이 수명은 전체 환불 발견이 1시간 안에 끝난다는 보장이 아니며 Google 기록 반영과 polling 간격에 따른 지연이 있다.

Polling은 서버에 등록되지 않은 새 구매 토큰이나 앱을 닫아 둔 동안 완료된 대기 구매를 자동으로 발견하지 못한다. 앱 재개 시 구매 조회와 필요한 Google 계정 재연결·구매 복원을 실제 Play 설치 앱으로 검사한다. 완료 후 3일 안에 확인하지 못한 구매는 자동 환불될 수 있으며 `PENDING` 상태에 혜택을 먼저 주면 안 된다. [구매 확인 지침](https://developer.android.com/google/play/billing/integrate).

RTDN의 별도 토큰이 필요한 선택적 환불·차지백 의견 제출은 이 무료 모드에서 사용할 수 없다. 상태를 검토 대기 0건 또는 기능 검증 완료로 신고하지 않는다. 일반 Play Console 주문 조회·환불은 그 의견 제출 기능의 대체가 아니다. 기존 RTDN 데이터가 있는 환경의 모드 전환은 미해결 금융 작업과 삭제 기록을 보존하는 별도 이관 검토가 필요하다. [Review Refund 선택 기능](https://support.google.com/googleplay/android-developer/answer/17068375), [토큰을 요구하는 API](https://developers.google.com/android-publisher/api-ref/rest/v3/orders/reviewrefund).

2023-11-13 이후 개인 개발자 계정은 프로덕션 접근 신청 전 **12명 이상이 14일 연속 opt-in한 비공개 테스트**가 필요하다. 계정 종류·생성일·현재 생산 트랙 권한을 콘솔에서 확인한다.

API 35+ 앱의 64-bit 기기 16 KB page size 호환성을 점검한다. 자체 NDK 라이브러리는 없지만 실제 release AAB와 SDK native library 포함 여부 및 콘솔 호환성 결과를 확인한다.

공식: https://support.google.com/googleplay/android-developer/answer/14151465
공식: https://developer.android.com/guide/practices/page-sizes

## 콘텐츠 및 라이선스

- OpenJLPT 기반 파생 어휘는 CC BY-SA 4.0, KanjiVG 파생 획은 CC BY-SA 3.0 출처·라이선스를 유지한다. EDRDG/JMdict 및 예문별 출처도 보존한다.
- 내장 발음 파일은 현재 배포하지 않는다. 과거 Open JTalk/HTS/Piper 음원 빌드 기록을 현재 앱 제공 방식으로 설명하지 않는다.
- JLPT는 기능 설명용 명칭이다. 국제교류기금/JEES의 공식·제휴·승인 앱이나 공식 전수 출제 목록이라고 주장하지 않는다.
- `editorial/audit.json`은 8,451개 전 항목의 assistant 의미 검토 완료와 자동 플래그 0개를 기록한다. 직접 ID 검토 8,396개와 같은 표기·읽기 전파 55개이며, 남은 단어 검토는 0개다. 교정 근거는 `editorial/review042/`에 보존한다. 독립 외부 원어민 검수 완료를 주장하지 않으며 형식 정리를 의미 검수로 계산하지 않는다.
- 창작 예문 164개는 일본어 문장·가나 읽기·한국어 뜻을 두 묶음으로 모두 다시 읽어 확인했다. `editorial/examples042-audit.json`에 검토한 자료의 SHA-256과 ID를 보존하며 외부 원어민 검수와 실제 기기 음성 점검은 별도다.

## 실제 출시 전 남은 항목

1. assistant 단어·예문 검수 증거의 최종 확인과 실제 기기 필기·일본어 음성·오프라인 복원·TalkBack 점검.
2. 13세 이상 청소년 콘텐츠 적합성, UMP 미성년자 동의·광고 데이터 처리와 최종 SDK 설정 확인.
3. 공개 개인정보처리방침/약관의 시행일·URL·운영 세부 정보와 실제 SDK/서버 Data safety 신고.
4. 계정 인증, 한국 배포 설정, 대상 연령, IARC, 앱 액세스, 스토어 이미지와 설명 등록.
5. 운영 AdMob ID·동의 메시지와 상품 설정, 무료 계정·구매 검증 서버·키·시간별 polling·대사 실패 차단·환불/복원/삭제·대기 결제와 앱 재개 테스트. Pub/Sub 없는 운영의 한계를 확인하고 실제 Google 연결·예약 실행 증거를 남긴다.
6. 업로드 키·release AAB 서명·Play App Signing·해당 계정의 비공개 테스트 및 사전 출시 보고서.

사용자는 이름 변경·개선·검사와 광고·결제 완성 후 한국 출시를 요청했다. 이전의 일괄 제출 금지 지시를 반복하지 않는다. 그러나 요청 자체가 위 검증·신고의 완료 증거는 아니다. 실제 증거 없이 `release-approval.json`을 true로 바꾸지 않으며 확인되지 않은 계정 정보나 정책 준수 상태를 대신 인증하지 않는다.
