#!/usr/bin/env python3
"""Build APK-local Japanese pronunciation audio with Open JTalk + NIT ATR503 M001.

The installed app never synthesizes or downloads speech. CI/build machines generate
Ogg Opus files from the bundled curriculum. The HTS voice is CC BY 3.0; attribution
is bundled in licenses.html and CONTENT-LICENSE.md.
"""
from __future__ import annotations
import concurrent.futures, hashlib, json, os, shutil, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
OUT=DATA/'audio'
MANIFEST=DATA/'audio-manifest.json'
LEVELS=['N5','N4','N3','N2','N1']

def find_one(patterns):
    for pattern in patterns:
        matches=list(Path('/').glob(pattern.lstrip('/')))
        if matches:return matches[0]
    return None

def locate():
    exe=shutil.which('open_jtalk')
    ffmpeg=shutil.which('ffmpeg')
    voice=find_one([
        '/usr/share/hts-voice/nitech-jp-atr503-m001/**/*.htsvoice',
        '/usr/share/hts-voice/**/*.htsvoice',
        '/usr/share/**/*.htsvoice',
    ])
    dictionaries=[
        Path('/var/lib/mecab/dic/open-jtalk/naist-jdic'),
        Path('/usr/share/open-jtalk/naist-jdic'),
        Path('/usr/share/open_jtalk/naist-jdic'),
    ]
    dic=next((p for p in dictionaries if p.exists()),None)
    if not exe or not ffmpeg or not voice or not dic:
        raise SystemExit(f'Offline audio tools missing: open_jtalk={exe}, ffmpeg={ffmpeg}, voice={voice}, dic={dic}')
    return exe,ffmpeg,str(voice),str(dic)

def load_words():
    words=[]
    for level in LEVELS:
        pack=json.loads((DATA/f'{level}.json').read_text(encoding='utf-8'))
        words.extend(pack['words'])
    return words

def key(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:24]

def synth(job):
    reading,file_name,exe,ffmpeg,voice,dic,tmpdir=job
    target=OUT/file_name
    if target.exists() and target.stat().st_size>500:
        return file_name,target.stat().st_size
    wav=Path(tmpdir)/(file_name+'.wav')
    try:
        p=subprocess.run([exe,'-x',dic,'-m',voice,'-ow',str(wav)],input=reading+'\n',text=True,
                         stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=30)
        if p.returncode or not wav.exists() or wav.stat().st_size<1000:
            raise RuntimeError((p.stderr or 'Open JTalk synthesis failed')[-800:])
        q=subprocess.run([
            ffmpeg,'-nostdin','-hide_banner','-loglevel','error','-y','-i',str(wav),
            '-af','silenceremove=start_periods=1:start_duration=0.03:start_threshold=-50dB:stop_periods=1:stop_duration=0.05:stop_threshold=-50dB',
            '-ac','1','-ar','16000','-c:a','libopus','-b:a','18k','-vbr','on','-application','voip',str(target)
        ],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=30)
        if q.returncode or not target.exists() or target.stat().st_size<300:
            raise RuntimeError((q.stderr or 'Opus encoding failed')[-800:])
        return file_name,target.stat().st_size
    finally:
        wav.unlink(missing_ok=True)

def main():
    exe,ffmpeg,voice,dic=locate()
    words=load_words()
    OUT.mkdir(parents=True,exist_ok=True)
    readings={}
    mapping={}
    for w in words:
        text=(w.get('reading') or w.get('word') or '').strip()
        if not text:raise SystemExit(f"Missing pronunciation for {w.get('id')}")
        name=key(text)+'.ogg'
        readings[name]=text
        mapping[w['id']]=name
    tmp=tempfile.mkdtemp(prefix='kotoba-audio-')
    try:
        jobs=[(reading,name,exe,ffmpeg,voice,dic,tmp) for name,reading in readings.items()]
        workers=max(2,min(8,os.cpu_count() or 4))
        total_bytes=0
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            for i,(name,size) in enumerate(pool.map(synth,jobs),1):
                total_bytes+=size
                if i%500==0:print(f'audio {i}/{len(jobs)}')
    finally:
        shutil.rmtree(tmp,ignore_errors=True)
    files={p.name for p in OUT.glob('*.ogg')}
    expected=set(readings)
    if files!=expected:
        extra=files-expected
        missing=expected-files
        for name in extra:(OUT/name).unlink(missing_ok=True)
        if missing:raise SystemExit(f'Missing offline audio: {len(missing)} clips')
    manifest={
        'version':1,
        'complete':True,
        'words':len(mapping),
        'uniqueClips':len(readings),
        'format':'Ogg Opus mono 16 kHz ~18 kbps',
        'generator':'Open JTalk',
        'voice':'HTS Voice NIT ATR503 M001 1.05',
        'voiceLicense':'CC BY 3.0',
        'attribution':'Copyright (c) 2003-2012 Nagoya Institute of Technology; 2003-2008 Tokyo Institute of Technology',
        'clips':mapping,
    }
    MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    size=sum((OUT/n).stat().st_size for n in expected)
    report={'words':len(mapping),'uniqueClips':len(expected),'bytes':size,'mib':round(size/1024/1024,2),'complete':True}
    (DATA/'audio-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
