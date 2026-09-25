# Google Play 출시 점검 — Kotoba v0.3.4

기준일: 2026-09-25. 이 문서는 기술/정책 체크리스트이며 법률 자문이 아닙니다.

## 현재 기술 상태

- Android targetSdk / compileSdk: **36 / 36**.
- Google Play용 앱은 단어팩, 획 데이터, 일본어 발음 파일을 번들에 포함하고 INTERNET 권한을 사용하지 않는다.
- 계정, 광고 SDK, 분석 SDK, 자체 서버 동기화 없음.
- 손글씨: APK 내장 2,244문자 / 22,615획.
- 듣기: Open JTalk + HTS Voice NIT ATR503 M001로 빌드 시 생성한 Ogg Opus를 내장. 각 듣기 단계는 1회 자동재생 후 사용자가 필요할 때 다시 듣는다.
- 신규 Google Play 앱은 APK가 아니라 **Android App Bundle (AAB)** 로 게시해야 한다.
- Java/AndroidX 전용이며 NDK native library를 직접 포함하지 않는다.

## Google Play 필수/주요 항목

### 1. Target API
2026-08-31부터 모바일 새 앱/업데이트는 Android 16, API 36 이상이 필요하다. 현재 프로젝트는 targetSdk 36으로 맞춰져 있다.

공식: https://support.google.com/googleplay/android-developer/answer/11926878

### 2. Android App Bundle + Play App Signing
신규 앱은 AAB로 게시해야 하며 Play App Signing을 사용한다. 프로덕션에서는 업로드 키를 별도로 안전하게 보관하고 서명된 release AAB를 만들어야 한다.

공식: https://support.google.com/googleplay/android-developer/answer/9844279
공식: https://support.google.com/googleplay/android-developer/answer/9842756

### 3. 개인정보처리방침
모든 앱은 개인정보처리방침을 Play Console에 등록하고 앱 내부에서도 접근 가능해야 한다. 개인정보를 수집하지 않는 앱도 정책을 제출해야 한다. 정책에는 개발자 식별/문의처, 데이터 처리, 보관·삭제 정책이 포함되어야 한다.

현재 privacy.html은 기능 내용은 구현과 일치하지만 **개발자 법적명·문의 이메일·공개 HTTPS URL이 미확정**이라 프로덕션 차단 상태다.

공식: https://support.google.com/googleplay/android-developer/answer/10144311

### 4. Data safety
Play Console의 Data safety 양식을 작성해야 한다. 현재 구현 자체는 서버 전송, 인터넷 권한, 광고/분석 SDK가 없으므로 기술적으로는 “앱이 사용자 데이터를 수집/공유하지 않음”으로 설계되어 있다. 제출 직전 실제 release dependency/manifest와 일치하는지 다시 확인한다.

학습 기록, 필기 획, 별표, 회독 기록은 기기 내부에만 저장된다. 사용자가 직접 내보내는 JSON 백업은 자체 서버로 전송되지 않는다.

공식: https://support.google.com/googleplay/android-developer/answer/10787469

### 5. 콘텐츠 등급
IARC 콘텐츠 등급 설문을 작성해야 한다. 교육용 어휘 앱의 실제 콘텐츠에 맞춰 정직하게 응답한다.

공식: https://support.google.com/googleplay/android-developer/answer/9859655

### 6. 타겟층
대상 연령을 Play Console에서 명시해야 한다. 만 13세 미만을 대상에 포함하면 Families 관련 정책 검토가 추가로 필요하다. 현재 앱 코드가 특정 연령대를 확정하지 않으므로 프로덕션 전 사업 판단이 필요하다.

### 7. 신규 개인 개발자 계정 테스트
2023-11-13 이후 생성된 개인 개발자 계정이라면, 프로덕션 접근 신청 전 최소 12명의 테스터가 14일 연속 opt-in한 비공개 테스트가 필요하다.

공식: https://support.google.com/googleplay/android-developer/answer/14151465

### 8. 16 KB page size
Google은 API 35+ 앱의 64-bit 기기 16KB page size 지원을 요구한다. Android 공식 문서상 Java/Kotlin-only 앱은 기본적으로 호환되며 native code가 있는 앱이 주된 점검 대상이다. 현재 프로젝트는 자체 NDK 라이브러리를 포함하지 않는다. release AAB 업로드 후 Play Console의 호환성 경고도 재확인한다.

공식: https://developer.android.com/guide/practices/page-sizes

## 저작권 / 라이선스

### 어휘
OpenJLPT 고정 소스를 기반으로 한 파생 데이터는 CC BY-SA 4.0 고지를 유지한다. EDRDG/JMdict 및 분류 출처를 함께 표시한다. 앱은 공식 JLPT 전체 목록이라고 주장하지 않는다.

### 획
KanjiVG 파생 stroke data는 CC BY-SA 3.0. 저작자/프로젝트/라이선스 고지와 파생 데이터의 동일 라이선스를 유지한다.

### 발음
HTS Voice “NIT ATR503 M001” v1.05는 CC BY 3.0. 설치 앱의 licenses.html에서 Nagoya Institute of Technology / Tokyo Institute of Technology 저작권과 라이선스를 사용자에게 표시한다. Open JTalk와 NAIST dictionary는 빌드 도구로만 사용하고 실행 엔진/사전은 설치 앱에 포함하지 않는다.

### UI/브랜드
Duolingo의 캐릭터, 아이콘, 음원, 문구, 질문, 화면 자산을 복사하지 않는다. 일반적인 회독/퀴즈/챕터 패턴과 자체 보라색 UI를 사용한다. “JLPT” 명칭은 시험을 설명하는 참조 용도로만 사용하고 공식·제휴·승인 표현을 하지 않는다.

## 이용약관

terms.html을 앱에 내장했다. 기능/책임/비제휴/제3자 라이선스/로컬 데이터 내용을 포함한다. 다만 **개발자 법적명·지원 이메일·적용 법률/분쟁 처리 정보**가 아직 비어 있으므로 정식 약관으로 승인하지 않는다.

## 현재 프로덕션 차단 항목

1. 전체팩 중 영어 뜻 8,054개를 한국어로 번역·교육 검수.
2. 실제 Android 기기 다종 + 실제 사용자 필체로 60% 획 유사도 기준 검증.
3. 오프라인 자동 듣기, 백업/복원, 프로세스 종료, 접근성/TalkBack 실제 기기 검증.
4. 개인정보처리방침/이용약관의 개발자 법적 정보와 공개 HTTPS URL 확정.
5. Play Console Data safety, 대상 연령, IARC 콘텐츠 등급 작성.
6. 정식 applicationId 확정 여부 검토.
7. 업로드 키 생성/보관, release AAB 서명, Play App Signing.
8. 해당되는 경우 12명/14일 closed test.
9. 한국어 스토어 설명, 스크린샷, feature graphic, 지원 이메일/웹사이트 준비.
10. 프로덕션 직전 최신 정책 및 SDK/의존성 재검토.

위 항목을 완료했다는 증거가 없는 상태에서는 release-approval.json을 true로 변경하지 않는다.
