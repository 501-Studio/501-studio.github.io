"""Full audio audit/repair. The independent ASR NEVER receives the target text.
Every old and new file is decoded and measured. ASR disagreement is preserved as
review-required evidence, not silently certified correct. Build-time models only.
"""
from pathlib import Path
import argparse, collections, hashlib, json, re, time, unicodedata, subprocess
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
import torch
from kokoro import KPipeline
from misaki.cutlet import Word
from faster_whisper import WhisperModel
from pykakasi import kakasi

p=argparse.ArgumentParser();p.add_argument('--shard',type=int,required=True);p.add_argument('--shards',type=int,default=8);a=p.parse_args()
assert 0<=a.shard<a.shards
src=Path('/tmp/neural037');out=Path('/tmp/audio038');out.mkdir(exist_ok=True);(out/'audio').mkdir(exist_ok=True)
old_manifest=json.loads((src/'audio-manifest.json').read_text());old_records=json.loads((src/'audio-coverage.json').read_text())['records']
old_index={r['file']:r for r in old_records}
READING_FIXES={'N5-cgfly3':{'word':'十','reading':'じゅう','old':'じゅう とお'},'N3-1b97nrt':{'word':'とん','reading':'とん','old':'(1000'},'N3-1d6ofkx':{'word':'賛成','reading':'さんせい','old':'Uӣ[い'}}
# Orthographic は in these fixed expressions is pronounced wa; this is NOT a global ha->wa substitution.
EXPRESSIONS={'こんにちは':'こんにちわ','こんばんは':'こんばんわ','それでは':'それでわ','では':'でわ','じつは':'じつわ','または':'またわ','あるいは':'あるいわ','ひいては':'ひいてわ','もしくは':'もしくわ'}
SMALL={'ぁ':'あ','ぃ':'い','ぅ':'う','ぇ':'え','ぉ':'お','ゃ':'や','ゅ':'ゆ','ょ':'よ','っ':'ちいさいつ','ゔ':'ゔ','を':'お'}
all_words=[]
for level in ['N5','N4','N3','N2','N1']:all_words+=json.loads(Path(f'jlpt-quest/data/{level}.json').read_text())['words']
word_map={w['id']:w for w in all_words};ids_by_file=collections.defaultdict(list)
for word_id,name in old_manifest['clips'].items():ids_by_file[name].append(word_id)
def kata(s):return ''.join(chr(ord(c)+96) if '\u3041'<=c<='\u3096' else c for c in unicodedata.normalize('NFKC',s))
def hira(s):return ''.join(chr(ord(c)-96) if '\u30a1'<=c<='\u30f6' else c for c in unicodedata.normalize('NFKC',s))
def target(oldname):
    r=old_index[oldname];fixed={READING_FIXES[i]['reading'] for i in ids_by_file[oldname] if i in READING_FIXES}
    assert len(fixed)<=1
    reading=next(iter(fixed)) if fixed else r['reading']
    assert re.fullmatch('[ぁ-ゖァ-ヶー]+',reading),('invalid source reading',reading)
    spoken=SMALL.get(reading,EXPRESSIONS.get(reading,reading))
    return reading,spoken
names=sorted(ids_by_file);jobs=names[a.shard::a.shards]
new_names={name:hashlib.sha256(('038-phonetic-audit-v1|'+name).encode()).hexdigest()[:24]+'.ogg' for name in names}
new_manifest={'version':3,'audioRevision':'038-phonetic-audit-v1','complete':True,'words':len(old_manifest['clips']),'uniqueClips':len(names),'format':'Ogg Opus mono; 24 kHz synthesis; 64 kbps VBR','generator':'Kokoro-82M v1.0','voice':'jf_alpha','voiceLicense':'Apache-2.0','attribution':'Kokoro-82M by hexgrad, Apache-2.0; Misaki/Cutlet, MIT. Build-time synthesis with explicit kana pronunciation validation.','clips':{i:new_names[f] for i,f in old_manifest['clips'].items()},'speechTexts':{i:kata(target(f)[1]) for i,f in old_manifest['clips'].items()},'readingCorrections':READING_FIXES,'independentNativeReview':False}
(out/'audio-manifest.json').write_text(json.dumps(new_manifest,ensure_ascii=False,separators=(',',':')))

