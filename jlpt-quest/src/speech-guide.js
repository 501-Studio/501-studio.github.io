import {btn,esc} from './view.js';
import {isNative} from './native.js';

export function speechSetupGuide({error='',includeMeaning=false,settings=false,test=settings,native=isNative()}={}){
 const languageNote=includeMeaning?'<p>한국어 뜻 듣기를 켜면 <b>한국어 오프라인 음성</b>도 필요해요. 뜻 듣기를 끄면 일본어 음성만으로 들을 수 있어요.</p>':'';
 const instructions=settings||includeMeaning?`<ol><li>기기 음성 설정의 음성 데이터 설치 메뉴에서 일본어${includeMeaning?'와 한국어':''} 오프라인 음성을 설치하세요.</li><li>앱으로 돌아와 ${test?'일본어 음성 테스트':'다시 듣기'}를 눌러 주세요.${test&&includeMeaning?' 이 테스트는 일본어만 확인해요.':''}</li>${includeMeaning?'<li>연속 듣기의 목록 설정에서 <b>한국어 뜻</b>을 켜고 듣기를 시작해 일본어와 한국어 뜻이 모두 들리는지 확인하세요.</li>':''}</ol>`:'<p>음성 데이터를 설치한 뒤 앱으로 돌아와 다시 듣기를 눌러 주세요.</p>';
 return `<section class="speech-guide ${settings?'speech-setup':'speech-error-guide'}" ${settings?'':'role="status" aria-live="polite"'}><h3>${settings?'기기 음성 준비':'음성 설정을 확인해 주세요'}</h3>${error?`<p class="speech-error-message">${esc(error)}</p>`:''}${settings?'<p>기기에 설정된 기본 음성을 사용합니다.</p>':''}<p>단어·예문·가나 듣기에는 <b>일본어 오프라인 음성</b>이 필요해요.</p>${languageNote}${instructions}<div class="speech-guide-actions">${native?btn('speech-settings','기기 음성 설정 열기','soft'):''}${test?btn('speech-test','일본어 음성 테스트','text'):''}</div><p class="speech-guide-note">${native?'':'기기 음성 설정 열기는 Android 앱에서 사용할 수 있어요. '}처음 음성 데이터를 설치할 때는 인터넷이 필요해요.</p></section>`;
}

export function updateSpeechGuide(target,error='',options={}){
 if(!target)return;
 const message=typeof error==='string'?error:error?.message||'기기 음성을 사용할 수 없어요.';
 const key=JSON.stringify([message,options.includeMeaning===true,isNative()]);
 if(target.dataset.speechGuideKey===key)return;
 target.dataset.speechGuideKey=key;
 target.innerHTML=message?speechSetupGuide({...options,error:message}):'';
}
