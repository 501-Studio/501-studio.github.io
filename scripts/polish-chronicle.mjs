import fs from 'node:fs';
function patch(file,fn){const s=fs.readFileSync(file,'utf8'),next=fn(s);if(s!==next)fs.writeFileSync(file,next);}
function once(s,a,b){if(s.includes(b))return s;if(!s.includes(a))throw new Error('Expected source missing: '+a.slice(0,100));return s.replace(a,b);}
patch('dayboard/journey-shell.js',s=>s.replace("?'통계와 회고':'하루의 숲'", "?'통계와 회고':'열두 대륙의 서사'").replace("'나의 작은 실행이 모험의 다음 장을 엽니다.'", "'나의 일상이 이야기를 열고, 선택이 여정의 의미를 만듭니다.'"));
patch('dayboard/chronicle-view.js',s=>{
 if(!s.includes('import {roleFlavor}'))s="import {roleFlavor} from './chronicle-flavor.js';\n"+s;
 s=once(s,"title=preview?.slot==='title'?preview.name:titleLabel(state,p);", "title=preview?.slot==='title'?preview.name:titleLabel(state,p),flavor=roleFlavor(p,r);");
 s=once(s,'<p class="cr-stage-line">${r.summary}</p>','<p class="cr-stage-line">${flavor.line}</p>');
 s=once(s,'${role.name}${relic?', '${role.name} Lv. ${flavor.level}${relic?');
 s=once(s,'<p>${esc(chapter.scenes[page])}</p>','<p>${esc(chapter.scenes[page])}</p>${roleFlavor(p,realm).comment?`<aside class="cr-role-comment">${esc(roleFlavor(p,realm).comment)}</aside>`:\'\'}');
 s=once(s,'<h3>${r.name}</h3><p>${r.text}</p>','<h3>${r.name} <small>Lv. ${p.c.talents.filter(id=>id.startsWith(r.id+\'-\')).length+1}</small></h3><p>${r.text}</p>');
 return s;
});
patch('dayboard/chronicle-actions.js',s=>{
 if(!s.includes('import {CATALOG,gameOperation}'))s="import {CATALOG,gameOperation} from './journey-domain.js';\n"+s;
 return once(s,"if(action==='v3-adventure-tab'){", "if((action==='v3-buy'||action==='v3-equip')&&(id==='default'||CATALOG.find(i=>i.id===id)?.slot==='title')){const ops=gameOperation(getState(),action.slice(3),id);if(getState().settings.chronicle?.equippedTitle&&getState().settings.chronicle.equippedTitle!=='none')ops.push(...chronicleOperation(getState(),'title','none'));await store.commit(ops,{remember:false});chronicleUI.preview=null;notify(action==='v3-buy'?'교환하고 칭호를 장착했습니다.':'꾸미기와 칭호를 적용했습니다.');return true;}\n  if(action==='v3-adventure-tab'){");
});
patch('dayboard/journey-domain.js',s=>once(s,"aura:'none',title:'none'});else{const item", "aura:'none',title:'none',relic:'none'});else{const item"));
patch('dayboard/chronicle.css',s=>s.includes('/* Chronicle final readability */')?s:s+`\n/* Chronicle final readability */\n.cr-stage-shade{background:linear-gradient(90deg,color-mix(in srgb,var(--realm) 22%,#142b41) 0%,color-mix(in srgb,var(--realm) 42%,transparent) 68%,transparent 100%),linear-gradient(0deg,#142b3fbb,transparent 60%)}\n.cr-role-comment{background:#f7f8fb;padding:12px 15px!important;border-radius:8px}.cr-role-grid h3 small{font-size:11px;color:#70869c;font-weight:500;margin-left:5px}.cr-shop-lock,.cr-note,.cr-method p{color:#718195}\n`);
patch('dayboard/errors.js',s=>{
 if(s.includes('CHRONICLE_ORDER:'))return s;
 const codes={CHRONICLE_VERSION:'모험 데이터 버전을 확인해 주세요. 새로고침 후 다시 시도하세요.',CHRONICLE_ORDER:'이야기는 앞 장부터 진행합니다. 최신 기록을 불러와 주세요.',CHRONICLE_LOCKED:'이야기 해금에 필요한 누적 예상시간이 아직 부족합니다.',CHRONICLE_HISTORY_IMMUTABLE:'이미 저장한 이야기와 획득 기록은 덮어쓰거나 삭제할 수 없습니다.',CHRONICLE_TIME:'모험 기록 시각이 올바르지 않습니다.',CHRONICLE_RECORDS:'모험 기록 형식이나 보관 개수를 확인해 주세요.',CHRONICLE_DUPLICATE:'이미 보관한 모험 기록입니다.',CHRONICLE_MISSION_LOCKED:'이 의뢰에 필요한 이야기와 실행 기록을 먼저 채워 주세요.',CHRONICLE_TITLE_LOCKED:'칭호를 얻기 위한 조건이 아직 부족합니다.',CHRONICLE_TITLE_OWNERSHIP:'먼저 획득한 칭호만 장착할 수 있습니다.',CHRONICLE_TALENT_POINTS:'이야기 4장마다 얻는 숙련 포인트가 필요합니다.',CHRONICLE_TALENT_ORDER:'이 길의 앞 단계부터 습득해 주세요.',CHRONICLE_TALENT_HISTORY:'이미 습득한 성장 기록은 보존됩니다.',CHRONICLE_CAMP_LOCKED:'아직 열리지 않은 대륙입니다. 앞 이야기와 시간 조건을 확인해 주세요.',CHRONICLE_SHOP_LOCKED:'이 지역 상품은 앞 이야기와 누적 예상시간 조건을 채우면 열립니다.'};
 return s.replace('const COPY = {','const COPY = {\n'+Object.entries(codes).map(([k,v])=>`  ${k}: ${JSON.stringify(v)},`).join('\n')+'\n');
});
console.log('Applied final Chronicle readability, role flavor and equipment consistency polish.');
