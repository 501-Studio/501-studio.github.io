# 코토바 0.3.7 내부 빌드

## 전체 소스 ZIP에서 재빌드

Node.js 22+, Python 3.11+, JDK 17, Gradle 8.13, Android SDK 36 / build-tools 36.0.0 환경을 사용합니다.

```sh
cd jlpt-quest
npm run build
npm test
npm run android:sync
cd ../kotoba-android
gradle --no-daemon assembleDebug bundleDebug testDebugUnitTest lintDebug
```

전체 ZIP에는 한국어 어휘, 가나 획, 예문과 7,050개의 새 발음 파일이 들어 있습니다. 일반 build는 무결성만 검사하며 영어 뜻이나 이전 HTS 음성으로 바꾸지 않습니다. 구형 build-offline-audio.py는 이 버전의 빌드 경로에서 사용하지 않습니다.

GitHub에는 대용량 음성 파일을 중복 커밋하지 않습니다. GitHub 소스로 작업할 때는 검증된 neural-audio Actions artifact를 먼저 복원해야 합니다. 단어/예문/음원 재생성은 일반 앱 빌드와 별도 작업입니다.

## 설치 서명

CI debug 인증서는 실행 환경에 따라 달라질 수 있습니다. 기존 앱의 서명과 다른 APK는 덮어쓸 수 없습니다. 기록을 백업한 뒤 설치해야 합니다. 정식 배포 전에는 운영자가 관리하는 업로드 키와 Play App Signing을 설정해야 합니다. 개인 키는 이 ZIP에 포함하지 않습니다.

## 출시 상태

Play 심사 통과 또는 출시 승인을 의미하지 않습니다. 운영 상품·광고 ID, 서버, 법적 문서, 스토어 설정과 실제 기기 QA/콘텐츠 검수는 release 체크에서 별도로 확인합니다. 미완료 승인 조건을 자동으로 참으로 바꾸지 않습니다.
