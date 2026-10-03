# 코토바 0.3.6 — 검증용 출시 준비 소스

소비자 화면: 한 줄 일본어 → 아이콘 듣기 → 한국어 뜻. 30단어 회독·모르는 단어 시험,
쓰기 3회(따라 쓰기 2회+기억해서 쓰기 1회), 연속 터치 보정, 굵은 획을 구현합니다.
학습 자산(어휘·발음·획)은 오프라인입니다. 광고/결제는 연결이 필요하며 실판매는 꺼져 있습니다.

가격 설정안: 월 1,800원 / 연 9,000원 / 평생 14,000원. 실제 가격은 Play 상품 응답이 권위값입니다.
현재 광고는 Google 테스트 ID, 실제 구독 상품 생성·판매·서버 배포는 하지 않았습니다.

## 콘텐츠 검수

모든 뜻의 복수 의미 구분은 쉼표입니다. N5 669 + N4 655 전 항목 및 상위 급수 오역 의심
항목을 검토했습니다. 정확한 변경/검토 수치는 `editorial/audit.json`을 확인하세요.
구분자 정리만 한 항목은 의미 검수 수에 포함하지 않았습니다. 남은 의미 검수와 별도 사람 검수가
완료되었다고 주장하지 않습니다. `release:check`는 현재 의도적으로 실패합니다.

## 실행/빌드

Node22 / Python3 / Java17 / Android SDK36 / Gradle8.13.

```sh
cd jlpt-quest
npm test
npm start
npm run android:sync
cd ../kotoba-android
gradle :app:assembleDebug :app:bundleDebug :app:testDebugUnitTest :app:lintDebug
```

받은 완전 소스에는 오프라인 발음도 들어 있습니다. GitHub 소스만 체크아웃한 경우 이전에 검증된
음성 artifact를 복원하거나 `npm run audio:build`에 필요한 Open JTalk 도구를 설치해야 합니다.
뜻 수정은 `editorial/overrides036.json` 및 `scripts/apply-editorial.py`로 재현합니다.

`release/`는 콘솔 입력 초안입니다. 계정에 저장된 양식이 아닙니다. 법적 신원·정책URL·AdMob ID·
Play 상품·서버 자격 증명·업로드 키·실기기 테스트는 소유자/연결된 콘솔 확인이 필요합니다.
프로덕션은 의미 검수·법적/결제/광고동의 승인 전 차단됩니다.
