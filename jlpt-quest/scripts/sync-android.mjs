import {mkdir,cp,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),target=path.resolve(root,process.env.KOTOBA_ANDROID_DIR||'../kotoba-android','app/src/main/assets/www');
await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
for(const name of ['index.html','styles.css','typography.css','course.css','snap.css','src','data','icon.svg','icon-192.png','icon-512.png','manifest.webmanifest','privacy.html','terms.html','licenses.html','CONTENT-LICENSE.md'])await cp(path.join(root,name),path.join(target,name),{recursive:true});
for(const old of ['shape-grader.js','engine.js','handwriting.js','content.js','ink.js'])await rm(path.join(target,'src',old),{force:true});
console.log('Android web assets synchronized:',target);
