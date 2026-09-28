"""New sentence audio, not concatenated word clips or third-party recordings.
Synthesis and voice weights are pinned; decoded output is audited individually.
No translation or speech model ships inside the Android app.
"""
from pathlib import Path
import argparse,json,hashlib,time,subprocess
import numpy as np,soundfile as sf,torch
from scipy.signal import resample_poly
from huggingface_hub import hf_hub_download
from kokoro import KPipeline,KModel
p=argparse.ArgumentParser();p.add_argument('--shard',type=int,required=True);p.add_argument('--shards',type=int,default=8);p.add_argument('--input',default='/tmp/examples039-final/examples.json');p.add_argument('--out',default='/tmp/example-audio039');a=p.parse_args()
assert 0<=a.shard<a.shards
out=Path(a.out);(out/'audio').mkdir(parents=True,exist_ok=True)
pack=json.loads(Path(a.input).read_text());entries=sorted(pack['entries'],key=lambda e:e['id']);jobs=entries[a.shard::a.shards]
repo='hexgrad/Kokoro-82M';revision='f3ff3571791e39611d31c381e3a41a3af07b4987'
files={n:hf_hub_download(repo,n,revision=revision) for n in ['config.json','kokoro-v1_0.pth','voices/jf_alpha.pt']}
torch.set_num_threads(2);torch.set_num_interop_threads(1)
model=KModel(repo_id=repo,config=files['config.json'],model=files['kokoro-v1_0.pth']).to('cpu').eval()
pipe=KPipeline(lang_code='j',repo_id=repo,model=model,device='cpu');voice=torch.load(files['voices/jf_alpha.pt'],weights_only=True)
records=[];start=time.time()
def measurements(x,sr):
 assert x.ndim==1 and len(x)>0 and np.isfinite(x).all()
 frame=int(sr*.01);z=np.pad(x,(0,(-len(x))%frame));r=np.sqrt(np.mean(z.reshape(-1,frame)**2,axis=1));on=r>max(.0015,float(r.max())*.03);i=np.flatnonzero(on);assert len(i)
 return {'seconds':round(len(x)/sr,4),'sampleRate':sr,'truePeakDb':round(20*np.log10(max(float(np.max(np.abs(resample_poly(x,4,1)))),1e-10)),3),'activeRmsDb':round(20*np.log10(max(float(np.sqrt(np.mean(r[on]**2))),1e-10)),3),'clippedSamples':int(np.count_nonzero(np.abs(x)>=.999)),'leadSeconds':round(i[0]*.01,3),'tailSeconds':round((len(r)-1-i[-1])*.01,3)}
for i,e in enumerate(jobs,1):
 text=e['ja'];phones,_=pipe.g2p(text);assert phones and len(phones)<510,(e['id'],text)
 # Whole-sentence Japanese retains grammar (e.g. particle は/へ) and prosody.
 torch.manual_seed(int(hashlib.sha256(text.encode()).hexdigest()[:8],16))
 with torch.inference_mode():parts=[r.audio.detach().cpu().numpy() for r in pipe.generate_from_tokens(phones,voice=voice,speed=.96) if r.audio is not None]
 assert parts,(e['id'],'empty synthesis')
 x=np.concatenate(parts).astype('float32');audible=np.flatnonzero(np.abs(x)>.0004);assert len(audible)
 x=x[max(0,audible[0]-2880):min(len(x),audible[-1]+3600)].copy();x-=x.mean();m=measurements(x,24000)
 gain=min(10**((-17-m['activeRmsDb'])/20),10**((-3.2-m['truePeakDb'])/20),4.0);x*=gain
 n=min(144,len(x)//10);ramp=np.linspace(0,1,n,dtype=np.float32);x[:n]*=ramp;x[-n:]*=ramp[::-1];x=np.pad(x,(1920,3600))
 name=e['audioFile'];assert name==hashlib.sha256(('kotoba039-example-jf-alpha|'+text).encode()).hexdigest()[:24]+'.ogg'
 wav=out/(name+'.wav');sf.write(wav,x,24000,subtype='PCM_16');dst=out/'audio'/name
 subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-i',str(wav),'-ac','1','-ar','24000','-c:a','libopus','-b:a','40k','-application','audio','-vbr','on',str(dst)],check=True);wav.unlink()
 y,sr=sf.read(dst,dtype='float32');m=measurements(y,sr)
 assert sr==24000 and .2<m['seconds']<35 and m['clippedSamples']==0 and m['truePeakDb']<-.5,(e['id'],m)
 records.append({'id':e['id'],'file':name,'text':text,'phonemes':phones,**m,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
 if i%50==0:
  (out/f'part-{a.shard}.json').write_text(json.dumps({'complete':False,'records':records},ensure_ascii=False));print(a.shard,i,len(jobs),round(time.time()-start),flush=True)
(out/f'part-{a.shard}.json').write_text(json.dumps({'complete':True,'shard':a.shard,'modelRevision':revision,'voice':'jf_alpha','format':'Opus 24kHz mono 40kbps VBR','records':records},ensure_ascii=False))
print('Sentence audio complete:',a.shard,len(records),flush=True)
