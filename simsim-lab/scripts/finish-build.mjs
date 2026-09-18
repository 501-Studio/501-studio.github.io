import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(root,process.env.OUT_DIR||'dist');
const info=JSON.parse(await fs.readFile(path.join(out,'build-info.json'),'utf8'));
const css=await fs.readFile(path.join(root,'src/layout-overrides.css'),'utf8');
// Included in the source fingerprint before the build, with no extra browser request.
await fs.appendFile(path.join(out,'assets',info.assetFingerprint,'style.css'),'\n'+css);
console.log('Applied localized layout safeguards to the fingerprinted CSS.');
