# 코토바 구매 검증 서버 무료 운영안

작성일: 2026년 10월 3일. 서버·저장소 비용을 발생시키지 않는다는 요청에 따라 유료 Render 배포안을 철회했습니다. 대안은 **Cloudflare Workers Free와 SQLite 기반 Durable Objects**입니다. 실제 Free 계정에서 무료 한도 안에 운영하면 서버·저장소 요금은 월 US$0입니다. 한도 초과 시 유료 전환 대신 요청을 제한하는 방침입니다.

이 문서는 선정한 구성과 전환 조건입니다. Cloudflare 자원을 생성하거나 서버를 배포하지 않았고, 현재 Python 서버의 이식도 아직 완료하지 않았습니다. 광고·결제를 완성한 뒤 출시한다는 기존 요청을 유지합니다.

## Render 비용과 철회한 설정

기존안은 Starter 서버 월 US$7과 영구 디스크 1GB 월 US$0.25로 기본 월 US$7.25입니다. 추가 사용량과 세금은 별도일 수 있습니다. 이 코토바 서버는 생성하지 않아 해당 배포안에 따른 비용은 발생하지 않았습니다. 사용자의 다른 Render 서비스나 계정 전체 청구 상태를 확인한 것은 아닙니다. [Render 공식 비용 안내](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses)

