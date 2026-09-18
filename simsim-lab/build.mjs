import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {LOCALES,TESTS,VERSION,RESULT_KEYS,PAIR_KEYS,COLORS} from './src/definitions.mjs';
import {loadLocales,quizFor,contentReport} from './src/content.mjs';
import {header,footer,homePage,introPage,resultPage,savedPage,legalPage,errorPage,dialogHTML,esc} from './src/components.mjs';
import {art} from './src/art.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(root,process.env.OUT_DIR||'dist');
const siteURL=(process.env.SITE_URL||'https://weird-lab-501.onrender.com').replace(/\/$/,'');
const base='/' + (process.env.BASE_PATH||'/').replace(/^\/+|\/+$/g,'') + '/';
const basePath=base==='//'?'/':base;
const codes=process.env.BUILD_LOCALES?process.env.BUILD_LOCALES.split(',').map(v=>v.trim()):LOCALES.map(l=>l.code);
if(codes.some(code=>!LOCALES.some(l=>l.code===code)))throw new Error('Unknown BUILD_LOCALES entry');
const started=Date.now();
const locales=await loadLocales(codes);
await fs.rm(output,{recursive:true,force:true});await fs.mkdir(output,{recursive:true});
async function sourceHash(folder){const hash=createHash('sha256');async function walk(dir){for(const item of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,item.name);if(item.isDirectory())await walk(file);else{hash.update(path.relative(folder,file));hash.update(await fs.readFile(file));}}}await walk(folder);return hash.digest('hex').slice(0,12);}
const fingerprint=await sourceHash(path.join(root,'src'));
const assetRel=`assets/${fingerprint}/`,assetBase=basePath+assetRel;
const assetDir=path.join(output,assetRel);await fs.mkdir(assetDir,{recursive:true});
for(const name of ['definitions.mjs','core.mjs','components.mjs','art.mjs','client.mjs','result-image.mjs','style.css'])await fs.copyFile(path.join(root,'src',name),path.join(assetDir,name));
await fs.cp(path.join(root,'src/integrations'),path.join(assetDir,'integrations'),{recursive:true});
const canonical=relative=>new URL(basePath+relative,siteURL).href;
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const sitemap=[];let htmlCount=0;
const ogLocale={en:'en_US',ko:'ko_KR',es:'es_ES','pt-BR':'pt_BR',ja:'ja_JP',id:'id_ID',hi:'hi_IN',de:'de_DE',fr:'fr_FR',ar:'ar_AR',vi:'vi_VN',th:'th_TH',tr:'tr_TR','zh-CN':'zh_CN'};
async function write(relative,contents){const dest=path.join(output,relative);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,contents);}
function context(locale){
 const cat=locale.catalog.map((t,i)=>({...t,resultNames:locale.rows[i][6].split('~').map(s=>s.trim())}));
 return {base:basePath,assetBase,siteURL,locale:locale.code,dir:LOCALES.find(l=>l.code===locale.code).dir,ui:locale.ui,categoryMap:locale.categoryMap,catalog:cat,heroCardLabels:[quizFor(locale,'rpg-class').results[0].name,quizFor(locale,'past-life').results[3].name]};
}
function alternates(relative,kind){
 return codes.map(code=>({code,path:kind==='root'?`${code}/`:relative.replace(/^[^/]+\//,`${code}/`)})).concat([{code:'x-default',path:kind==='home'||kind==='root'?'':relative.replace(/^[^/]+\//,'en/')}]);
}
async function page(c,relative,{kind,title,description,body,slug='',resultKey='',indexable=true}){
 const url=canonical(relative),image=canonical(`${assetRel}og/${c.locale}/${slug||'home'}.png`);
 const compactCatalog=['home','root','saved'].includes(kind)?c.catalog:c.catalog.filter(t=>t.slug===slug||((c.currentQuiz?.recommendations)||[]).includes(t.slug));
 const boot={base:c.base,assetBase:c.assetBase,siteURL:c.siteURL,locale:c.locale,dir:c.dir,ui:c.ui,categoryMap:c.categoryMap,catalog:compactCatalog,heroCardLabels:c.heroCardLabels,page:kind,slug,resultKey};
 const hreflang=alternates(relative,kind).map(a=>`<link rel="alternate" hreflang="${a.code}" href="${canonical(a.path)}">`).join('\n');
 const doc=`<!doctype html>\n<html lang="${c.locale}" dir="${c.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fffdf8"><meta name="color-scheme" content="light"><meta name="referrer" content="strict-origin-when-cross-origin"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${indexable?'index,follow':'noindex,follow'}"><link rel="canonical" href="${url}">${hreflang}<meta property="og:type" content="website"><meta property="og:site_name" content="SimsimLAB"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><meta property="og:locale" content="${ogLocale[c.locale]}"><meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(title)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${image}"><link rel="icon" type="image/svg+xml" href="${basePath}favicon.svg"><link rel="stylesheet" href="${assetBase}style.css"><script type="application/ld+json">${json({'@context':'https://schema.org','@type':'WebApplication',name:title,description,url,inLanguage:c.locale,applicationCategory:'EntertainmentApplication',operatingSystem:'Any'})}</script></head><body>${header(c)}<main id="main" tabindex="-1">${body}</main><noscript><div class="noscript">${esc(c.ui.disclaimer)}<br>${LOCALES.filter(l=>codes.includes(l.code)).map(l=>`<a href="${basePath}${l.code}/" lang="${l.code}">${esc(l.name)}</a>`).join(' · ')}</div></noscript>${footer(c)}${dialogHTML(c)}<script type="application/json" id="simsim-boot">${json(boot)}</script><script type="module" src="${assetBase}client.mjs"></script></body></html>`;
 await write(relative+'index.html',doc);htmlCount++;if(indexable)sitemap.push(url);
}
function fontFor(code){return ({ko:'Noto Sans CJK KR',ja:'Noto Sans CJK JP','zh-CN':'Noto Sans CJK SC',ar:'Noto Sans Arabic',hi:'Noto Sans Devanagari',th:'Noto Sans Thai'})[code]||'Noto Sans';}
async function textLayer(text,code,width,height,size,weight='normal',color='#2b2138',align='left'){
 const escaped=String(text).replace(/[&<>]/g,v=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[v]));
 const image=await sharp({text:{text:`<span foreground="${color}">${escaped}</span>`,font:`${fontFor(code)} ${weight==='bold'?'Bold ':''}${size}`,width,height,rgba:true,align,wrap:'word-char',spacing:8}}).png().toBuffer();return image;
}
async function og(c,q=null){
 const theme=q?COLORS[q.category]:{bg:'#eee0fc'},rtl=c.dir==='rtl',title=q?q.title:`${c.ui.hero1}\n${c.ui.hero2}`,subtitle=q?q.description:c.ui.tagline;
 const canvas=`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="${theme.bg}"/><rect x="42" y="46" width="1122" height="552" rx="28" fill="#2b2138"/><rect x="32" y="32" width="1122" height="552" rx="28" fill="#fffdf8" stroke="#2b2138" stroke-width="3"/><circle cx="${rtl?225:974}" cy="290" r="145" fill="${theme.bg}"/><path d="M78 128h1030M78 523h1030" stroke="#ded0e8" stroke-width="2"/></svg>`;
 const overlays=[];
 const brand=await textLayer(c.ui.brand,c.locale,590,53,34,'bold','#7950bf',rtl?'right':'left');overlays.push({input:brand,left:rtl?515:78,top:65});
 const titleText=await textLayer(title,c.locale,694,259,61,'bold','#2b2138',rtl?'right':'left');overlays.push({input:titleText,left:rtl?433:78,top:175});
 const subtitleText=await textLayer(subtitle,c.locale,694,100,25,'normal','#826b90',rtl?'right':'left');overlays.push({input:subtitleText,left:rtl?433:78,top:397});
 const footerText=await textLayer(`${c.ui.questionCount} · ${c.ui.noSignup}`,c.locale,910,40,20,'normal','#826b90',rtl?'right':'left');overlays.push({input:footerText,left:rtl?206:78,top:545});
 const illustration=art(q?.slug||'rpg-class',q?.emoji||'⚔️','og');
 let artwork;if(illustration.startsWith('<svg'))artwork=await sharp(Buffer.from(illustration)).resize(330,261).png().toBuffer();else artwork=await textLayer(q.emoji,c.locale,250,220,134,'normal','#2b2138','center');
 overlays.push({input:artwork,left:rtl?61:807,top:164});
 const out=path.join(assetDir,'og',c.locale,`${q?.slug||'home'}.png`);await fs.mkdir(path.dirname(out),{recursive:true});await sharp(Buffer.from(canvas)).composite(overlays).png({compressionLevel:9,palette:true}).toFile(out);
}

for(const code of codes){
 const locale=locales[code],c=context(locale);
 console.log(`Building ${code}: 50 tests, 300 character pages`);
 await og(c);await page(c,`${code}/`,{kind:'home',title:`${c.ui.brand} · ${c.ui.allHeading}`,description:c.ui.tagline,body:homePage(c)});
 await page(c,`${code}/saved/`,{kind:'saved',title:`${c.ui.saved} | ${c.ui.brand}`,description:c.ui.savedNote,body:savedPage(c),indexable:false});
 for(const kind of ['about','privacy','terms'])await page(c,`${code}/${kind}/`,{kind,title:`${c.ui[kind]} | ${c.ui.brand}`,description:c.ui.disclaimer,body:legalPage(c,kind,locale.legal[kind])});
 for(const t of TESTS){
  const q=quizFor(locale,t),qc={...c,currentQuiz:q};
  await write(`${assetRel}content/${code}/${q.slug}.json`,json(q));
  await og(c,q);
  await page(qc,`${code}/tests/${q.slug}/`,{kind:'test',title:q.seo.title,description:q.seo.description,body:introPage(c,q),slug:q.slug});
  for(let i=0;i<6;i++){const r=q.results[i];await page(qc,`${code}/results/${q.slug}/${r.key}/`,{kind:'result',title:`${r.name} · ${q.title} | ${c.ui.brand}`,description:`${r.catchphrase} ${q.description}`,body:resultPage(c,q,i),slug:q.slug,resultKey:r.key});}
 }
 await write(`${assetRel}catalog/${code}.json`,json(c.catalog));
}
const defaultLocale=locales.en||locales[codes[0]],defaultContext=context(defaultLocale);
await page(defaultContext,'',{kind:'root',title:`SimsimLAB · ${defaultContext.ui.allHeading}`,description:defaultContext.ui.tagline,body:homePage(defaultContext)});
const notFound=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>SimsimLAB</title><link rel="stylesheet" href="${assetBase}style.css"></head><body><main class="narrow error-page"><h1>SimsimLAB</h1><div class="locale-choice-grid">${codes.map(code=>{const l=LOCALES.find(l=>l.code===code);return `<a href="${basePath}${code}/" lang="${code}" dir="${l.dir}">${esc(l.name)}</a>`;}).join('')}</div></main></body></html>`;
await write('404.html',notFound);
await write('favicon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="19" fill="#9166ec" stroke="#2b2138" stroke-width="3"/><path d="M21 22c4-8 24-7 25 1 0 7-23 2-24 10-1 9 20 10 23 2" fill="none" stroke="#fff7e7" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="13" r="8" fill="#dcf5a2" stroke="#2b2138" stroke-width="3"/></svg>');
await write('.nojekyll','');
await write('robots.txt',`User-agent: *\nAllow: ${basePath}\nDisallow: ${basePath}legacy/\nSitemap: ${canonical('sitemap.xml')}\n`);
await write('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemap.map(url=>`<url><loc>${esc(url)}</loc></url>`).join('')}</urlset>`);
// Compatibility with the original static host's existing syntax-check build command.
await write('app.js','// SimsimLAB uses the versioned ES module under assets/.\n');
await write('data.js','// Per-quiz localized content is lazy-loaded from versioned JSON assets.\n');
const old=path.resolve(root,'../weird-lab');
try{for(const name of ['index.html','app.js','data.js','style.css','favicon.svg']){await fs.mkdir(path.join(output,'legacy'),{recursive:true});await fs.copyFile(path.join(old,name),path.join(output,'legacy',name));}}catch(error){if(error.code!=='ENOENT')throw error;console.log('No bundled legacy v1 site; standalone deployment does not require it.');}
const report={...contentReport(locales),version:VERSION,commit:process.env.GITHUB_SHA||null,assetFingerprint:fingerprint,siteURL,basePath,htmlPages:htmlCount,sitemapURLs:sitemap.length,ogImages:codes.length*51,buildMilliseconds:Date.now()-started,builtAt:new Date().toISOString()};
await write('build-info.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
