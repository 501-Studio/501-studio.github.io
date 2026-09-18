/* TokTension 1.0.0 — deterministic, local-only entertainment analysis. No requests or persistence. */
(function(root){
'use strict';
const MAX_CHARS=500000,MAX_MESSAGES=20000;
const TYPES=[{id:0,name:'폭주기관차형',emoji:'🚂',desc:'이 대화의 추진력을 맡았네요. 긴 이야기와 넉넉한 말풍선으로 대화를 앞으로 보내요.'},{id:1,name:'호기심 인터뷰어형',emoji:'🎤',desc:'궁금한 게 많을수록 대화도 길어지는 타입. 질문으로 다음 이야기를 열어줘요.'},{id:2,name:'리액션 부스터형',emoji:'🎉',desc:'웃음과 반응으로 대화에 에너지를 더해요. 상대의 한마디도 그냥 지나치지 않네요.'},{id:3,name:'여유로운 관찰자형',emoji:'🌿',desc:'짧고 담백하게, 필요한 순간에 한마디. 말풍선이 적다고 마음까지 작은 건 아니에요.'},{id:4,name:'핑퐁 마스터형',emoji:'🏓',desc:'한 번 주고 한 번 받고. 이 대화에서는 서로의 말풍선이 비교적 고르게 오갔어요.'},{id:5,name:'이야기 수집가형',emoji:'📚',desc:'각자의 속도로 이야기를 쌓아가는 타입. 한 가지 숫자보다 대화의 맥락이 중요해요.'}];
const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
const median=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2;};
function clock(text){const m=String(text).trim().match(/^(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);if(!m)return null;let h=+m[2],min=+m[3],p=(m[1]||m[4]||'').toUpperCase();if(min>59||h>23||(p&&(h<1||h>12)))return null;if(p){h%=12;if(p==='오후'||p==='PM')h+=12;}return h*60+min;}
function day(y,m,d){y=+y;m=+m;d=+d;const t=Date.UTC(y,m-1,d),v=new Date(t);return v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===d?t/60000:null;}
function parse(text){
 if(typeof text!=='string')throw Error('대화를 텍스트로 입력해 주세요.');if(text.length>MAX_CHARS)throw Error('한 번에 50만 자까지 분석할 수 있어요. 최근 대화만 잘라서 넣어주세요.');
 const messages=[],warnings=[];let currentDay=null,ignored=0,formatCount=0;
 const lines=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
 for(let raw of lines){const line=raw.trim();if(!line)continue;
  const dh=line.match(/^[-=\s]*(\d{4})[년.\/-]\s*(\d{1,2})[월.\/-]\s*(\d{1,2})(?:일|\.)?(?:\s*\(?[월화수목금토일](?:요일)?\)?)?\s*[-=]*$/);
  if(dh){currentDay=day(dh[1],dh[2],dh[3]);continue;}
  if(/^(저장한 (날짜|시간)|대화 저장|Chat history|Date saved)/i.test(line)||/(님과|와|과) 카카오톡 대화$/.test(line)||/님이 (들어왔습니다|나갔습니다|초대했습니다)\.?$/.test(line)){ignored++;continue;}
  let name,body,time=null,dateForMessage=currentDay,m;
  m=line.match(/^(\d{4})[년.\/-]\s*(\d{1,2})[월.\/-]\s*(\d{1,2})(?:일|\.)?\s*,?\s*((?:오전|오후|AM|PM)?\s*\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)\s*,\s*(.{1,80}?)\s*:\s?(.*)$/i);
  if(m){dateForMessage=day(m[1],m[2],m[3]);currentDay=dateForMessage;time=clock(m[4]);name=m[5];body=m[6];formatCount++;}
  else if((m=line.match(/^\[([^\]\n]{1,80})\]\s*\[([^\]\n]+)\]\s?(.*)$/))&&clock(m[2])!==null){name=m[1];time=clock(m[2]);body=m[3];formatCount++;}
  else if((m=line.match(/^([^:\n]{1,80}?)\s*\[((?:오전|오후|AM|PM)?\s*\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)\]\s*:\s?(.*)$/i))){name=m[1];time=clock(m[2]);body=m[3];formatCount++;}
  else if((m=line.match(/^([^:\n\[\]]{1,80}?)\s*[:：]\s?(.*)$/))&&!/^(https?|ftp|저장한 날짜)$/i.test(m[1].trim())){name=m[1];body=m[2];formatCount++;}
  else{if(messages.length){messages[messages.length-1].text+='\n'+raw;}else ignored++;continue;}
  name=name.trim();if(!name)continue;
  messages.push({name,text:body||'',minute:time,day:dateForMessage,stamp:time===null?null:(dateForMessage===null?time:dateForMessage+time),index:messages.length});
  if(messages.length>MAX_MESSAGES)throw Error('메시지는 한 번에 2만 개까지 분석할 수 있어요. 기간을 줄여주세요.');
 }
 const names=[...new Set(messages.map(m=>m.name))];
 if(!formatCount)warnings.push('발신자를 찾지 못했어요. 각 메시지를 “이름: 내용” 형식으로 넣어주세요.');
 if(ignored)warnings.push('대화 제목·저장 정보 등 '+ignored+'개 줄은 메시지에서 제외했어요.');
 if(names.length>2)warnings.push('단체 대화예요. 선택한 두 사람의 메시지만 비교하며, 다른 사람이 끼어든 구간은 답장 간격에서 제외해요.');
 return {messages,names,warnings};
}
const hasQuestion=s=>/[?？]/.test(s);
const hasLaugh=s=>/[ㅋㅎ]{2,}|하하|헤헤|\bhaha\b|\blol\b|😂|🤣/iu.test(s);
const hasWarm=s=>/고마|좋[아은네지겠]|재밌|즐거|멋지|잘했|축하|❤|💛|💕|😊/u.test(s);
function stats(messages,name){const list=messages.filter(m=>m.name===name),n=list.length;return{name,n,chars:list.reduce((a,m)=>a+Array.from(m.text.replace(/\s/g,'')).length,0),questions:list.filter(m=>hasQuestion(m.text)).length,laughs:list.filter(m=>hasLaugh(m.text)).length,warm:list.filter(m=>hasWarm(m.text)).length};}
function analyze(parsed,me,other){
 if(!me||!other||me===other)throw Error('나와 상대방을 서로 다르게 선택해 주세요.');
 const messages=parsed.messages.filter(m=>m.name===me||m.name===other),mine=stats(messages,me),theirs=stats(messages,other),n=messages.length;
 if(n<6||mine.n<2||theirs.n<2)throw Error('두 사람의 메시지가 각각 2개 이상, 합계 6개 이상 필요해요.');
 const warnings=[...parsed.warnings];if(n<20)warnings.push('메시지가 20개 미만이라 몇 마디만 바뀌어도 점수가 크게 달라질 수 있어요.');
 let switches=0,excluded=0,unknown=0;const gaps={[me]:[],[other]:[]};
 for(let i=1;i<n;i++){const a=messages[i-1],b=messages[i];if(a.name===b.name)continue;switches++;
  if(b.index!==a.index+1){excluded++;continue;}if(a.stamp===null||b.stamp===null||(a.day===null)!==(b.day===null)){unknown++;continue;}
  const delta=b.stamp-a.stamp;if(delta<0||delta>360){excluded++;continue;}gaps[b.name].push(delta);
 }
 const myGap=median(gaps[me]),theirGap=median(gaps[other]),share=mine.n/n,balance=1-Math.abs(share-.5)*2,q=(mine.questions+theirs.questions)/n,l=(mine.laughs+theirs.laughs)/n;
 const tension=clamp(15+30*balance+25*Math.min(l*3,1)+15*Math.min(q*3,1)+15*switches/(n-1));
 const active=clamp(45*Math.min(theirs.questions/theirs.n/.4,1)+35*Math.min((1-share)/.5,1)+20*Math.min(theirs.warm/theirs.n/.3,1));
 const pace=theirGap===null?null:clamp(100-24*Math.log2(theirGap+1));
 const signal=clamp(.6*active+.4*balance*100);
 let type=TYPES[5];if(share>=.62||(mine.chars/mine.n>theirs.chars/theirs.n*1.6&&share>.5))type=TYPES[0];else if(mine.questions/mine.n>=.35)type=TYPES[1];else if(mine.laughs/mine.n>=.4)type=TYPES[2];else if(share<=.35||mine.chars/mine.n<=7)type=TYPES[3];else if(balance>=.8)type=TYPES[4];
 if(unknown)warnings.push('시간 정보가 없거나 날짜 형식이 섞인 '+unknown+'개 대화 전환은 답장 간격에서 제외했어요.');
 if(excluded)warnings.push('역순 시간·6시간 초과 공백·다른 참여자가 끼어든 '+excluded+'개 구간은 답장 간격에서 제외했어요.');
 if(messages.some(m=>m.day===null&&m.minute!==null))warnings.push('날짜 없는 시간은 입력 순서의 같은 날 대화로만 계산해요. 자정을 넘었다면 날짜 줄을 추가해 주세요.');
 return{mine,theirs,n,tension,active,signal,pace,type,myGap,theirGap,myGapCount:gaps[me].length,theirGapCount:gaps[other].length,share:clamp(share*100),balance:clamp(balance*100),question:clamp(q*100),theirQuestion:clamp(theirs.questions/theirs.n*100),laugh:clamp(l*100),warnings,lastOther:[...messages].reverse().find(m=>m.name===other)?.text||''};
}
function gapText(n){return n===null?'시간 정보 부족':n===0?'1분 미만':n<60?(Number.isInteger(n)?n:n.toFixed(1))+'분':Math.floor(n/60)+'시간'+(n%60?' '+Math.round(n%60)+'분':'');}
function replies(result,tone){
 const s=result.lastOther;let topic='general';if(/커피|카페|라떼/.test(s))topic='coffee';else if(/밥|먹|맛집|점심|저녁|메뉴/.test(s))topic='food';else if(/영화|드라마|넷플/.test(s))topic='movie';else if(/피곤|힘들|졸려|지쳤|야근/.test(s))topic='tired';else if(/공부|과제|시험|논문|출근|일하|업무/.test(s))topic='work';
 const choices={general:{light:['오 그랬구나 ㅋㅋ 그다음엔 어떻게 됐어?','그 얘기 좀 더 듣고 싶다!','나는 오늘 소소한 일이 있었는데, 들어볼래?'],warm:['말해줘서 고마워. 지금은 어때?','네 얘기 듣는 거 좋아. 편하게 말해줘 :)','바로 답하지 않아도 괜찮아. 편할 때 이야기하자.'],plan:['시간 괜찮을 때 만나서 더 얘기할까?','이번 주에 잠깐 시간 되는 날 있어? 부담 없이 알려줘!','다음에 커피 마시면서 이어서 얘기하자 :)']},coffee:{light:['커피 얘기하니까 나도 마시고 싶다 ㅋㅋ 뭐 마셨어?','그 카페 분위기는 어때?','거기 시그니처 메뉴도 있어?'],warm:['커피 한 잔 하면서 잠깐 쉬어. 오늘도 수고했어 :)','네가 좋아하는 카페 궁금하다!','여유 있는 시간 보냈으면 좋겠다 :)'],plan:['다음에 그 카페 같이 가볼까?','이번 주에 커피 한 잔 할 시간 있어?','시간 괜찮으면 각자 좋아하는 카페 하나씩 골라보자.']},food:{light:['오 맛있겠다 ㅋㅋ 메뉴 뭐 골랐어?','그 집에서 제일 추천하는 메뉴가 뭐야?','나는 메뉴 고를 때 늘 고민돼 ㅋㅋ 넌 바로 골라?'],warm:['맛있는 거 먹고 든든하게 챙겨 :)','바쁜 날일수록 밥은 잘 챙겼으면 좋겠어.','네가 좋아하는 메뉴 기억해 둘게 :)'],plan:['다음에 시간 맞으면 같이 먹으러 갈까?','이번 주에 밥 같이 먹을 날 있어?','네가 추천한 곳, 같이 가보면 재밌겠다!']},movie:{light:['그거 재밌어? 스포 없이 한 줄 평 부탁해 ㅋㅋ','어떤 장면이 제일 기억에 남았어? 스포는 살짝만!','요즘 볼 거 찾고 있었는데 추천 고마워!'],warm:['네가 재밌게 봤다니까 나도 궁금해진다 :)','네 취향 조금 알게 된 것 같아서 좋다.','보고 나서 느낀 점도 나중에 이야기해줘.'],plan:['시간 맞으면 다음 영화 같이 볼까?','이번 주말에 영화 볼 생각 있어?','같은 작품 보고 감상 나눠보는 거 어때?']},tired:{light:['오늘 꽤 고생했나 보다. 잠깐 쉴 수 있어?','일단 물 한 잔 마시고 숨 좀 돌리자.','오늘은 무리하지 말고 쉬어. 답장은 나중에 해도 돼.'],warm:['많이 힘들었겠다. 말하고 싶으면 들어줄게.','오늘 정말 수고했어. 답장보다 쉬는 게 먼저야.','지금 필요한 게 있으면 편하게 말해줘.'],plan:['오늘은 쉬고, 괜찮아지면 가볍게 산책할까?','컨디션 돌아오면 편한 날에 만나자.','일정은 나중에 정해도 돼. 푹 쉬어 :)']},work:{light:['오늘 할 일이 많구나. 제일 큰 건 끝냈어?','하나씩 해보자! 잠깐 쉬는 시간은 있어?','끝나고 나면 뭐 하면서 쉴 거야?'],warm:['바쁜 와중에 답해줘서 고마워. 천천히 해도 괜찮아.','준비한 만큼 잘 풀리면 좋겠다. 응원할게 :)','너무 무리하지 말고 틈틈이 쉬어가.'],plan:['큰일 끝나면 맛있는 거 먹으러 갈까?','이번 일정 지나고 편한 날 알려줘 :)','바쁜 거 끝나면 가볍게 만나서 쉬자.']}};
 return choices[topic][tone]||choices[topic].light;
}
function summary(r){return{v:1,t:r.tension,s:r.signal,a:r.active,q:r.theirQuestion,p:r.pace,k:r.type.id};}
function readSummary(v){if(!v||v.v!==1||!Number.isInteger(v.k)||!TYPES[v.k])return null;for(const k of ['t','s','a','q'])if(!Number.isInteger(v[k])||v[k]<0||v[k]>100)return null;if(v.p!==null&&(!Number.isInteger(v.p)||v.p<0||v.p>100))return null;return{v:1,t:v.t,s:v.s,a:v.a,q:v.q,p:v.p,k:v.k};}
const API={parse,analyze,replies,summary,readSummary,gapText,TYPES,MAX_CHARS,MAX_MESSAGES,clock};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.TokEngine=API;
})(typeof window!=='undefined'?window:globalThis);
