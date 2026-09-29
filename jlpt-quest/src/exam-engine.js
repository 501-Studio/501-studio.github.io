import {contextItems} from '../data/context040.js';
import {seeds} from '../data/study040-seed.js';
import {shuffle,nowId} from './course-engine.js';
import {study} from './study-data.js';
export const EXAM_TYPES={reading:'한자 읽기',meaning:'뜻',context:'문맥',synonym:'유사 표현',usage:'용법'};
const bank=new Map();
for(const row of seeds){
 const others=seeds.filter(x=>x.level===row.level&&x.id!==row.id);let stem,answer,wrong;
 if(row.type==='reading'){stem=`「${row.word}」の読み方はどれですか。`;answer=row.reading;wrong=others.map(w=>w.reading);}
 if(row.type==='meaning'){stem=`「${row.word}」의 뜻을 고르세요.`;answer=row.meaning;wrong=others.map(w=>w.meaning);}
 if(row.type==='context'){const c=contextItems[row.word];if(!c)throw Error('Explicit context missing');[stem,...wrong]=c;answer=row.word;}
 if(row.type==='synonym'){stem=`「${row.word}」に近い意味はどれですか。`;answer=row.paraphrase;wrong=others.map(w=>w.paraphrase);}
 if(row.type==='usage'){if(!row.usage||row.usage.length!==4)throw Error('Usage item missing: '+row.word);stem=`「${row.word}」の使い方として、最も適切な文はどれですか。`;[answer,...wrong]=row.usage;}
 const choices=[answer,...[...new Set(wrong)].filter(x=>x!==answer).slice(0,3)];if(choices.length!==4)throw Error('Invalid choices');
 // Stable permutation makes persisted answer indices reproducible across app restarts.
 const shift=[...row.id].reduce((n,c)=>n+c.charCodeAt(0),0)%4;const options=[...choices.slice(shift),...choices.slice(0,shift)];
 bank.set('q040-'+row.id,{id:'q040-'+row.id,wordId:row.id,level:row.level,type:row.type,stem,options,answer:options.indexOf(answer),explanation:`${row.word}（${row.reading}）: ${row.meaning}。 ${row.natural} — ${row.naturalKo}`,source:'Original practice item; not an official JLPT question'});
}
export const examBank=()=>[...bank.values()];
export function startExam(state,level,now=Date.now()){
 const old=study(state).exam;if(old&&!old.finished)throw new Error('진행 중인 시험을 먼저 제출하세요.');
 const ids=shuffle(examBank().filter(q=>q.level===level)).slice(0,20).map(q=>q.id);if(ids.length!==20)throw new Error('이 급수의 문항이 부족합니다.');
 return study(state).exam={id:nowId(),level,ids,startedAt:now,deadline:now+600000,index:0,answers:ids.map(()=>null),finished:false,recorded:false};
}
export function examItems(e){const items=e.ids.map(id=>bank.get(id));if(items.some(q=>!q))throw new Error('저장된 시험의 문항 버전이 맞지 않습니다.');return items;}
export function selectExam(state,index,now=Date.now()){const e=study(state).exam;if(!e||e.finished||now>=e.deadline)return false;if(!Number.isInteger(index)||index<0||index>3)return false;e.answers[e.index]=index;return true;}
export function finishExam(state,now=Date.now()){
 const e=study(state).exam;if(!e)return null;const items=examItems(e);e.finished=true;
 const byType=Object.fromEntries(Object.keys(EXAM_TYPES).map(k=>[k,{total:0,correct:0}]));let correct=0;
 const errors=[],wrongIds=[];items.forEach((q,i)=>{const good=e.answers[i]===q.answer;byType[q.type].total++;if(good){correct++;byType[q.type].correct++;}else {errors.push(q.wordId);wrongIds.push(q.id);}});
 const result={id:e.id,at:now,level:e.level,total:items.length,correct,byType,wordIds:errors};
 if(!e.recorded){study(state).exams.push(result);study(state).exams=study(state).exams.slice(-100);study(state).examErrors=[...new Set([...study(state).examErrors,...errors])];study(state).examWrongIds=[...new Set([...(study(state).examWrongIds||[]).filter(id=>!e.ids.includes(id)||wrongIds.includes(id)),...wrongIds])];study(state).examErrors=[...new Set(study(state).examWrongIds.map(id=>bank.get(id)?.wordId).filter(Boolean))];e.recorded=true;}
 return study(state).exams.find(r=>r.id===e.id)||result;
}

export function startErrorExam(state,now=Date.now()){
 const s=study(state);if(s.exam&&!s.exam.finished)throw new Error('진행 중인 시험을 먼저 제출하세요.');
 const ids=shuffle(s.examWrongIds||[]).filter(id=>bank.has(id)).slice(0,20);if(!ids.length)throw new Error('오답 문항이 없습니다.');
 return s.exam={id:nowId(),level:bank.get(ids[0]).level,ids,deadline:now+600000,startedAt:now,index:0,answers:ids.map(()=>null),finished:false,recorded:false};
}
