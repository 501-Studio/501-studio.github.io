import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,validateState} from '../src/course-engine.js';

test('042 writing auto-advance is enabled by default',()=>{
 const s=fresh();
 assert.equal(s.settings.writingAutoAdvance,true);
});

test('042 an existing backup without the preference keeps the new default on',()=>{
 const s=fresh();
 delete s.settings.writingAutoAdvance;
 const restored=validateState(JSON.parse(JSON.stringify(s)));
 assert.equal(restored.settings.writingAutoAdvance,true);
});

test('042 user can persist writing auto-advance off',()=>{
 const s=fresh();
 s.settings.writingAutoAdvance=false;
 const restored=validateState(JSON.parse(JSON.stringify(s)));
 assert.equal(restored.settings.writingAutoAdvance,false);
});
