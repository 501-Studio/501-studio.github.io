/** Fetch immutable public data at build time; no API keys, accounts or scraped textbook content. */
import {mkdir,writeFile,rename,rm,readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import path from 'node:path';
import {LEVELS,EXPECTED,SOURCE_REV,SOURCE_BASE,parsePack} from '../src/catalog.js';
const base=path.resolve(fileURLToPath(new URL('../',import.meta.url))),stage=path.join(base,'data','.stage');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function main(){
 const koreanPath=path.join(base,'data','korean-glosses.json');
 let korean;
 try{korean=JSON.parse(await readFile(koreanPath,'utf8'));}catch{throw Error('Korean gloss pack missing. Run the Korean localization workflow first.');}
 if(!korean.complete||!korean.glosses)throw Error('Korean gloss pack is incomplete.');
 await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});
 const coverage={version:2,sourceRevision:SOURCE_REV,allPacksComplete:false,koreanOnly:true,generatedAt:new Date().toISOString(),levels:{}};
 try{for(const level of LEVELS){const url=`${SOURCE_BASE}${level.toLowerCase()}.json`;const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`${level}: HTTP ${response.status}`);const text=await response.text();if(text.length>8e6)throw Error('Oversize source');const p=parsePack(JSON.parse(text),level);
 for(const w of p.words){
   const ko=korean.glosses[w.id];
   if(typeof ko!=='string'||!ko.trim()||(!/[가-힣]/.test(ko)&&/[A-Za-z]{2,}/.test(ko)))throw Error(`${level} Korean gloss missing: ${w.word}(${w.reading})`);
   w.meaning=ko.trim();w.language='ko';w.glossSource=w.source==='kotoba-editorial'?'editorial-ko':'mt-ko-reviewed-pending';
 }
 p.sha256=sha(text);p.sourceUrl=url;p.koreanOnly=true;
 await writeFile(path.join(stage,`${level}.json`),JSON.stringify(p));
 coverage.levels[level]={raw:EXPECTED[level],words:p.words.length,merged:p.merged,supplemental:p.supplemental,english:0,korean:p.words.length,sourceSha256:p.sha256,complete:p.complete&&p.words.every(w=>w.language==='ko')};console.log(`${level}: ${p.sourceRows} source rows → ${p.words.length} installed (${p.merged} merged, ${p.supplemental} editorial additions)`);}
 const response=await fetch(`https://raw.githubusercontent.com/evanclan/OpenJLPT/${SOURCE_REV}/NOTICE.md`,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Source license not retrieved');await writeFile(path.join(stage,'OPENJLPT-NOTICE.md'),await response.text());
 coverage.allPacksComplete=LEVELS.every(l=>coverage.levels[l].complete);await writeFile(path.join(stage,'coverage.json'),JSON.stringify(coverage,null,2));
 for(const name of [...LEVELS.map(l=>`${l}.json`),'OPENJLPT-NOTICE.md','coverage.json'])await rename(path.join(stage,name),path.join(base,'data',name));await rm(stage,{recursive:true});console.log('All packs vendored with Korean-only display glosses. Machine-translated glosses still require editorial review before production.');
 }catch(e){await rm(stage,{recursive:true,force:true});throw e;}}
main().catch(e=>{console.error('CONTENT BUILD FAILED; no partial pack published:',e.message);process.exitCode=1;});
