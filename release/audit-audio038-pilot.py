"""Audio QA pilot: no reference text is supplied to the recognizer.
G2P differences are diagnostic, not proof of pitch-accent correctness.
"""
from pathlib import Path
import json, time, re, unicodedata, random, hashlib, inspect
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
import torch
from kokoro import KPipeline
from faster_whisper import WhisperModel
from pykakasi import kakasi

src=Path('/tmp/neural037');out=Path('/tmp/audio038-pilot');out.mkdir(exist_ok=True)
meta=json.loads((src/'audio-manifest.json').read_text());records=json.loads((src/'audio-coverage.json').read_text())['records'];byreading={r['reading']:r for r in records}
kks=kakasi()
def kata(s):return ''.join(chr(ord(c)+96) if '\u3041'<=c<='\u3096' else c for c in unicodedata.normalize('NFKC',s))
def hira(s):return ''.join(chr(ord(c)-96) if '\u30a1'<=c<='\u30f6' else c for c in unicodedata.normalize('NFKC',s))
def normalize(s):return re.sub(r'[^\u3041-\u3096ー]','',hira(''.join(x['hira'] for x in kks.convert(s))))
torch.set_num_threads(2);torch.set_num_interop_threads(1);torch.manual_seed(37)
pipe=KPipeline(lang_code='j',repo_id='hexgrad/Kokoro-82M',device='cpu')
import misaki.ja
(out/'g2p-source.py').write_text(inspect.getsource(misaki.ja))
phones=[]
for r in records:
    text=r.get('spokenText',r['reading']);old=pipe.g2p(text+'。')[0];new=pipe.g2p(kata(text)+'。')[0]
    phones.append({'reading':r['reading'],'old':old,'katakana':new,'different':old!=new})
(out/'g2p-comparison.json').write_text(json.dumps(phones,ensure_ascii=False,indent=2))
print('G2P differences',sum(x['different'] for x in phones),flush=True)
asr=WhisperModel('small',device='cpu',compute_type='int8',cpu_threads=2,num_workers=1)
# Samples include EVERY standalone kana reading, plus common and deterministically random words.
selected=[r for r in records if len(r['reading'])==1]
for text in ['おまわりさん','みず','やま','がっこう','にほんご','おいしい','びょういん','びよういん','かみ','はし','さんたくろーす','どらいくりーにんぐ','すーつ','へ','は','を','ん','ら']:
    if text in byreading and byreading[text] not in selected:selected.append(byreading[text])
random.Random(38).shuffle(records)
selected += [r for r in records if r not in selected][:30]
results=[];started=time.time()
def transcribe(audio,sr):
    if sr!=16000:audio=resample_poly(audio,2,3) if sr==24000 else resample_poly(audio,16000,sr)
    audio=np.pad(audio.astype('float32'),(4000,4000))
    segments,_=asr.transcribe(audio,language='ja',beam_size=3,temperature=0,condition_on_previous_text=False,vad_filter=False,initial_prompt=None,word_timestamps=False,no_speech_threshold=.9)
    segs=list(segments)
    return {'text':''.join(s.text for s in segs).strip(),'normalized':normalize(''.join(s.text for s in segs)),'logprob':round(float(np.mean([s.avg_logprob for s in segs])),4) if segs else None}
for i,r in enumerate(selected):
    audio,sr=sf.read(src/r['file'],dtype='float32');old=transcribe(audio,sr)
    text=r.get('spokenText',r['reading']);newtext=kata(text)
    with torch.inference_mode():chunks=[s.audio.detach().cpu().numpy() for s in pipe(newtext+'。',voice='jf_alpha',speed=.9) if s.audio is not None]
    newaudio=np.concatenate(chunks).astype('float32') if chunks else np.zeros(2400,dtype='float32')
    new=transcribe(newaudio,24000)
    if r['reading'] in ['は','へ','を','ら','おまわりさん','みず','すーつ']:
        sf.write(out/(r['reading']+'-before.wav'),audio,sr);sf.write(out/(r['reading']+'-katakana.wav'),newaudio,24000)
    results.append({'reading':r['reading'],'expectedSpoken':text,'g2pBefore':pipe.g2p(text+'。')[0],'g2pAfter':pipe.g2p(newtext+'。')[0],'before':old,'katakana':new})
    if i%10==0:
        (out/'pilot.json').write_text(json.dumps({'done':len(results),'total':len(selected),'seconds':time.time()-started,'results':results},ensure_ascii=False,indent=2));print('checked',i+1,'/',len(selected),'elapsed',round(time.time()-started),flush=True)
(out/'pilot.json').write_text(json.dumps({'done':len(results),'total':len(selected),'seconds':time.time()-started,'results':results},ensure_ascii=False,indent=2))
print('Pilot complete',len(results),flush=True)
