#!/usr/bin/env python3
"""Pinned offline vocabulary and KanjiVG stroke build; no unreviewed examples.
Dictionary output CC BY-SA 4.0; transformed KanjiVG strokes CC BY-SA 3.0.
"""
import argparse,hashlib,io,json,re,urllib.request,zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
SOURCE='c42fd9fa3777bfc1775446f7c418d549dfd6e4cf'
KVG='422b5538595676da918c288a4230cb5e22a1ee7e'
COUNTS={'N5':662,'N4':632,'N3':1784,'N2':1793,'N1':3463}
def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Kotoba-content-builder/0.3'})
    with urllib.request.urlopen(req,timeout=120) as response:
        data=response.read(80*1024*1024)
        if not data: raise ValueError('Empty source: '+url)
        return data

def sample_path(d):
    tokens=re.findall(r'[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?',d)
    i=0;cmd=None;p=(0.,0.);start=p;ctrl=None;previous='';points=[]
    def add(q):
        nonlocal p
        p=q;points.append([round(q[0]/109,5),round(q[1]/109,5)])
    while i<len(tokens):
        if tokens[i].isalpha():cmd=tokens[i];i+=1
        if cmd is None:raise ValueError('Malformed SVG path')
        upper=cmd.upper();relative=cmd.islower();sizes={'M':2,'L':2,'H':1,'V':1,'C':6,'S':4,'Q':4,'T':2,'Z':0}
        if upper not in sizes:raise ValueError('Unsupported SVG command '+cmd)
        n=sizes[upper]
        if upper=='Z':add(start);cmd=None;previous='Z';continue
        values=list(map(float,tokens[i:i+n]));i+=n
        if len(values)!=n:raise ValueError('Incomplete path')
        origin=p
        def q(a,b):return (a+origin[0],b+origin[1]) if relative else (a,b)
        if upper in ('M','L'):
            target=q(*values);add(target)
            if upper=='M':start=target;cmd='l' if relative else 'L'
            ctrl=None
        elif upper=='H':add((origin[0]+values[0] if relative else values[0],origin[1]));ctrl=None
        elif upper=='V':add((origin[0],origin[1]+values[0] if relative else values[0]));ctrl=None
        elif upper in ('C','S'):
            if upper=='C':c1=q(values[0],values[1]);c2=q(values[2],values[3]);target=q(values[4],values[5])
            else:c1=(2*origin[0]-ctrl[0],2*origin[1]-ctrl[1]) if ctrl and previous in ('C','S') else origin;c2=q(values[0],values[1]);target=q(values[2],values[3])
            for step in range(1,17):
                t=step/16;v=1-t;add(tuple(v**3*origin[k]+3*v*v*t*c1[k]+3*v*t*t*c2[k]+t**3*target[k] for k in (0,1)))
            ctrl=c2
        else:
            if upper=='Q':c1=q(values[0],values[1]);target=q(values[2],values[3])
            else:c1=(2*origin[0]-ctrl[0],2*origin[1]-ctrl[1]) if ctrl and previous in ('Q','T') else origin;target=q(values[0],values[1])
            for step in range(1,17):
                t=step/16;v=1-t;add(tuple(v*v*origin[k]+2*v*t*c1[k]+t*t*target[k] for k in (0,1)))
            ctrl=c1
        previous=upper
    return [[max(0,min(1,x)),max(0,min(1,y))] for x,y in points]

def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    text=json.dumps(data,ensure_ascii=False,separators=(',',':'))
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(text,encoding='utf-8');temp.replace(path)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--skip-strokes',action='store_true');args=parser.parse_args()
    words=[];hashes={};source_counts={}
    for level,count in COUNTS.items():
        url=f'https://raw.githubusercontent.com/evanclan/OpenJLPT/{SOURCE}/data/json/vocab/{level.lower()}.json'
        data=get(url);raw=json.loads(data)
        if not isinstance(raw,list) or len(raw)!=count:raise ValueError(f'{level}: unexpected number of entries')
        hashes[level]=hashlib.sha256(data).hexdigest();source_counts[level]=len(raw)
        for item in raw:
            if not isinstance(item.get('word'),str) or not isinstance(item.get('meanings'),list):raise ValueError('Malformed source word')
            words.append({'word':item['word'],'reading':item.get('reading',''),'meanings':item['meanings'],'level':level})
    meta={'version':1,'complete':True,'source':'OpenJLPT + 자체 편집 교정','sourceCommit':SOURCE,'sourceCounts':source_counts,'sourceTotal':len(words),'sourceSha256':hashes,'license':'CC-BY-SA-4.0','examplesImported':False}
    write(ROOT/'web/data/curriculum.json',{'meta':meta,'words':words})
    licenses=ROOT/'web/data/licenses';licenses.mkdir(parents=True,exist_ok=True)
    (licenses/'OpenJLPT-NOTICE.md').write_bytes(get(f'https://raw.githubusercontent.com/evanclan/OpenJLPT/{SOURCE}/NOTICE.md'))
    if not args.skip_strokes:
        archive=get(f'https://codeload.github.com/KanjiVG/kanjivg/zip/{KVG}');z=zipfile.ZipFile(io.BytesIO(archive));chars={};errors=[]
        for name in z.namelist():
            match=re.search(r'/kanji/([0-9a-f]{5})\.svg$',name)
            if not match:continue
            character=chr(int(match.group(1),16))
            try:
                root=ET.fromstring(z.read(name));paths=[sample_path(el.attrib['d']) for el in root.iter('{http://www.w3.org/2000/svg}path') if re.search(r'-s\d+$',el.attrib.get('id',''))]
                if paths and all(paths):chars[character]=paths
            except Exception as error:errors.append([character,str(error)])
        if len(chars)<6000:raise ValueError(f'Incomplete KanjiVG bank: {len(chars)} chars')
        write(ROOT/'web/data/strokes.json',{'meta':{'complete':True,'source':'KanjiVG','commit':KVG,'license':'CC-BY-SA-3.0','count':len(chars),'archiveSha256':hashlib.sha256(archive).hexdigest(),'parseErrors':errors},'chars':chars})
        (licenses/'KanjiVG-COPYING.txt').write_bytes(get(f'https://raw.githubusercontent.com/KanjiVG/kanjivg/{KVG}/COPYING'))
    print(json.dumps({'sourceCounts':source_counts,'sourceTotal':len(words),'complete':True},ensure_ascii=False))
if __name__=='__main__':main()
