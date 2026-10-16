#!/usr/bin/env python3
"""Generate reviewable Korean legal drafts and Play/AdMob form drafts, not console writes."""
from pathlib import Path
import json,html,re
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'release';OUT.mkdir(exist_ok=True)
style='body{font:16px/1.9 system-ui,sans-serif;color:#303947;max-width:760px;margin:34px auto;padding:0 24px;background:#fafbff}h1{font-size:28px;line-height:1.4}h2{font-size:19px;margin-top:30px}a{color:#6250cf}p{word-break:keep-all;overflow-wrap:anywhere}.meta{color:#687589;font-size:13px}nav{display:flex;gap:18px;flex-wrap:wrap}li{margin:6px 0}'
def page(name,title,sections):
    text=f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><style>{style}</style></head><body><nav><a href="./index.html">코토바</a><a href="./privacy.html">개인정보</a><a href="./terms.html">이용약관</a><a href="./licenses.html">저작권</a></nav><h1>{title}</h1><p class="meta">Studio 501 · 정책 검토일 2026년 9월 27일 · 문의 501.dingerlab@gmail.com</p>'
    for h,body in sections:text+=f'<h2>{h}</h2><p>{body}</p>'
    (ROOT/name).write_text(text+'</body></html>',encoding='utf-8')
