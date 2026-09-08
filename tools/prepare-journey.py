"""One-time source integration. No database, account, billing or network access.
CI verifies the resulting source before committing it on the v3 feature branch.
Once core reports v3, this script becomes a no-op; production serves committed files.
"""
from pathlib import Path
r=Path(__file__).resolve().parents[1]/'dayboard'
if "VERSION='3.0.0'" in (r/'core.js').read_text():
 print('V3 source is already integrated.');raise SystemExit(0)
assert "VERSION='2.0.0'" in (r/'core.js').read_text(), 'Unexpected source baseline'
p=r/'core.js';s=p.read_text()
s="import {spec,repeatOperations,reconcileActivity,rewardSummary,enrichDemo} from './journey-domain.js';\n"+s
s=s.replace("VERSION='2.0.0'","VERSION='3.0.0'")
s=s.replace("completedAt:null,pinned:false", "completedAt:null,color:null,repeatRule:null,checkins:[],routinePaused:false,pinned:false",1)
a=s.index('export function growth(');b=s.index('export function nextOccurrence',a)
s=s[:a]+"export function growth(items,settings=DEFAULTS){return rewardSummary({items,settings});}\n"+s[b:]
s=s.replace("if(!item)return [];const isDone", "if(!item)return [];if(spec(item))return repeatOperations(state,id,dateKey(),false);if(descendants(state.items,id).some(tid=>spec(state.items.find(t=>t.id===tid))))throw new Error('반복 업무는 각 회차의 완료 버튼으로 기록하세요.');const isDone",1)
s=s.replace("}}return s;}\nexport function inverseOps", "}}s.settings.activity=reconcileActivity(state,s);return s;}\nexport function inverseOps",1)
s=s.replace("?{pinned:false,pinIndex:null", "?{color:null,repeatRule:null,checkins:[],routinePaused:false,pinned:false,pinIndex:null",1)
s=s.replace("demoStart(){this.demo=true;this.snapshot=demoSnapshot();", "demoStart(){this.demo=true;this.snapshot=demoSnapshot();this.snapshot.state=enrichDemo(this.snapshot.state);",1)
s=s.replace('export function schedulePlan(', 'export function baseSchedulePlan(',1)
s=s.replace("leaves(state.items).filter(i=>i.status!=='done').map", "leaves(state.items).filter(i=>i.status!=='done'&&!spec(i)).map",1)
s += "\nexport {schedulePlan} from './journey-scheduler.js';\n";p.write_text(s)
p=r/'app.js';s=p.read_text();s="import {createJourneyController} from './journey-actions.js';\nimport {spec,repeatStatus} from './journey-domain.js';\nimport {shell} from './journey-shell.js';\n"+s
s=s.replace("import {shell,connectPage", "import {connectPage",1)
s=s.replace("function render(){\n", "function render(){\n journeyController?.capture(app);\n",1)
s=s.replace(" app.innerHTML=shell({view,date,state:state(),snapshot:store.snapshot,store,googleConnected:googleReady(),dashboard});", " app.innerHTML=shell({view,date,state:state(),snapshot:store.snapshot,store,googleConnected:googleReady(),dashboard});\n journeyController.decorate(app);journeyController.restore(app);",1)
needle="const dashboardController=createDashboardController({store,dashboard,getState:state,getDate:()=>date,render,notify,openModal,openItem,openChat});"
assert needle in s
s=s.replace(needle,needle+"\nconst journeyController=createJourneyController({store,getState:state,getDate:()=>date,setView:v=>{view=v;},render,notify,openModal,closeModal,getEditor:()=>editor});",1)
s=s.replace("modal.dataset.dirty='';if(!modal.open)","modal.dataset.dirty='';journeyController.decorateEditor(data,modal);if(!modal.open)",1)
s=s.replace("async function onAction(action,id){if(await dashboardController.handle", "async function onAction(action,id){if(await journeyController.handle(action,id))return;if(await dashboardController.handle",1)
s=s.replace("try{if(form.id==='connect-form')", "try{if(await journeyController.submit(form,data))return;if(form.id==='connect-form')",1)
s=s.replace("notes:data.notes||''};if(!i.title)", "notes:data.notes||'',...journeyController.itemValues(form,original)};if(!i.title)",1)
s=s.replace("if(i.status==='doing'&&i.progress===0)", "if(!spec(i)&&i.status==='doing'&&i.progress===0)",1)
s=s.replace("locked:!!data.locked,allDay:!!data.allDay};", "locked:!!data.locked,allDay:!!data.allDay,color:data.color||null};",1)
s=s.replace("document.addEventListener('change',e=>{", "document.addEventListener('change',e=>{journeyController.change(e);",1)
s=s.replace("const i=item(moving.id),status=target.dataset.dropStatus;if(!i||i.status===status)return;", "const i=item(moving.id),status=target.dataset.dropStatus;if(!i)return;if(spec(i)){if(status==='done')await onAction('v3-check',i.id+'|'+date+'|add');else if(status==='todo'&&repeatStatus(i,date).count>0)await onAction('v3-check',i.id+'|'+date+'|undo');else notify('반복 업무는 1회씩 완료하거나 취소하세요.');return;}if(i.status===status)return;",1)
s=s.replace("case 'growth':openGrowth();break;", "case 'growth':view='adventure';render();window.scrollTo(0,0);break;",1);p.write_text(s)
p=r/'index.html';s=p.read_text().replace('</head>','<link rel="stylesheet" href="./journey.css?v=3.0.0"><link rel="stylesheet" href="./journey-polish.css?v=3.0.0"></head>').replace('launch.js?v=2.0.0','launch.js?v=3.0.0');p.write_text(s)
p=r/'launch.js';p.write_text(p.read_text().replace('app.js?v=2.0.0','app.js?v=3.0.0'))
p=r/'journey-actions.js';s=p.read_text()
s=s.replace("if(spec(i)){await checkTask(id,getDate(),repeatStatus(i,getDate()).done);return true;}return false;", "if(i&&!getState().items.some(child=>child.parentId===id)){await checkTask(id,getDate(),spec(i)?repeatStatus(i,getDate()).done:false);return true;}return false;",1)
s=s.replace("el.dataset.color=colorOf(i,state.items);if(spec(i)", "el.dataset.color=colorOf(i,state.items);const control=el.querySelector('button[data-action=complete]');if(control&&spec(i))control.outerHTML=completion(i,getDate());if(spec(i)",1)
s=s.replace("const target=Number(fd.get('repeatTarget'))", "if(fd.get('kind')==='project')throw new Error('프로젝트에는 반복 목표를 설정할 수 없습니다. 하위 업무에 설정하세요.');const target=Number(fd.get('repeatTarget'))",1)
s=s.replace("Number.isNaN(+at(start)))", "Number.isNaN(+at(start))||day(at(start))!==start)",1)
s=s.replace("function change(e){if(e.target.id==='stats-category')", "function change(e){if(e.target.id==='repeatMode'){const counted=e.target.value!=='legacy';const st=document.querySelector('#status'),pr=document.querySelector('#progress');if(st)st.disabled=counted;if(pr)pr.disabled=counted;}if(e.target.id==='stats-category')",1)
s=s.replace("gameState,economy,ZONES,statistics,day}","gameState,economy,ZONES,statistics,day,activity}")
s=s.replace("${dateContents(getState(),d)||'<p class=\"empty-plain\">등록된 일정이나 업무가 없습니다.</p>'}","${dateContents(getState(),d)||'<p class=\"empty-plain\">등록된 일정이나 업무가 없습니다.</p>'}${activity(getState()).filter(a=>a.day===d).length?'<h3 class=\"space-top\">이날의 완료 기록</h3>'+activity(getState()).filter(a=>a.day===d).map(a=>'<p class=\"j-history-line\">'+esc(a.title)+' · '+(a.kind==='routine'?'반복 1회':'완료')+'</p>').join(''):''}")
p.write_text(s)
p=r/'journey-stats.js';p.write_text(p.read_text().replace('${m.byCategory[0].name} 분야','${esc(m.byCategory[0].name)} 분야'))
p=r/'journey-domain.js';p.write_text(p.read_text().replace("String(v.win||v.next||v.friction||'').trim()", "String((v.win||'')+(v.next||'')+(v.friction||'')).trim()"))
p=r/'journey-view.js';s=p.read_text().replace('function taskCard(i,d,compact=false)','function taskCard(i,d,compact=false,items=[])').replace('data-color="${colorOf(i)}"','data-color="${colorOf(i,items)}"').replace('taskCard(v.i,d,compact)','taskCard(v.i,d,compact,state.items)');p.write_text(s)
print('Integrated core, controllers, calendars, forms, styles and safe escaped summaries.')
