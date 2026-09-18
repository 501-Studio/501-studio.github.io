import assert from 'node:assert/strict';
import {loadLocales,quizFor,contentReport} from '../src/content.mjs';
import {LOCALES,TESTS,FLAGSHIPS,featuredFor} from '../src/definitions.mjs';
const codes=process.env.BUILD_LOCALES?process.env.BUILD_LOCALES.split(',').map(v=>v.trim()):LOCALES.map(v=>v.code);
const locales=await loadLocales(codes);
for(const locale of Object.values(locales)){
 assert.deepEqual(featuredFor(locale.code),FLAGSHIPS);
 assert.equal(locale.catalog.length,50);
 for(const t of TESTS){const q=quizFor(locale,t);assert.equal(q.questions.length,8);assert.equal(q.results.length,6);assert.equal(q.metricLabels.length,4);assert.equal(new Set(q.results.map(r=>r.key)).size,6);
  for(const question of q.questions){assert.equal(question.options.length,4);assert.equal(new Set(question.options.map(o=>o.id)).size,4);assert.ok(question.prompt.trim());assert.ok(question.options.every(o=>o.text.trim()));}
  for(const result of q.results){for(const key of ['name','catchphrase','description','strength','quirk','quest'])assert.ok(result[key]?.trim(),`${locale.code}/${t.slug}/${key}`);assert.ok(result.match>=0&&result.match<6);}
  assert.ok(q.recommendations.length>=3);assert.ok(!q.recommendations.includes(t.slug));
 }
 console.log(`PASS ${locale.code}: 50 complete quizzes, 400 questions, 300 outcomes`);
}
console.log(JSON.stringify(contentReport(locales),null,2));
