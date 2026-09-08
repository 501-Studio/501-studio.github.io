"""Finalize integration repairs and align browser checks with existing markup."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
p=root/'dayboard/journey-stats.js';p.write_text(p.read_text().replace('label:d:String','label:d=>String'))
p=root/'dayboard/app.js';p.write_text(p.read_text().replace('if(f)setTimeout(()=>f.focus(),30);','if(f)f.focus({preventScroll:true});'))
p=root/'tests/journey-release.cjs'
s=p.read_text().replace('.dash-grid','.dashboard-grid').replace("errors.push(e.message)","errors.push(e.stack||e.message)")
s=s.replace("modal.locator(`.j-day-choice`).filter({has:modal.locator(`input[value=\"${n}\"]`)})", "modal.locator(`.j-day-choice:has(input[value=\"${n}\"])`)")
s=s.replace("getComputedStyle(el).animationPlayState),'paused'", "getComputedStyle(el).animationName),'none'")
s=s.replace("snapshot.state=j.enrichDemo(snapshot.state);snapshot.workspaceId", "snapshot.state=j.enrichDemo(snapshot.state);snapshot.state.settings.adventure={...j.DEFAULT_GAME,name:'검증용 여행자'};snapshot.workspaceId")
s=s.replace('assert(await page.locator(`[data-action=v3-claim][data-id="${id}"]`).isDisabled())','await wait(()=>page.locator(`[data-action=v3-claim][data-id="${id}"]`).isDisabled())')
if 'module-probes.json' not in s:
 s=s.replace("fs.writeFileSync(path.join(out,'failure-dom.txt'),await page.locator('body').innerText());", "fs.writeFileSync(path.join(out,'failure-dom.txt'),await page.locator('body').innerText());fs.writeFileSync(path.join(out,'module-probes.json'),JSON.stringify(await page.evaluate(async()=>{const result={};for(const f of ['core','journey-shell','journey-actions','app'])try{await import('/'+f+'.js');result[f]='loaded';}catch(e){result[f]=e.stack||e.message;}return result;}),null,2));")
p.write_text(s)
p=root/'dayboard/journey-polish.css';s=p.read_text()
if 'release-visual-fixes' not in s:s+='\n/* release-visual-fixes */\n.j-category-filter{white-space:nowrap;display:flex;align-items:center;gap:10px}.j-completion-sibling .dash-event{border-left:0}.j-traveler-walk{bottom:54px;height:250px;right:70px}.j-pet{right:-44px;bottom:2px;width:60px}.j-stats .j-chart text{font-variant-numeric:tabular-nums}@media(max-width:600px){.j-traveler-walk{bottom:48px;height:210px;right:50px}.j-pet{width:54px;right:-39px}}\n'
p.write_text(s)
for p in (root/'dayboard').glob('*.js'):
 subprocess.run(['node','--input-type=module','--check'],input=p.read_text(),text=True,check=True)
