import assert from 'node:assert/strict';
import {roleFlavor} from '../dayboard/chronicle-flavor.js';
import {REALMS,TALENTS} from '../dayboard/chronicle-content.js';
import {readableError} from '../dayboard/errors.js';
for(const role of ['seeker','scribe','keeper']){const base=roleFlavor({c:{role,talents:[]}},REALMS[0]);assert.equal(base.level,1);assert.equal(base.comment,null);const full=roleFlavor({c:{role,talents:TALENTS.filter(t=>t.role===role).map(t=>t.id)}},REALMS[0]);assert.equal(full.level,7);assert(full.comment.includes(REALMS[0].theme));assert.notEqual(full.line,REALMS[0].summary);console.log('PASS Role mastery changes actual camp/reader commentary:',role);}
assert(!readableError('CHRONICLE_SHOP_LOCKED').includes('CHRONICLE_'));console.log('PASS Chronicle lock errors use Korean guidance');
