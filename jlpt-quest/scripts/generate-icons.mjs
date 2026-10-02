// Reproducible original four-colour app icon. No downloaded artwork or font files.
import {deflateSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(name,data){const type=Buffer.from(name),head=Buffer.alloc(4),sum=Buffer.alloc(4);head.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([head,type,data,sum]);}
const colours=[[240,237,255],[113,96,232],[153,136,242],[194,182,250]],bars=[[26,24,46,84],[49,28,69,76],[72,35,89,65]];
for(const {size,alpha,name} of [{size:192,alpha:false,name:'icon-192.png'},{size:512,alpha:false,name:'icon-512.png'},{size:512,alpha:true,name:'icon-play-store.png'}]){
 const channels=alpha?4:3,row=1+size*channels,pixels=Buffer.alloc(row*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=(x+.5)*108/size,py=(y+.5)*108/size;let colour=0;
  bars.forEach(([x1,y1,x2,y2],i)=>{const radius=7,cx=Math.max(x1+radius,Math.min(x2-radius,px)),cy=Math.max(y1+radius,Math.min(y2-radius,py));if(px>=x1&&px<=x2&&py>=y1&&py<=y2&&Math.hypot(px-cx,py-cy)<=radius)colour=i+1;});
  colours[colour].forEach((v,i)=>pixels[y*row+1+x*channels+i]=v);
  if(alpha)pixels[y*row+1+x*channels+3]=255;
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=alpha?6:2;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
 await writeFile(new URL(`../${name}`,import.meta.url),png);
}
console.log('Original app icons and 512px RGBA Play Store icon generated.');
