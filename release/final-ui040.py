"""Mode-specific review continuation and accessible folder pagination."""
from pathlib import Path
import json
ROOT=Path('jlpt-quest')
def replace(path, old, new):
    p=ROOT/path;s=p.read_text()
    if new in s:return
    assert old in s, f'Expected source missing: {path}'
    p.write_text(s.replace(old,new))

replace('src/session-controls.js', r"""export function enterReview(state,words,filter='due',now=Date.now()){
 if(live(state.session)&&state.session.kind==='review')return 'resume';
 if(live(state.suspendedSession)&&state.suspendedSession.kind==='review'){
  swapSession(state);return 'resume';
 }
 const review=createReview(state,words,filter,now);
 // Do not park/erase a lesson when there is nothing to review.
 if(!review)return 'empty';
 if(live(state.session)){
  if(live(state.suspendedSession))throw new Error('보관한 수업을 먼저 이어서 진행해 주세요.');
  state.suspendedSession=state.session;
 }
 state.session=review;return 'started';
}
""", r"""export function enterReview(state,words,filter='due',now=Date.now()){
 const matches=s=>live(s)&&s.kind==='review'&&(s.reviewMode||'due')===filter&&s.wordIds.every(id=>id.startsWith(state.settings.level+'-'));
 if(matches(state.session))return 'resume';
 if(matches(state.suspendedSession)){swapSession(state);return 'resume';}
 const parked=(state.parkedSessions||[]).find(matches);
 if(parked){restoreParked(state,parked.id);return 'resume';}
 const review=createReview(state,words,filter,now);
 if(!review)return 'empty';
 activateSession(state,review);return 'started';
}
""")

replace('src/advanced-ui.js', r"""category:'all',folder:'all',selected:""", r"""category:'all',folder:'all',folderPage:0,selected:""")

replace('src/advanced-ui.js', r"""function folderView(state,words){const folders=study(state).folders,f=folders.find(f=>f.id===advanced.folder);const list=f?words.filter(w=>f.wordIds.includes(w.id)):words.filter(w=>advanced.selected.has(w.id));return `<div class="folder-toolbar">${btn('folder-create','새 폴더','primary')}${btn('selection-menu',`선택 ${advanced.selected.size}개`,'soft')}</div><div class="filter-chips">${btn('folder-open','선택한 단어',!f?'soft':'text','data-id="all"')}${folders.map(f=>btn('folder-open',esc(f.name)+` (${f.wordIds.length})`,f.id===advanced.folder?'soft':'text',`data-id="${f.id}"`)).join('')}</div>${f?`<div class="folder-toolbar">${btn('folder-select-all','폴더 단어 선택','soft')}${btn('folder-rename','이름 변경','text')}${btn('folder-delete','폴더 삭제','text danger')}</div>`:''}<div class="folder-word-list">${list.slice(0,200).map(w=>`<div class="folder-word">${selectedWordButton(w)}<button data-action="word" data-id="${w.id}"><b lang="ja">${esc(w.word)}</b><span>${esc(w.meaning)}</span></button>${f?btn('folder-remove','빼기','text',`data-id="${w.id}"`):''}</div>`).join('')||empty('등록된 단어가 없습니다.','단어장에서 단어를 선택한 다음 폴더에 추가하세요.')}</div>`;}""", r"""export function folderPageItems(state,words){
 const f=study(state).folders.find(f=>f.id===advanced.folder),members=new Set(f?f.wordIds:advanced.selected),list=words.filter(w=>members.has(w.id));
 const pages=Math.max(1,Math.ceil(list.length/100)),page=Math.min(Math.max(0,Number.isInteger(advanced.folderPage)?advanced.folderPage:0),pages-1);
 return {folder:f,list,rows:list.slice(page*100,(page+1)*100),page,pages};
}
function folderView(state,words){
 const folders=study(state).folders,{folder:f,list,rows,page,pages}=folderPageItems(state,words);
 return `<div class="folder-toolbar">${btn('folder-create','새 폴더','primary')}${btn('selection-menu',`선택 ${advanced.selected.size}개`,'soft')}</div><div class="filter-chips">${btn('folder-open','선택한 단어',!f?'soft':'text','data-id="all"')}${folders.map(f=>btn('folder-open',esc(f.name)+` (${f.wordIds.length})`,f.id===advanced.folder?'soft':'text',`data-id="${f.id}"`)).join('')}</div>${f?`<div class="folder-toolbar">${btn('folder-select-all',pages>1?'이 페이지 선택':'폴더 단어 선택','soft')}${btn('folder-rename','이름 변경','text')}${btn('folder-delete','폴더 삭제','text danger')}</div>`:''}<div class="folder-word-list">${rows.map(w=>`<div class="folder-word">${selectedWordButton(w)}<button data-action="word" data-id="${w.id}"><b lang="ja">${esc(w.word)}</b><span>${esc(w.meaning)}</span></button>${f?btn('folder-remove','빼기','text',`data-id="${w.id}"`):''}</div>`).join('')||empty('등록된 단어가 없습니다.','단어장에서 단어를 선택한 다음 폴더에 추가하세요.')}</div>${pages>1?`<div class="folder-pagination" role="navigation" aria-label="폴더 페이지">${btn('folder-page','이전','soft',`data-page="${page-1}" ${page===0?'disabled':''}`)}<span>${page+1} / ${pages} · ${list.length}단어</span>${btn('folder-page','다음','soft',`data-page="${page+1}" ${page===pages-1?'disabled':''}`)}</div>`:''}`;
}
""")

replace('src/advanced-ui.js', r"""if(a==='folder-open'){advanced.folder=el.dataset.id;render();return true;}""", r"""if(a==='folder-open'){advanced.folder=el.dataset.id;advanced.folderPage=0;render();return true;}
 if(a==='folder-page'){const {pages}=folderPageItems(state,words),page=Number(el.dataset.page);if(Number.isInteger(page)&&page>=0&&page<pages){advanced.folderPage=page;render();document.querySelector('.folder-toolbar')?.scrollIntoView({block:'start'});}return true;}""")

replace('src/advanced-ui.js', r"""if(a==='folder-select-all'){const f=study(state).folders.find(f=>f.id===advanced.folder);advanced.selected=new Set(f.wordIds.slice(0,100));render();chooseMenu(ctx);return true;}""", r"""if(a==='folder-select-all'){advanced.selected=new Set(folderPageItems(state,words).rows.map(w=>w.id));render();chooseMenu(ctx);return true;}""")

replace('src/app.js', r"""['meaning','listening','writing'].map(k=>`<span class="${s.passed[keyOf(id,k)]?'done':''}">""", r"""['meaning','listening','writing'].filter(k=>s.queue.some(t=>t.phase==='quiz'&&t.wordId===id&&t.skill===k)).map(k=>`<span class="${s.passed[keyOf(id,k)]?'done':''}">""")

p=ROOT/'package.json';value=json.loads(p.read_text())
if 'tests/continuation040.test.mjs' not in value['scripts']['test']:
    value['scripts']['test'] += ' tests/continuation040.test.mjs'
p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
p=ROOT/'advanced.css';s=p.read_text()
if '.folder-pagination{' not in s:
    p.write_text(s+'\n.folder-pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:16px 0;font-size:13px}.folder-pagination .btn{flex-shrink:0}\n')
