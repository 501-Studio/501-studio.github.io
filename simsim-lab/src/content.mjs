import { TESTS, LOCALES, CATEGORY_IDS, FLAGSHIPS, RESULT_KEYS, PAIR_KEYS, RESULT_EMOJI } from './definitions.mjs';

const REQUIRED_SPECIAL = [...new Set([...FLAGSHIPS,...TESTS.filter(t=>t.mode==='duo').map(t=>t.slug)])];
const SPLIT_LINES = text => String(text).trim().split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
const nonempty = value => typeof value==='string' && value.trim().length>0;
const fail = (code,message) => { throw new Error(`[${code}] ${message}`); };
const noPlaceholder = /(?:\bTODO\b|Lorem ipsum|Coming soon|Example question|Sample result)/i;

export function parseLocale(raw,referenceKeys){
 if(!raw || !LOCALES.some(l=>l.code===raw.code))throw new Error('Unknown locale content');
 const code=raw.code;
 if(referenceKeys){for(const key of referenceKeys)if(!nonempty(raw.ui?.[key]))fail(code,`Missing UI string: ${key}`);}
 if(!Array.isArray(raw.categories)||raw.categories.length!==CATEGORY_IDS.length||!raw.categories.every(nonempty))fail(code,'Expected six localized category names');
 for(const id of CATEGORY_IDS){if(!Array.isArray(raw.metricLabels?.[id])||raw.metricLabels[id].length!==4||!raw.metricLabels[id].every(nonempty))fail(code,`Expected four metric labels for ${id}`);}
 for(const name of ['profiles','pairProfiles']){
  if(!Array.isArray(raw[name])||raw[name].length!==6)fail(code,`Expected six ${name}`);
  for(const row of raw[name])if(!Array.isArray(row)||row.length!==5||!row.every(nonempty))fail(code,`Incomplete ${name}`);
 }
 const beats=SPLIT_LINES(raw.beats).map(line=>line.split('|').map(s=>s.trim()));
 if(beats.length!==8||beats.some(row=>row.length!==5||!row.every(nonempty)))fail(code,'Expected eight complete decision beats');
 const rows=SPLIT_LINES(raw.catalog).map(line=>line.split('|').map(s=>s.trim()));
 if(rows.length!==TESTS.length)fail(code,`Catalog has ${rows.length} rows instead of ${TESTS.length}`);
 rows.forEach((row,i)=>{if(row.length!==7||!row.every(nonempty))fail(code,`Malformed catalog row ${i}: ${row.length} fields`);if(row[6].split('~').length!==6||!row[6].split('~').every(nonempty))fail(code,`Expected six outcome names in row ${i}`);});
 const special={};
 for(const slug of REQUIRED_SPECIAL){
  if(!nonempty(raw.special?.[slug]))fail(code,`Flagship / two-player questions missing for ${slug}`);
  const q=SPLIT_LINES(raw.special[slug]).map(line=>line.split('|').map(s=>s.trim()));
  if(q.length!==8||q.some(row=>row.length!==5||!row.every(nonempty)))fail(code,`Malformed special questions for ${slug}`);
  special[slug]=q;
 }
 for(const kind of ['about','privacy','terms']){
  const values=raw.legal?.[kind];
  if(!Array.isArray(values)||values.length<6||values.length%2||!values.every(nonempty))fail(code,`Incomplete ${kind} page`);
 }
 if(noPlaceholder.test(JSON.stringify(raw)))fail(code,'Placeholder text is not permitted');
 const categoryMap=Object.fromEntries(CATEGORY_IDS.map((id,i)=>[id,raw.categories[i]]));
 const catalog=TESTS.map((t,i)=>({ ...t,title:rows[i][0],description:rows[i][1],categoryName:categoryMap[t.category] }));
 return Object.freeze({code,ui:raw.ui,categoryMap,metricLabels:raw.metricLabels,profiles:raw.profiles,pairProfiles:raw.pairProfiles,legal:raw.legal,rows,beats,special,catalog});
}

export async function loadLocales(codes=LOCALES.map(l=>l.code)){
 const all={};
 const english=(await import('./locales/en.mjs')).default;
 const keys=Object.keys(english.ui);
 for(const code of codes){
  const raw=code==='en'?english:(await import(`./locales/${code}.mjs`)).default;
  if(raw.code!==code)fail(code,'File locale does not match its path');
  all[code]=parseLocale(raw,keys);
 }
 return all;
}

export function recommendationsFor(test){
 const duoFor={daily:'friend-compatibility',love:'couple-taste',fantasy:'rpg-party',chaos:'balance-game',whatif:'travel-compatibility',duo:'friend-compatibility'};
 const preferred=[duoFor[test.category],...TESTS.filter(t=>t.category===test.category).map(t=>t.slug),...FLAGSHIPS];
 return [...new Set(preferred)].filter(slug=>slug!==test.slug).slice(0,4);
}

export function quizFor(locale,definition){
 const t=typeof definition==='string'?TESTS.find(t=>t.slug===definition):definition;
 if(!t)throw new Error('Unknown quiz definition');
 const row=locale.rows[t.id],names=row[6].split('~').map(s=>s.trim());
 const bespoke=locale.special[t.slug];
 const questions=(bespoke||locale.beats).map((q,i)=>({
  id:`q${i+1}`,scene:bespoke?'':row[2+Math.floor(i/2)],prompt:q[0],options:q.slice(1).map((text,id)=>({id,text}))
 }));
 const profiles=t.mode==='duo'?locale.pairProfiles:locale.profiles;
 const keys=t.mode==='duo'?PAIR_KEYS:RESULT_KEYS;
 const matches=[2,3,0,1,5,4];
 const results=profiles.map((p,i)=>({key:keys[i],name:names[i],emoji:t.mode==='duo'?['🌌','🎲','🎧','🧭','📻','✨'][i]:RESULT_EMOJI[i],catchphrase:p[0],description:p[1],strength:p[2],quirk:p[3],quest:p[4],match:matches[i]}));
 return {...locale.catalog[t.id],locale:locale.code,questions,results,metricLabels:locale.metricLabels[t.category],recommendations:recommendationsFor(t),shareText:t.mode==='duo'?locale.ui.pairCaption:locale.ui.shareCaption,seo:{title:`${row[0]} | ${locale.ui.brand}`,description:`${row[1]} ${locale.ui.testDescription}`}};
}

export function contentReport(locales){
 const codes=Object.keys(locales);
 let quizzes=0,questions=0,outcomes=0;
 for(const locale of Object.values(locales))for(const t of TESTS){const q=quizFor(locale,t);quizzes++;questions+=q.questions.length;outcomes+=q.results.length;}
 return {locales:codes,localeCount:codes.length,quizDefinitions:TESTS.length,localizedQuizzes:quizzes,localizedQuestions:questions,localizedOutcomes:outcomes,flagships:FLAGSHIPS,bespokeQuestionSetsPerLocale:REQUIRED_SPECIAL.length,composition:'Shared scoring engine; localized topic scenes and decision beats; bespoke flagship and two-player question sets.',nativeSpeakerReview:false};
}
