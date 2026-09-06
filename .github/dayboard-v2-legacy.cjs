// Reuse the original 16 regressions without changing their feature assertions.
// Only the initial-surface wait changes: v2 defaults to the dashboard, not a timeline.
// A feature-branch CI run may see v1 production until main is deployed.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
let source=fs.readFileSync('.github/dayboard-smoke.cjs','utf8');
const marker="await page.locator('.timeline').waitFor();";
if(source.split(marker).length!==3)throw new Error('Unexpected legacy test source; review selector adapter');
source=source.replace(marker,"await page.locator('.dashboard-grid').waitFor();");
source=source.replace(marker,"await page.locator('.dashboard-grid,.timeline').first().waitFor();");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dayboard-tests-'));
const file=path.join(dir,'smoke.cjs');fs.writeFileSync(file,source);
try{const r=spawnSync(process.execPath,[file],{stdio:'inherit',env:process.env});process.exitCode=r.status??1;}finally{fs.rmSync(dir,{recursive:true,force:true});}
