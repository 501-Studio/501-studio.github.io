import { COLORS } from './definitions.mjs';
import { art } from './art.mjs';

function tokens(text,locale,granularity='word'){
 try{return [...new Intl.Segmenter(locale,{granularity}).segment(text)].map(v=>v.segment);}catch{return granularity==='word'?String(text).split(/(\s+)/):[...String(text)];}
}
export function wrap(ctx,text,width,locale){
 const lines=[];let line='';
 for(const word of tokens(String(text),locale)){
  if(word.includes('\n')){if(line.trim())lines.push(line.trim());line='';continue;}
  if(ctx.measureText(line+word).width<=width){line+=word;continue;}
  if(line.trim()){lines.push(line.trim());line='';}
  if(ctx.measureText(word).width<=width){line=word.trimStart();continue;}
  for(const char of tokens(word,locale,'grapheme')){
   if(ctx.measureText(line+char).width>width&&line){lines.push(line);line='';}line+=char;
  }
 }
 if(line.trim())lines.push(line.trim());return lines;
}
function roundRect(ctx,x,y,w,h,r,fill,stroke=null,line=2){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}}
async function drawArt(ctx,slug,emoji){
 const source=art(slug,emoji,'export');
 if(!source.startsWith('<svg')){ctx.font='110px system-ui';ctx.textAlign='center';ctx.fillText(emoji,540,320);return;}
 const blob=new Blob([source],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
 try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});ctx.drawImage(image,380,152,320,253);}finally{URL.revokeObjectURL(url);}
}
export async function makeResultImage(context,quiz,index,computed){
 await document.fonts.ready;
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 const {locale,ui}=context,r=quiz.results[index],colors=COLORS[quiz.category];
 const rtl=locale==='ar';
 const family="system-ui,-apple-system,'Noto Sans','Noto Sans CJK KR','Noto Sans Arabic','Noto Sans Devanagari','Noto Sans Thai',sans-serif";
 ctx.fillStyle=colors.bg;ctx.fillRect(0,0,1080,1350);
 ctx.fillStyle='#ffffff47';for(let i=0;i<22;i++){ctx.beginPath();ctx.arc((i*173)%1080,(i*131)%1350,3,0,Math.PI*2);ctx.fill();}
 roundRect(ctx,54,59,984,1252,28,'#2b2138');
 roundRect(ctx,44,46,984,1252,28,'#fffdf8','#2b2138',3);
 ctx.direction=rtl?'rtl':'ltr';
 ctx.textAlign=rtl?'right':'left';ctx.font=`850 33px ${family}`;ctx.fillStyle='#7850c6';ctx.fillText(ui.brand,rtl?974:96,112);
 ctx.direction='ltr';ctx.textAlign=rtl?'left':'right';ctx.font=`600 20px ${family}`;ctx.fillStyle='#8c7698';ctx.fillText(`${String(quiz.id+1).padStart(2,'0')} / 50`,rtl?96:974,110);
 ctx.strokeStyle='#e3d5eb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(96,142);ctx.lineTo(974,142);ctx.stroke();
 ctx.fillStyle=colors.bg;ctx.beginPath();ctx.arc(540,277,118,0,Math.PI*2);ctx.fill();
 await drawArt(ctx,quiz.slug,quiz.emoji);
 ctx.direction=rtl?'rtl':'ltr';ctx.textAlign='center';ctx.fillStyle='#8a7195';ctx.font=`600 24px ${family}`;
 const topic=wrap(ctx,quiz.title,874,locale);const topicSize=topic.length>2?21:24;ctx.font=`600 ${topicSize}px ${family}`;
 wrap(ctx,quiz.title,880,locale).slice(0,2).forEach((line,i)=>ctx.fillText(line,540,425+i*32));
 let size=['ar','hi','th'].includes(locale)?58:64,titleLines=[];
 do{ctx.font=`900 ${size}px ${family}`;titleLines=wrap(ctx,r.name,870,locale);if(titleLines.length<=3)break;size-=2;}while(size>38);
 const lineHeight=Math.round(size*1.27),titleHeight=titleLines.length*lineHeight;
 let titleY=487+(205-titleHeight)/2;
 ctx.fillStyle='#2b2138';for(const line of titleLines){ctx.fillText(line,540,titleY);titleY+=lineHeight;}
 let quoteSize=29,quoteLines=[];do{ctx.font=`500 ${quoteSize}px ${family}`;quoteLines=wrap(ctx,r.catchphrase,850,locale);if(quoteLines.length<=2)break;quoteSize-=1;}while(quoteSize>20);
 ctx.fillStyle='#7d628d';const quoteY=Math.max(694,titleY+3);quoteLines.forEach((line,i)=>ctx.fillText(line,540,quoteY+i*39));
 const contentTop=820;
 if(computed){
  ctx.textAlign=rtl?'right':'left';ctx.direction=rtl?'rtl':'ltr';ctx.font=`750 24px ${family}`;ctx.fillStyle='#7c5d8c';
  const heading=quiz.mode==='duo'?`${ui.pairScore} · ${computed.score}/100`:ui.metrics;
  let hs=24;while(ctx.measureText(heading).width>865&&hs>17){hs--;ctx.font=`750 ${hs}px ${family}`;}ctx.fillText(heading,rtl?964:106,contentTop);
  computed.metrics.forEach((value,i)=>{
   const y=869+i*70;ctx.font=`600 26px ${family}`;ctx.fillStyle='#594466';ctx.textAlign=rtl?'right':'left';
   let fs=26;while(ctx.measureText(quiz.metricLabels[i]).width>720&&fs>18){fs--;ctx.font=`600 ${fs}px ${family}`;}
   ctx.fillText(quiz.metricLabels[i],rtl?964:106,y);
   ctx.font=`800 29px ${family}`;ctx.textAlign=rtl?'left':'right';ctx.fillStyle='#7951bd';ctx.fillText(String(value),rtl?106:964,y);
   roundRect(ctx,106,y+14,858,8,4,'#ede3f3');
   if(value>0)roundRect(ctx,rtl?964-858*value/100:106,y+14,858*value/100,8,4,colors.accent);
  });
 }else{
  ctx.textAlign='center';ctx.font=`500 29px ${family}`;ctx.fillStyle='#796285';
  wrap(ctx,ui.noMetrics,810,locale).slice(0,5).forEach((line,i)=>ctx.fillText(line,540,875+i*49));
 }
 ctx.strokeStyle='#e5d9ec';ctx.beginPath();ctx.moveTo(96,1154);ctx.lineTo(974,1154);ctx.stroke();
 ctx.direction=rtl?'rtl':'ltr';ctx.textAlign='center';ctx.fillStyle='#8a7594';ctx.font=`400 20px ${family}`;
 let noteSize=20,noteLines=wrap(ctx,ui.disclaimer,840,locale);while(noteLines.length>2&&noteSize>15){noteSize--;ctx.font=`400 ${noteSize}px ${family}`;noteLines=wrap(ctx,ui.disclaimer,840,locale);}
 noteLines.forEach((line,i)=>ctx.fillText(line,540,1193+i*29));
 ctx.direction='ltr';ctx.textAlign='center';ctx.font=`650 19px ${family}`;ctx.fillStyle='#7850c6';
 let host;try{host=new URL(context.siteURL).host;}catch{host='SimsimLAB';}
 ctx.fillText(host,540,1267);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image export failed')),'image/png'));
 return blob;
}
export function downloadBlob(blob,filename){const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
