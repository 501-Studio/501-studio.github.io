"""Generate new Kokoro Japanese audio, never upsample the old HTS recordings.
Build-time synthesis only; installed applications play bundled files offline.
Model: hexgrad/Kokoro-82M (Apache-2.0), voice jf_alpha. See model card.
"""
from pathlib import Path
import argparse, hashlib, json, os, subprocess, time
import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline

p=argparse.ArgumentParser()
p.add_argument('--shard',type=int,default=0)
p.add_argument('--shards',type=int,default=8)
p.add_argument('--limit',type=int,default=0)
p.add_argument('--out',default='/tmp/neural037')
a=p.parse_args()
assert 0<=a.shard<a.shards
root=Path('jlpt-quest/data'); out=Path(a.out); out.mkdir(parents=True,exist_ok=True)
words=[]
for level in ['N5','N4','N3','N2','N1']:
    words.extend(json.loads((root/(level+'.json')).read_text())['words'])
# Explicitly bundle every modern basic kana, voiced/semi-voiced and small kana.
hira='あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉゃゅょっゔ'
for script in ['h','k']:
    for c in hira:
        display=c if script=='h' else chr(ord(c)+96)
        words.append({'id':f'KANA-{script}{ord(display):x}','reading':c,'word':display})
readings={}; clips={}
for w in words:
    text=(w.get('reading') or w['word']).strip()
    name=hashlib.sha256(('kokoro-jf_alpha-v1|'+text).encode()).hexdigest()[:24]+'.ogg'
    readings[name]=text; clips[w['id']]=name
jobs=sorted(readings.items())[a.shard::a.shards]
if a.limit:jobs=jobs[:a.limit]
torch.set_num_threads(2); torch.set_num_interop_threads(1)
torch.manual_seed(0)
pipe=KPipeline(lang_code='j',repo_id='hexgrad/Kokoro-82M',device='cpu')
records=[]; start=time.time()
for i,(name,text) in enumerate(jobs,1):
    target=out/name
    with torch.inference_mode():
        generated=list(pipe(text+'。',voice='jf_alpha',speed=1.0))
    audio=np.concatenate([r.audio.detach().cpu().numpy() for r in generated if r.audio is not None]).astype(np.float32)
    if len(audio)<2400 or not np.isfinite(audio).all():raise RuntimeError('invalid synthesis: '+text)
    peak=float(np.max(np.abs(audio)))
    if peak<.005:raise RuntimeError('silent synthesis: '+text)
    # Remove only leading/trailing silence, keeping generous consonant margins.
    voiced=np.flatnonzero(np.abs(audio)>.003)
    lo=max(0,int(voiced[0])-1920);hi=min(len(audio),int(voiced[-1])+2400)
    audio=audio[lo:hi]
    # Limit gain; preserve dynamics and leave 1.5 dB peak headroom.
    audio*=min(3.0,.84/max(.001,float(np.max(np.abs(audio)))))
    audio=np.pad(audio,(1440,2400))
    wav=out/(name+'.wav');sf.write(wav,audio,24000,subtype='PCM_16')
    subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-i',str(wav),'-ac','1','-ar','24000','-c:a','libopus','-b:a','48k','-application','audio','-vbr','on',str(target)],check=True)
    wav.unlink()
    records.append({'file':name,'reading':text,'seconds':round(len(audio)/24000,4),'peak':round(float(np.max(np.abs(audio))),4),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
    if i%50==0:print(f'shard={a.shard} {i}/{len(jobs)} elapsed={time.time()-start:.1f}s',flush=True)
manifest={'version':2,'complete':True,'words':len(clips),'uniqueClips':len(readings),'format':'Ogg Opus mono 24 kHz source, 48 kbps VBR','generator':'Kokoro-82M v1.0','voice':'jf_alpha','voiceLicense':'Apache-2.0','attribution':'Kokoro-82M by hexgrad; Apache-2.0. See bundled license and model attribution.','clips':clips}
(out/f'shard-{a.shard}.json').write_text(json.dumps({'shard':a.shard,'count':len(records),'records':records},ensure_ascii=False,indent=2))
(out/'audio-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
print(f'Completed shard {a.shard}: {len(records)} newly synthesized clips',flush=True)
