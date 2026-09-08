"""One-time feature-branch integration. No accounts, credentials, or schedules are touched."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
a=root/'dayboard'
p=a/'core.js';s=p.read_text()
assert "export const VERSION='3.0.0'" in s
s="import {assertHierarchy} from './hierarchy.js';\n"+s
s=s.replace("export const VERSION='3.0.0'","export const VERSION='3.0.1'")
needle="for(const kind of ['task','project'])for(const p of s.items"
assert needle in s
s=s.replace(needle,"assertHierarchy(s.items);"+needle)
start=s.index('export class Store{');end=s.index('export function demoSnapshot',start)
s=s[:start]+"export {Store} from './store.js';\n"+s[end:];p.write_text(s)
p=a/'app.js';s=p.read_text();start=s.index('const readableError=');end=s.index('\nfunction notify',start)
s=s[:start]+s[end:];s="import {readableError} from './errors.js';\n"+s
needle="switch(action){case 'nav':";assert needle in s
s=s.replace(needle,"switch(action){case 'dismiss-save-error':store.saveError='';render();break;case 'nav':")
p.write_text(s)
p=a/'journey-shell.js';s=p.read_text();s="import {VERSION} from './core.js';\nimport {readableError} from './errors.js';\n"+s
needle="root.querySelector('.shell').dataset.version='3.0.0';";assert needle in s
s=s.replace(needle,"""root.querySelector('.shell').dataset.version=VERSION;
 if(ctx.store.saveError&&!ctx.store.error){
  const notice=document.createElement('div');notice.className='notice warning save-error';notice.setAttribute('role','status');
  const text=document.createElement('span');text.textContent='변경이 저장되지 않았습니다. '+readableError(ctx.store.saveError);
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='button';dismiss.dataset.action='dismiss-save-error';dismiss.textContent='확인';
  notice.append(text,dismiss);content.prepend(notice);
  const status=root.querySelector('.sync');if(status)status.lastChild.textContent='변경 미저장';
 }
""");p.write_text(s)
for file in ['index.html','launch.js']:
 p=a/file;p.write_text(p.read_text().replace('v=3.0.0','v=3.0.1'))
p=root/'tests/journey-release.cjs';s=p.read_text().replace("assert.equal(await page.evaluate(()=>window.dayboardVersion),'3.0.0')","assert.equal(await page.evaluate(()=>window.dayboardVersion),c.VERSION)").replace("p.evaluate(()=>window.dayboardVersion==='3.0.0')","p.evaluate(version=>window.dayboardVersion===version,c.VERSION)");p.write_text(s)
p=a/'CHATGPT.md';s=p.read_text();s+='\n## Hierarchy integrity (3.0.1)\nNever write workspace state directly. Use the existing propose/decide approval APIs. When adding under a task, explicitly use kind=subtask; kind=task may only have a project parent (or no parent). Validate the full batch, including surviving children and block references. INVALID_PARENT is a rejected data change, not a lost connection. Never silence it by weakening the validator, deleting records or resetting keys.\n';p.write_text(s)
print('Integrated parent integrity patch; ready for tests, not deployed by this script.')
