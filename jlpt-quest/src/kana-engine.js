/** Independent pre-N5 kana course. JLPT word IDs and chapter positions never change. */
export const KANA_GROUPS=[
 ['a','あいうえお',['아','이','우','에','오']],['k','かきくけこ',['카','키','쿠','케','코']],
 ['s','さしすせそ',['사','시','스','세','소']],['t','たちつてと',['타','치','츠','테','토']],
 ['n','なにぬねの',['나','니','누','네','노']],['h','はひふへほ',['하','히','후','헤','호']],
 ['m','まみむめも',['마','미','무','메','모']],['y','やゆよ',['야','유','요']],
 ['r','らりるれろ',['라','리','루','레','로']],['w','わをん',['와','오 (조사)','응·ㄴ']],
 ['g','がぎぐげご',['가','기','구','게','고']],['z','ざじずぜぞ',['자','지','즈','제','조']],
 ['d','だぢづでど',['다','지 (ぢ)','즈 (づ)','데','도']],['b','ばびぶべぼ',['바','비','부','베','보']],
 ['p','ぱぴぷぺぽ',['파','피','푸','페','포']],['small-a','ぁぃぅぇぉ',['작은 아','작은 이','작은 우','작은 에','작은 오']],
 ['small-y','ゃゅょっ',['작은 야','작은 유','작은 요','작은 츠 (촉음)']],['v','ゔ',['유성음 vu']]
];
export const scriptName=s=>s==='k'?'가타카나':'히라가나';
export const toKana=(c,s)=>s==='k'?String.fromCodePoint(c.codePointAt(0)+96):c;
export const kanaId=(c,s)=>`KANA-${s}${c.codePointAt(0).toString(16)}`;
export function kanaLessons(script='h') {return KANA_GROUPS.map(([key,chars,hints],i)=>({id:`${script}-${key}`,script,index:i,title:[...chars].map(c=>toKana(c,script)).join(' '),basic:i<10,letters:[...chars].map((c,j)=>({id:kanaId(toKana(c,script),script),char:toKana(c,script),reading:c,hint:hints[j],small:key.startsWith('small')}))}));}
export const ALL_KANA=['h','k'].flatMap(s=>kanaLessons(s).flatMap(l=>l.letters));
const allIds=new Set(ALL_KANA.map(x=>x.id));
export const freshKana=()=>({script:'h',progress:{},session:null});
export function startKana(kana,id){const lesson=['h','k'].flatMap(kanaLessons).find(l=>l.id===id);if(!lesson)return false;kana.script=lesson.script;kana.session={lessonId:id,index:0,stage:0,strokes:[],hinted:false,autoPlayed:false,finished:false};return true;}
export function kanaCurrent(kana){const s=kana.session;if(!s||s.finished)return null;const lesson=kanaLessons(kana.script).find(l=>l.id===s.lessonId);return lesson?.letters[s.index]||null;}
export function advanceKana(kana,total,now=Date.now()){
 const s=kana.session,letter=kanaCurrent(kana);if(!letter||s.strokes.length!==total)return false;
 if(s.stage===2){
  if(s.hinted){s.strokes=[];s.hinted=false;s.autoPlayed=false;return true;}
  const old=kana.progress[letter.id];kana.progress[letter.id]={passes:(old?.passes||0)+1,lastAt:now,due:now+86400000};
  s.index++;s.stage=0;
 }else s.stage++;
 s.strokes=[];s.hinted=false;s.autoPlayed=false;
 if(s.index>=kanaLessons(kana.script).find(l=>l.id===s.lessonId).letters.length)s.finished=true;
 return true;
}
export function validateKana(input){
 const k=freshKana();if(!input||typeof input!=='object')return k;k.script=input.script==='k'?'k':'h';
 for(const [id,p]of Object.entries(input.progress||{})){if(allIds.has(id)&&Number.isSafeInteger(p?.passes)&&p.passes>0&&Number.isFinite(p.lastAt)&&p.lastAt>=0&&Number.isFinite(p.due)&&p.due>=0)k.progress[id]={passes:Math.min(p.passes,100000),lastAt:p.lastAt,due:p.due};}
 const s=input.session;if(!s)return k;
 const l=kanaLessons(k.script).find(l=>l.id===s.lessonId);
 if(!l||!Number.isInteger(s.index)||s.index<0||s.index>l.letters.length||![0,1,2].includes(s.stage)||(!s.finished&&s.index===l.letters.length))return k;
 const strokes=Array.isArray(s.strokes)?s.strokes.slice(0,60).filter(p=>Array.isArray(p)&&p.length>=2&&p.length<=2000&&p.every(q=>Array.isArray(q)&&q.length===2&&q.every(n=>Number.isFinite(n)&&n>=0&&n<=1))):[];
 k.session={lessonId:s.lessonId,index:s.index,stage:s.stage,strokes,hinted:s.hinted===true,autoPlayed:s.autoPlayed===true,finished:s.finished===true};return k;
}
