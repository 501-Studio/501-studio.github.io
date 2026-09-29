import {readFile,writeFile} from 'node:fs/promises';
import {idFor} from '../src/catalog.js';
const root=new URL('../',import.meta.url);
const rows=(await readFile(new URL('editorial/study040.tsv',root),'utf8')).trim().split('\n').map(s=>s.split('\t'));
const usage=JSON.parse(await readFile(new URL('editorial/usage040.json',root),'utf8'));
const vocab=(await Promise.all(['N5','N4','N3','N2','N1'].map(async l=>JSON.parse(await readFile(new URL('data/'+l+'.json',root),'utf8')).words))).flat();const ids=new Set(vocab.map(w=>w.id));
const seeds=rows.map(([level,word,reading,meaning,easy,easyKo,natural,naturalKo,paraphrase],i)=>{
 const id=idFor(level,word,reading);if(!ids.has(id)||!easy.includes(word)||!natural.includes(word)||!/[가-힣]/.test(easyKo+naturalKo))throw Error('Invalid curated word: '+word);
 return {id,level,word,reading,meaning,easy,easyKo,natural,naturalKo,paraphrase,type:['reading','meaning','context','synonym','usage'][i%5],usage:usage[word]||null};
});
await writeFile(new URL('data/study040-seed.js',root),'// Original assistant-authored learning content. Independent language review pending.\nexport const seeds='+JSON.stringify(seeds,null,1)+';\n');
console.log('Original bilingual example pairs:',seeds.length,' / mock items:',seeds.length);
