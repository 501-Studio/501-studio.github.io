import {seeds} from '../data/study040-seed.js';
import {esc} from './view.js';
import {idFor} from './catalog.js';
const curated=new Map();
function add(id,e){if(!curated.has(id))curated.set(id,[]);curated.get(id).push(e);}
for(const row of seeds)for(const tier of ['easy','natural'])add(row.id,{id:'040-'+row.id+'-'+tier,wordIds:[row.id],targets:[],ja:row[tier],ko:row[tier+'Ko'],reading:'',surface:row.word,sense:row.meaning,tier,translationReview:'assistant-authored',readingReview:'not-generated',source:'Kotoba 0.4 original',license:'Project original',independentNativeReview:false,register:'학습 용례',koTargets:[row.meaning.replace(/(하다|되다|함)$/,'')]});
// Explicit additional senses and conjugated target surfaces, not substring-based dictionary reassignment.
const extra=[
 ['N5','聞く','きく','듣다','easy','音楽を聞くのが好きです。','음악을 듣는 것을 좋아합니다。','聞く'],
 ['N5','聞く','きく','묻다','natural','分からない道を駅員に聞きました。','모르는 길을 역무원에게 물었습니다.','聞きました'],
 ['N5','見る','みる','보다','easy','夜、テレビを見ます。','밤에 텔레비전을 봅니다.','見ます'],
 ['N5','見る','みる','돌보다','natural','午後は妹の面倒を見ます。','오후에는 여동생을 돌봅니다.','見ます'],
 ['N5','頼む','たのむ','부탁하다','easy','友達に仕事を頼んだ。','친구에게 일을 부탁했다.','頼んだ'],
 ['N5','頼む','たのむ','주문하다','natural','店員にコーヒーを二つ頼んだ。','점원에게 커피 두 잔을 주문했다.','頼んだ']
];
for(const [l,w,r,sense,tier,ja,ko,surface]of extra){const id=idFor(l,w,r);add(id,{id:'040-sense-'+id+'-'+tier,wordIds:[id],targets:[],ja,ko:ko.replace('。','.'),surface,sense,tier,reading:'',translationReview:'assistant-authored',source:'Kotoba 0.4 original',license:'Project original',independentNativeReview:false,register:'일상',koTargets:surface==='頼んだ'?[sense==='부탁하다'?'부탁했다':'주문했다']:surface==='聞きました'?['물었습니다']:sense==='돌보다'?['돌봅니다']:sense==='듣다'?['듣는']:['봅니다']});}
export function quality(e,w){
 const issues=[];if(!e.ja?.trim()||!e.ko?.trim())issues.push('내용 누락');
 if(e.translationReview==='machine-draft')issues.push('번역 검수 전');
 if(e.readingReview?.startsWith('automated'))issues.push('읽기 자동 생성');
 if(e.ja?.length>({N5:35,N4:45,N3:60,N2:85,N1:100}[w.level]||80))issues.push('긴 문장');
 if(/ござる|に候|と候|なりけり|けり[。！？]|古典|古い文章/.test(e.ja))issues.push('문어·옛 표현');
 if(!e.ja?.includes(w.word)&&!(e.surface&&e.wordIds?.length===1&&e.ja.includes(e.surface)))issues.push('활용형·표기 확인 필요');
 return {issues,usable:!issues.includes('내용 누락'),tier:e.tier||(e.ja.length<=35?'easy':'natural'),sense:e.sense||'기본 용례',register:e.register||(issues.includes('문어·옛 표현')?'문어·옛 표현':'용례'),reviewed:e.translationReview!=='machine-draft'};
}
export function curatedFor(w){return curated.get(w.id)||[];}
export function prepareExamples(w,list){const rows=[...curatedFor(w),...list];return rows.filter((e,i)=>quality(e,w).usable&&rows.findIndex(x=>x.ja===e.ja)===i).sort((a,b)=>Number(b.id.startsWith('040-'))-Number(a.id.startsWith('040-'))||Number(a.translationReview==='machine-draft')-Number(b.translationReview==='machine-draft')||a.ja.length-b.ja.length);}
export function highlight(text,targets){
 let pieces=[{text:String(text||''),mark:false}];
 for(const target of [...new Set(targets.filter(x=>typeof x==='string'&&x))].sort((a,b)=>b.length-a.length)){
  pieces=pieces.flatMap(p=>{if(p.mark||!p.text.includes(target))return [p];const a=p.text.split(target);return a.flatMap((t,i)=>[...(i?[{text:target,mark:true}]:[]),{text:t,mark:false}]);});
 }
 return pieces.map(p=>p.mark?`<mark class="vocab-highlight">${esc(p.text)}</mark>`:esc(p.text)).join('');
}
export function jaHighlight(e,w){return highlight(e.ja,[w.word,...(e.wordIds?.length===1?[e.surface]:[])]);}
export function auditExamples(words,examplesFor){const out={totalWords:words.length,missing:[],draftWords:0,longWords:0,curatedWords:0,levels:{}};for(const w of words){const list=examplesFor(w),q=list.map(e=>quality(e,w));out.levels[w.level]??={total:0,curated:0,draftOnly:0};out.levels[w.level].total++;if(!list.length)out.missing.push(w.id);if(curatedFor(w).length){out.curatedWords++;out.levels[w.level].curated++;}if(q.length&&q.every(x=>!x.reviewed)){out.draftWords++;out.levels[w.level].draftOnly++;}if(q.length&&q.every(x=>x.issues.includes('긴 문장')))out.longWords++;}return out;}