kks=kakasi();torch.set_num_threads(2);torch.set_num_interop_threads(1)
pipe=KPipeline(lang_code='j',repo_id='hexgrad/Kokoro-82M',device='cpu')
cutlet=pipe.g2p.cutlet
assert cutlet is not None,'Pinned Cutlet frontend required'
def sound_key(phones):
    s=phones.replace(' ','').replace('.','')
    s=re.sub(r'([aeioɯɨ])ː',r'\1\1',s)
    # Conventional Japanese long vowels; do NOT merge ha/wa or he/e.
    return s.replace('oɯ','oo').replace('ei','ee').replace('ɨ','ɯ')
def forced_phones(reading):
    direct=cutlet._romaji_word(Word(surface=reading,hira=reading,char_type=6))
    assert direct and not re.search('[ぁ-ゖァ-ヶ]',direct)
    candidate=pipe.g2p(kata(reading)+'。')[0].strip().rstrip('.').replace(' ','')
    # Use natural dictionary long-vowel pronunciation only when its phonetic
    # content agrees with the declared reading. Otherwise bypass tokenization.
    phones=candidate if sound_key(candidate)==sound_key(direct) else direct
    return phones+'.',direct,candidate

def metrics(x,sr):
    assert x.ndim==1 and len(x)>0 and np.isfinite(x).all()
    n=max(1,int(sr*.01));xp=np.pad(x,(0,(-len(x))%n));fr=np.sqrt(np.mean(xp.reshape(-1,n)**2,axis=1));mask=fr>max(.002,fr.max()*.045);idx=np.flatnonzero(mask)
    assert len(idx)>0,'Silent recording'
    rms=float(np.sqrt(np.mean(fr[mask]**2)));pk=float(np.max(abs(x)));tp=float(np.max(abs(resample_poly(x,4,1))))
    return {'seconds':round(len(x)/sr,4),'sampleRate':int(sr),'activeRmsDb':round(20*np.log10(max(rms,1e-10)),3),'peakDb':round(20*np.log10(max(pk,1e-10)),3),'truePeakDb':round(20*np.log10(max(tp,1e-10)),3),'leadSeconds':round(float(idx[0]*.01),3),'tailSeconds':round(float((len(fr)-1-idx[-1])*.01),3),'clippedSamples':int(np.count_nonzero(abs(x)>=.999))}

