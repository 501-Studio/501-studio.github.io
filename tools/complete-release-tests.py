"""Normalize selectors to the existing DOM and retain actionable browser diagnostics."""
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'tests/journey-release.cjs'
s=p.read_text().replace('.dash-grid','.dashboard-grid').replace("errors.push(e.message)","errors.push(e.stack||e.message)")
s=s.replace("modal.locator(`.j-day-choice`).filter({has:modal.locator(`input[value=\"${n}\"]`)})", "modal.locator(`.j-day-choice:has(input[value=\"${n}\"])`)")
s=s.replace("fs.writeFileSync(path.join(out,'failure-dom.txt'),await page.locator('body').innerText());", "fs.writeFileSync(path.join(out,'failure-dom.txt'),await page.locator('body').innerText());fs.writeFileSync(path.join(out,'module-probes.json'),JSON.stringify(await page.evaluate(async()=>{const result={};for(const f of ['core','journey-shell','journey-actions','app'])try{await import('/'+f+'.js');result[f]='loaded';}catch(e){result[f]=e.stack||e.message;}return result;}),null,2));")
p.write_text(s)