page('privacy.html','코토바 개인정보처리방침',[
('1. 운영자와 연락처','코토바의 개발자 표시명은 Studio 501입니다. 개인정보 관련 문의와 삭제 요청은 <a href="mailto:501.dingerlab@gmail.com">501.dingerlab@gmail.com</a>으로 접수합니다. 이 문서는 광고 및 구매 기능을 포함한 0.3.6의 공개 전 검토본입니다. 프로덕션 시행일과 법적 운영자 정보를 확정한 후 적용합니다.'),
('2. 학습 기록','단어별 학습 결과, 아는·모르는 단어 분류, 회독 횟수, 복습 예정일, 별표, 설정, 진행 중 필기는 기기에 저장됩니다. 학습 기록을 광고 사업자에게 보내지 않으며 자체 학습 동기화 서버도 사용하지 않습니다.'),
('3. 광고','무료 이용 시 Google AdMob 광고가 표시될 수 있습니다. 광고와 부정행위 방지, 성능 분석을 위해 Google Mobile Ads SDK는 기기의 IP 주소와 대략적인 위치, 광고 상호작용, 진단 정보, 광고 식별자 또는 앱 집합 식별자 등을 처리할 수 있습니다. 비개인 맞춤 광고로 요청하더라도 이러한 처리가 모두 없어지는 것은 아닙니다. 필요한 지역에서는 광고 요청 전 동의 절차를 제공하고 설정의 광고 개인정보 선택에서 변경할 수 있습니다. <a href="https://policies.google.com/privacy">Google 개인정보처리방침</a>을 함께 확인하세요.'),
('4. 구매와 구매 복원','결제는 Google Play에서 처리합니다. 개발자는 카드 번호나 결제 비밀번호를 받지 않습니다. 이용권 확인을 위해 구매 토큰, 상품 식별자, 앱 패키지명, 무작위 설치 식별자, 구매·구독 상태와 유효기간을 검증 서비스와 Google Play에 전달할 수 있습니다. 구매 토큰을 로그에 기록하지 않도록 설계했습니다. 실제 검증 서비스의 운영 위치·보유기간·수탁자 정보 확정 전에는 판매 기능을 활성화하지 않습니다.'),
('5. 보관과 삭제','기기의 학습 기록은 설정의 초기화, 운영체제의 앱 데이터 삭제 또는 앱 삭제로 지울 수 있습니다. 사용자가 만든 백업 파일은 저장한 위치에서 직접 삭제해야 합니다. 구매·환불 처리는 Google Play 정책과 적용 법령에 따릅니다. 구매 검증 서비스의 법정 보관 및 삭제 범위는 실제 배포 정보에 맞춰 확정해야 합니다.'),
('6. 오프라인 이용','단어, 한국어 뜻, 발음, 손글씨 연습은 앱에 포함되어 인터넷 없이 이용할 수 있습니다. 광고 요청, 구매, 구매 복원 및 최신 이용권 상태 확인에는 네트워크가 필요합니다. 유효한 이용권이 확인되면 광고 요청을 중단합니다.'),
('7. 권한 및 보안','네트워크 상태와 인터넷 권한은 광고·구매 검증에, 진동 권한은 학습 피드백에 사용합니다. 마이크·카메라·연락처·정밀 위치 권한은 요청하지 않습니다. 네트워크 전송은 암호화된 연결을 사용합니다. 운영체제의 자동 백업은 명시적으로 비활성화하고 사용자가 선택한 백업만 제공합니다.'),
('8. 대상 연령과 해외 처리','광고 대상 연령과 판매 국가를 확정한 후 해당 지역의 아동 및 개인정보 요건을 적용합니다. 국외 사업자인 Google의 서비스가 광고·결제 처리에 관여할 수 있습니다. 대상 연령·국외 이전 고지·수탁자 목록 검토를 마치기 전에는 정식 판매를 시작하지 않습니다.'),
('9. 변경','데이터 처리나 SDK가 바뀌면 이 방침과 Google Play 데이터 보안 신고를 함께 갱신합니다. 법적 권리를 제한하는 일괄 면책은 적용하지 않습니다.')])
page('terms.html','코토바 이용약관',[
('1. 서비스','코토바는 일본어 단어 회독, 발음 듣기, 획 쓰기와 복습을 제공하는 학습 보조 서비스입니다. 국제교류기금 또는 JEES의 공식·제휴·승인 앱이 아닙니다. 공개 자료의 급수 분류는 공식 전수 출제 목록이나 합격 보증을 의미하지 않습니다.'),
('2. 무료 이용','무료 이용자도 기본 학습 기능을 이용할 수 있으며 광고가 표시될 수 있습니다. 광고는 답 선택·필기·음성 재생을 가리는 방식으로 배치하지 않습니다. 광고를 수신하지 못하거나 오프라인이어도 학습을 차단하지 않습니다.'),
('3. 프리미엄 상품','한국 출시 계획은 월간 1,800원, 연간 9,000원, 평생 14,000원입니다. 실제 상품의 이용 가능 여부, 통화와 최종 가격은 Google Play 구매 화면에 표시된 내용을 따릅니다. 모든 프리미엄 상품은 광고 제거를 제공합니다. 월간·연간은 구독 이용 기간 동안, 평생 이용권은 한 번 결제로 해당 앱의 광고 제거를 제공합니다.'),
('4. 자동 갱신과 해지','월간·연간 구독은 취소할 때까지 자동 갱신됩니다. 연간 상품은 표시된 연간 금액을 한 번에 청구하며 월별 분납이 아닙니다. Google Play의 구독 관리에서 해지할 수 있고 일반적으로 이미 결제한 기간이 끝날 때까지 혜택이 유지됩니다. 평생 이용권은 자동 갱신되지 않습니다. 앱 삭제만으로 구독이 해지되는 것은 아닙니다.'),
('5. 복원, 환불 및 청약철회','같은 Google Play 계정의 유효한 구매는 구매 복원으로 다시 확인할 수 있습니다. 대기·취소·환불·만료된 구매에 대한 권한은 실제 상태에 따라 달라집니다. 환불과 청약철회는 적용 법령과 Google Play의 환불 정책에 따르며 법정 권리를 일괄 배제하지 않습니다. 중복 결제나 오류는 지원 이메일로 문의할 수 있습니다.'),
('6. 데이터와 오프라인','학습 기록은 기기 안에 저장됩니다. 앱 삭제 전에 필요한 기록을 백업하세요. 구매 복원은 이용권을 복원하는 기능이며 학습 진도 자체를 복원하지 않습니다. 오프라인에서도 학습할 수 있지만 신규 구매 및 최신 구매 상태 확인은 연결이 필요합니다.'),
('7. 콘텐츠 정확성','뜻·읽기·급수 분류·자동 획 판정은 오류가 있을 수 있습니다. 오류 신고를 받아 교정하며 자동 번역 결과를 독립적인 전문 검수 완료로 표시하지 않습니다. 앱이 교육용 시험의 합격이나 성적을 보장하지 않습니다.'),
('8. 지식재산권','앱의 자체 코드와 시각 요소의 권리는 해당 권리자에게 있으며 공개 어휘·획·음성 자료에는 별도 라이선스가 적용됩니다. 제3자 오픈 라이선스가 허용하는 권리를 이 약관으로 제한하지 않습니다. 자세한 사항은 오픈소스·저작권 고지에서 확인할 수 있습니다.'),
('9. 변경 및 문의','주요 이용 조건이나 서비스를 변경할 때에는 앱 또는 스토어를 통해 알립니다. 고의·중대한 과실 등 법률상 제한할 수 없는 책임을 배제하지 않습니다. 문의: Studio 501, 501.dingerlab@gmail.com. 법적 운영자·시행일 확정 전 공개 전 검토본입니다.')])
# Keep original licenses with code/data separation; never falsely relicense third-party data.
p=ROOT/'licenses.html';s=p.read_text();addition='''<h2>0.3.6 앱 의존성</h2><p>AndroidX Activity/WebKit 및 관련 라이브러리는 Apache License 2.0 조건으로 사용합니다. Google Play Billing, Google Mobile Ads, User Messaging Platform에는 Google이 정한 SDK 약관이 적용됩니다. 광고·결제 서비스 가입 및 운영 동의는 계정 소유자가 별도로 완료해야 합니다.</p><h2>뜻 교정 기록</h2><p>0.3.6은 어휘 뜻의 쉼표 구분을 정리하고 N5·N4 및 다수의 오역·반복문을 교정했습니다. 교정 범위와 원본은 소스의 editorial 폴더에 기록하며, 전체 어휘의 독립적 교육 검수 완료를 주장하지 않습니다. 어휘 및 획 파생 데이터의 기존 동일조건변경허락 라이선스는 유지됩니다.</p>'''
s=s.replace('</body>',addition+'</body>');p.write_text(s)
forms={
 'status':'DRAFT_NOT_SAVED_TO_PLAY_CONSOLE_OR_ADMOB','accountEmail':'501.dingerlab@gmail.com','developerDisplayName':'Studio 501','legalOperatorName':None,'operatorAddress':None,
 'app':{'name':'코토바: JLPT 단어 회독','defaultLanguage':'ko-KR','category':'EDUCATION','packageName':'com.studio501.kotoba','supportEmail':'501.dingerlab@gmail.com','shortDescription':'30단어씩 회독하고, 모르는 단어를 듣고 쓰며 익히는 일본어 학습 앱','containsAds':True,'inAppPurchases':True,'loginRequired':False,'appAccessInstructions':'회원가입 없이 학습 가능합니다. 광고 제거 구매를 제외한 핵심 학습은 무료로 이용할 수 있습니다.'},
 'products':[
 {'type':'subscription','productId':'kotoba_premium','basePlanId':'monthly','billingPeriod':'P1M','renewal':'auto','region':'KR','currency':'KRW','price':1800,'title':'코토바 프리미엄 월간','benefit':'광고 제거','trial':None,'status':'not-created'},
 {'type':'subscription','productId':'kotoba_premium','basePlanId':'annual','billingPeriod':'P1Y','renewal':'auto','region':'KR','currency':'KRW','price':9000,'title':'코토바 프리미엄 연간','benefit':'광고 제거','trial':None,'status':'not-created'},
 {'type':'one-time-non-consumable','productId':'kotoba_lifetime','region':'KR','currency':'KRW','price':14000,'title':'코토바 프리미엄 평생','benefit':'광고 제거 영구 이용권','status':'not-created'}],
 'admob':{'appPlatform':'Android','appName':'코토바','packageName':'com.studio501.kotoba','appId':None,'bannerAdUnitId':None,'interstitialAdUnitId':None,'testIdsOnlyInCurrentBuild':True,'mediation':False,'adPersonalization':'non-personalized-request','umpMessagePublished':False,'appAdsTxtPublisherId':None},
 'ownerRequired':{'targetAudienceAges':None,'iarcQuestionnaireCertification':None,'publicPrivacyUrl':None,'publicTermsUrl':None,'paymentsProfile':None,'merchantTaxInformation':None,'uploadKeystore':None,'playAppSigning':None,'testerRequirementAndCompletion':None},
 'neverAutomaticallyDo':['real charge','accept developer/merchant legal terms','activate production products','submit for review','publish release'],
 'declarations':{'collection':True,'sharing':'Ads SDK data is collected/shared; confirm services exception semantics against actual release','encryptedInTransit':True,'accountCreation':False,'deleteAccountWebUrl':'not applicable to a separate app account; no account creation','privacyPolicyMustChangeFromNoCollection':True}}