def master(x):
    # Preserve quiet consonants with 120ms context; do not cut within speech.
    audible=np.flatnonzero(abs(x)>.0004)
    if not len(audible):raise ValueError('No audible synthesis')
    lo=max(0,int(audible[0])-2880);hi=min(len(x),int(audible[-1])+3600)
    x=x[lo:hi].copy();x-=float(np.mean(x))
    measure=metrics(x,24000);gain=10**((-16.5-measure['activeRmsDb'])/20)
    peak=float(np.max(abs(resample_poly(x,4,1))));gain=min(gain,10**(-3.2/20)/max(peak,1e-8),4.0)
    x*=gain
    fade=min(144,len(x)//10);ramp=np.linspace(0,1,fade,dtype=np.float32);x[:fade]*=ramp;x[-fade:]*=ramp[::-1]
    return np.pad(x,(1920,3600)).astype('float32')

rows=[];started=time.time()
for j,oldname in enumerate(jobs,1):
    original,sr=sf.read(src/oldname,dtype='float32');before=metrics(original,sr)
    assert hashlib.sha256((src/oldname).read_bytes()).hexdigest()==old_index[oldname]['sha256']
    reading,spoken=target(oldname);phones,direct,candidate=forced_phones(spoken)
    oldphones=pipe.g2p(old_index[oldname].get('spokenText',old_index[oldname]['reading'])+'。')[0]
    # Deterministic generation; the phoneme string is validated, never truncated.
    torch.manual_seed(int(hashlib.sha256(phones.encode()).hexdigest()[:8],16))
    with torch.inference_mode():chunks=[r.audio.detach().cpu().numpy() for r in pipe.generate_from_tokens(phones,voice='jf_alpha',speed=.94) if r.audio is not None]
    assert chunks,('Empty synthesis',reading)
    x=master(np.concatenate(chunks).astype('float32'));name=new_names[oldname]
    wav=out/(name+'.wav');sf.write(wav,x,24000,subtype='PCM_16')
    subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-i',str(wav),'-ac','1','-ar','24000','-c:a','libopus','-b:a','64k','-application','audio','-vbr','on',str(out/'audio'/name)],check=True);wav.unlink()
    decoded,sr=sf.read(out/'audio'/name,dtype='float32');after=metrics(decoded,sr)
    assert sr==24000 and after['clippedSamples']==0 and after['truePeakDb']<-.5
    assert .15<after['seconds']<15 and after['leadSeconds']>=.055 and after['tailSeconds']>=.085
    rows.append({'file':name,'oldFile':oldname,'ids':ids_by_file[oldname],'reading':reading,'spokenText':spoken,'oldReading':old_index[oldname]['reading'],'phonemes':phones,'directReadingPhonemes':direct,'katakanaFrontendPhonemes':candidate,'oldPhonemes':oldphones,'frontendChanged':sound_key(oldphones)!=sound_key(phones),'before':before,'after':after,'seconds':after['seconds'],'peak':round(float(np.max(abs(decoded))),6),'sha256':hashlib.sha256((out/'audio'/name).read_bytes()).hexdigest()})
    if j%50==0:
        (out/f'audit-{a.shard}.json').write_text(json.dumps({'shard':a.shard,'records':rows,'complete':False},ensure_ascii=False));print('synthesized',a.shard,j,len(jobs),round(time.time()-started),flush=True)
# ASR screens recordings in short, silence-separated blocks. Target/reference text
# is not passed as a prompt, hotword or constraint. Timestamp grouping is fallible.
asr=WhisperModel('small',device='cpu',compute_type='int8',cpu_threads=2,num_workers=1)
def recognized_key(text):
    reading=re.sub('[^ぁ-ゖー]','',hira(''.join(t['hira'] for t in kks.convert(text))))
    if not reading:return ''
    return sound_key(cutlet._romaji_word(Word(surface=reading,hira=reading,char_type=6)))
def recognize_block(block,phase):
    audio=[];windows=[];cursor=0;silence=np.zeros(6400,dtype='float32')
    for r in block:
        path=src/r['oldFile'] if phase=='before' else out/'audio'/r['file'];x,sr=sf.read(path,dtype='float32')
        x=resample_poly(x,2,3).astype('float32') if sr==24000 else resample_poly(x,16000,sr).astype('float32')
        windows.append((cursor/16000,(cursor+len(x))/16000));audio += [x,silence];cursor+=len(x)+len(silence)
    combined=np.concatenate(audio)
    segments,_=asr.transcribe(combined,language='ja',beam_size=3,temperature=0,condition_on_previous_text=False,vad_filter=False,initial_prompt=None,word_timestamps=True,no_speech_threshold=.9)
    hypotheses=['' for _ in block]
    for segment in segments:
        for word in segment.words or []:
            overlaps=[max(0,min(word.end,end)-max(word.start,start)) for start,end in windows]
            index=max(range(len(overlaps)),key=lambda i:overlaps[i])
            if overlaps[index]>.005:hypotheses[index]+=word.word
    for r,hypothesis in zip(block,hypotheses):
        expected=sound_key(r['directReadingPhonemes']);actual=recognized_key(hypothesis)
        r['asr'+phase.title()]={'text':hypothesis.strip(),'phoneticMatch':bool(actual and actual==expected),'recognizedPhonemes':actual,'referencePhonemes':expected}
for start in range(0,len(rows),10):
    block=rows[start:start+10];recognize_block(block,'before');recognize_block(block,'after')
    if start%100==0:print('ASR screened',a.shard,start,len(rows),round(time.time()-started),flush=True)
for r in rows:r['pronunciationReviewRequired']=not r['asrAfter']['phoneticMatch']
summary={'shard':a.shard,'complete':True,'files':len(rows),'oldDecoded':len(rows),'newDecoded':len(rows),'beforeAsrMatches':sum(r['asrBefore']['phoneticMatch'] for r in rows),'afterAsrMatches':sum(r['asrAfter']['phoneticMatch'] for r in rows),'frontendChanged':sum(r['frontendChanged'] for r in rows),'pronunciationReviewRequired':sum(r['pronunciationReviewRequired'] for r in rows),'notes':'Independent ASR screening is not a human pronunciation or pitch-accent certification. All disagreements are retained.'}
(out/f'audit-{a.shard}.json').write_text(json.dumps({'summary':summary,'records':rows},ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False),flush=True)