Render 무료 웹 서버에는 영구 디스크를 연결할 수 없고, 유휴 상태에서 중지됩니다. 무료 PostgreSQL도 만료되므로 구매 소유권과 환불 기록의 장기 저장소로 적합하지 않습니다. 따라서 기존 서버를 무료 Render로 바꾸기만 하는 방안은 채택하지 않습니다. [Render 무료 서비스 제한](https://render.com/docs/free)

기본 Blueprint인 `render.yaml`은 제거하고, 철회한 안은 `render.paid-reference.yaml`이라는 참고 파일로 옮겼습니다. 이 파일을 배포하면 비용이 발생하므로 사용하지 않습니다.

## 선정한 구성과 무료 한도

| 구성 | 용도 | Free 요금제의 한도 |
| --- | --- | --- |
| Workers | HTTPS 요청 수신과 라우팅 | 하루 요청 100,000회, 요청당 CPU 10ms |
| SQLite 기반 Durable Objects | 구매·환불·삭제 상태와 인증·서명 처리 | 하루 요청 100,000회, 실행량 13,000 GB-s |
| Durable Objects SQL 저장소 | 재배포 후에도 유지할 구매 기록 | 하루 500만 행 읽기·10만 행 쓰기, 계정 전체 5GB |
| workers.dev 주소 | API와 구매 계정 삭제 페이지 | 별도 도메인 구매 없이 기본 HTTPS 주소 사용 |

요청 수와 데이터 한도는 계정의 다른 사용량과 함께 계산되며 사용자 수와 같지 않습니다. 한 번의 구매 확인이 여러 요청과 행 작업을 사용할 수 있습니다. Free의 Durable Objects는 SQLite 저장소만 지원하고, 한도를 넘은 종류의 작업은 오류로 중단됩니다. 일일 한도는 UTC 00시에 초기화됩니다. [Workers 공식 요금](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects 공식 요금](https://developers.cloudflare.com/durable-objects/platform/pricing/)

초기 구현은 거래 상태를 하나의 Durable Object에 모으는 방향으로 검토합니다. Free의 개별 객체 저장 제한은 1GB로 계획하고, 이 객체의 실제 사용량을 별도로 확인합니다. Durable Objects의 기본 CPU 제한은 요청당 30초이지만 앞단 Worker의 10ms 제한은 별개입니다. 인증·RSA 서명 등은 객체 안에서 처리하도록 이식하고 실제 실행량을 측정해야 합니다. [Durable Objects 실행·저장 제한](https://developers.cloudflare.com/durable-objects/platform/limits/)

## 비용을 발생시키지 않는 운영 조건

배포 전 계정이 실제 **Workers Free**인지 확인합니다. 이미 Paid인 계정의 포함량은 이 무료안의 비용 조건과 다르므로 그대로 배포하지 않습니다. 다른 프로젝트에 영향을 주는 요금제 변경도 임의로 하지 않습니다.

- Workers Paid, 유료 저장소·추가 기능·도메인 구매를 사용하지 않습니다.
- 별도 Render 서버·디스크·유료 백업 서비스를 연결하지 않습니다.
- 무료 한도에 접근하면 사용량을 줄이거나 구매 검증을 제한합니다. 자동 유료 전환이나 유료 서버로의 대체 연결은 하지 않습니다.
- 실제 한도 초과와 장애 시 신규 이용권 발급을 막고 재시도를 안내합니다. 이미 발급한 이용권의 유효기간을 늘리지 않습니다.
- 백업은 암호화한 파일을 운영자가 보유한 저장 공간에 보관하는 방향으로 설계하고, 복구·삭제 정보 재적용을 검사합니다. 백업 기능 자체는 아직 구현·운영 검증 전입니다.

`deployment-policy.json`은 월 인프라 예산 US$0과 금지한 유료 작업을 기록합니다. 이 파일 자체가 사업자의 청구를 차단하거나 실제 계정 설정을 변경하는 장치는 아닙니다. 운영 계정의 Free 상태와 활성 서비스를 별도로 검증해야 합니다.

## 구매와 계정 삭제 보장을 유지하는 전환

현재 서버는 Flask·Gunicorn·Python 암호화 라이브러리와 파일 경로의 SQLite를 사용합니다. Workers URL을 입력하는 것만으로 배포할 수 없습니다. Fetch 요청 처리, Google 인증·API 호출, 서명, 암호화 및 저장소를 Workers 실행 환경에 맞게 이식해야 합니다.

Android의 `/account`·`/verify` 계약, Google ID 토큰의 실제 서명 확인, Play Integrity, 변경할 수 없는 구매 소유권, 설치에 연결된 RS256 이용권을 유지합니다. 계정 삭제의 `410 account_deleted` 응답과 삭제 후 자동 재생성 금지도 보존합니다. 구매 토큰과 알림 원문은 애플리케이션에서 암호화하고 키를 서버 비밀 설정으로 보관합니다. 기존 HMAC·암호화 키나 Fernet 형식을 임의로 바꾸지 않습니다.

특히 현재 서버는 Google 조회부터 이용권 서명까지 쓰기 잠금을 유지합니다. Durable Object에서도 외부 API를 기다리는 동안 요청이 섞일 수 있으므로, 객체를 쓰는 것만으로 동일한 보장이 완성되지는 않습니다. 구매·삭제·환불·알림을 조정하는 처리 순서와 영구 상태를 설계하고, 삭제가 먼저 확정된 계정이나 환불된 거래에 새 이용권이 나오지 않는지 재시작·동시 요청까지 검증해야 합니다. SQL의 원자적 상태 변경에는 지원되는 storage transaction API를 사용합니다. [SQLite 저장 API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [Durable Objects 요청 처리 주의사항](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)

전환 검증에는 현재 서버의 의미 있는 테스트와 함께 소유권 충돌, 삭제 대 발급, 환불 대 발급, 연결 토큰, 알림 중복·재시도, 삭제 후 알림, 저장소 재시작, 암호화·복구 및 무료 한도 실패 동작을 포함합니다. 그 뒤 실제 Play 설치 앱에서 구매·복원·취소·환불을 확인합니다. 이 증거가 생기기 전에는 판매 및 운영 계정 삭제 승인 상태를 활성화하지 않습니다.

## Google 연결에서 남은 비용 확인

Cloudflare의 서버·저장소 무료 구성과 Google의 청구 조건은 별개입니다. Google Cloud Free Tier는 청구 계정과 초과 요금 조건이 있어 무료 제공량만으로 전체 비용 US$0을 보장할 수 없습니다. 비용 예산 알림도 지출 차단 장치가 아닙니다. [Google 무료 사용 조건](https://docs.cloud.google.com/free/docs/free-cloud-features), [예산 알림의 한계](https://docs.cloud.google.com/billing/docs/how-to/budgets)

현재 방침은 Google 청구 계정을 연결하거나 유료 자원을 활성화하지 않는 것입니다. RTDN용 Pub/Sub를 청구 계정 없이 사용할 수 있는지는 아직 확인되지 않았습니다. 불가능하면 해당 서비스를 활성화하지 않고, 구매 시 검증과 주기적인 Play API 환불 대사의 비용 없는 대안을 설계·검증해야 합니다. 실시간 알림을 생략한 상태를 기존 RTDN 검증 완료로 표시하지 않습니다. OAuth·서비스 계정·Play Integrity의 실제 연결과 공개 개인정보 고지, 처리 지역·보관기간도 확정 전입니다.

## 현재 완료 범위

유료 Render 배포안 철회, 무료 서비스와 저장소 선정, 공식 요금·한도 확인, 월 US$0 운영 조건과 이식 검증 기준 문서화를 완료했습니다. 서버 이식·Cloudflare 계정 확인·배포·Google 연동·실제 결제 점검은 남아 있습니다. Google Play 출시는 아직 완료하지 않았습니다.