(OUT/'play-console-draft.json').write_text(json.dumps(forms,ensure_ascii=False,indent=2))
(OUT/'store-listing-ko.txt').write_text('''코토바: JLPT 단어 회독

30단어씩 회독하고, 모르는 단어를 듣고 쓰며 익히는 일본어 학습 앱

코토바는 단어를 빠르게 살펴보고 모르는 단어에 집중하는 일본어 어휘 학습 앱입니다.

• 30단어 챕터와 회독 진행
아는 단어와 모르는 단어를 구분하고, 모르는 단어를 집중 학습합니다.

• 눈으로 보고, 귀로 듣고, 손으로 쓰기
히라가나와 한국어 뜻을 필요할 때 확인하고, 발음을 들은 뒤 화면에 직접 씁니다. 획 모양을 확인해 올바른 위치로 보정하며, 학습 후 뜻·듣기·쓰기 문제를 풉니다.

• 복습과 기록
뜻·듣기·쓰기를 따로 기록하고, 예정된 복습과 오답을 다시 확인합니다. 기기의 학습 기록은 직접 백업하고 가져올 수 있습니다.

• 오프라인 학습
단어, 뜻, 발음과 획 데이터가 앱에 포함되어 학습은 오프라인에서도 가능합니다. 광고·구매·구매 복원에는 네트워크가 필요합니다.

• 무료 학습과 선택적 프리미엄
무료로 핵심 학습을 이용할 수 있으며 광고가 표시됩니다. 월간 또는 연간 자동 갱신 구독, 한 번 결제하는 평생 이용권으로 광고 없이 이용할 수 있습니다. 가격과 결제 조건은 Google Play 구매 화면에서 확인하세요.

코토바는 JLPT의 공식·제휴 앱이 아닙니다. 급수별 어휘는 공개 자료와 자체 편집을 기반으로 하며 공식 전수 출제 목록이나 합격을 보증하지 않습니다.

문의: 501.dingerlab@gmail.com
''')
rows=[]
for level in ['N5','N4','N3','N2','N1']:
 for w in json.loads((ROOT/f'data/{level}.json').read_text())['words']:
  if re.search('성교|성기|강간|음란|자위|마약|살인|자살|살해|전쟁|도박',w['meaning']):rows.append({'level':level,'word':w['word'],'meaning':w['meaning']})
(OUT/'content-rating-review.json').write_text(json.dumps({'note':'Dictionary terms, not graphic scenes. Owner must answer the actual IARC questionnaire honestly. Do not auto-select no sexual/violence/drug references.','items':rows},ensure_ascii=False,indent=2))
print('Legal and form drafts written; sensitive dictionary entries to review:',len(rows))
