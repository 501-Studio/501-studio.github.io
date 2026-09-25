# v0.3.4 개발 기록

## 구현 완료
- [x] 30단어 챕터 / 회독 횟수
- [x] 아는 단어 / 모르는 단어 빠른 분류
- [x] 히라가나·뜻 개별 표시
- [x] 모르는 단어만 집중 시험
- [x] 모바일 객관식 2×2
- [x] 시작 위치 비의존 60% 형태 유사도 획 판정
- [x] APK 내장 획 데이터
- [x] N1~N5 전체 어휘 APK 내장
- [x] 빌드 시 Open JTalk로 N1~N5 발음 생성
- [x] 오프라인 Ogg Opus 발음 APK 내장
- [x] 듣기 화면 진입 시 1회 자동 재생 + 수동 다시 듣기
- [x] Android 기기 TTS 의존성 제거
- [x] Android INTERNET 권한 없음
- [x] 개인정보처리방침/이용약관/라이선스 페이지 앱 내장
- [x] Google Play release gate 강화

## 출시 전 필수
- [ ] 전체 한국어 뜻/급수 교육 검수
- [ ] 실제 Android 다기종 필기/음성/백업/복원 QA
- [ ] TalkBack 및 확대 글자 접근성 QA
- [ ] 개발자 법적명/지원 이메일/개인정보 문의 이메일 확정
- [ ] 공개 HTTPS 개인정보처리방침 URL 배포
- [ ] Data safety / 타겟층 / IARC 등급 제출
- [ ] applicationId 최종 확정
- [ ] 업로드 키 생성 및 안전 보관
- [ ] signed release AAB / Play App Signing
- [ ] 해당되는 경우 12명 14일 closed test
- [ ] Play Console pre-launch report와 기기 카탈로그 확인

검증 전 release-approval.json을 true로 변경하지 않는다.
