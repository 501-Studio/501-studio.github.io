import { tests, flagshipSlugs } from '../src/data/catalog.mjs';
import { localePacks, localeCodes } from '../src/data/locales.mjs';
import { getLocalizedTest } from '../src/data/content.mjs';
const assert=(c,m)=>{if(!c)throw new Error(m)};
assert(tests.length===50,'exactly 50 tests');
assert(tests.filter(t=>!t.duo).length===45,'45 solo');
assert(tests.filter(t=>t.duo).length===5,'5 duo');
assert(flagshipSlugs.length===8,'8 flagship');
assert(localeCodes.length===14,'14 locales');
assert(localePacks.ar.dir==='rtl','Arabic RTL');
for(const l of localeCodes){
  assert(localePacks[l].titles.length===50,`${l}: 50 titles`);
  for(const t of tests){
    const x=getLocalizedTest(l,t.slug);
    assert(x.questions.length===8,`${l}/${t.slug}: 8 questions`);
    assert(x.questions.every(q=>q.answers.length===4),`${l}/${t.slug}: 4 answers`);
    assert(x.questions.every(q=>new Set(q.answers.map(a=>typeof a==='string'?a:a.text)).size===4),`${l}/${t.slug}: unique answers inside question`);
    assert(new Set(x.questions.map(q=>q.answers.map(a=>typeof a==='string'?a:a.text).join('||'))).size===8,`${l}/${t.slug}: each question has a different answer set`);
    assert(x.questions.every(q=>q.answers.every((a,i)=>typeof a==='string'||(Number.isInteger(a.value)&&a.value>=0&&a.value<4&&typeof a.text==='string'&&a.text.trim()))),`${l}/${t.slug}: scored answer objects`);
    assert(x.results.length===5,`${l}/${t.slug}: 5 results`);
    assert(x.metrics.length===4,`${l}/${t.slug}: 4 metrics`);
    const raw=JSON.stringify(x);
    assert(!/TODO|Lorem ipsum|Coming soon|Example question|Sample result/.test(raw),`${l}/${t.slug}: placeholder`);
  }
}
const expected=localeCodes.length*(1+2+tests.length);
assert(expected===742,'742 locale static pages');
console.log(JSON.stringify({tests:tests.length,solo:45,duo:5,flagship:flagshipSlugs.length,locales:localeCodes.length,localePages:expected,quizPages:tests.length*localeCodes.length,rtl:'ar'},null,2));