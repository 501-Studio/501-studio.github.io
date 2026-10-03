#!/usr/bin/env python3
"""Build the APK-local KanjiVG subset. No runtime downloads. Derived data: CC BY-SA 3.0."""
import argparse,hashlib,io,json,math,re,subprocess,urllib.request,zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
REV='422b5538595676da918c288a4230cb5e22a1ee7e'
ARCHIVE_SHA='ac165db15581cfd40f1ac774d23743f61ce1c48e50ce57681f39575607ee9626'
def sample(d):
    tokens=re.findall(r'[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?',d)
    i=0;cmd=None;p=(0.,0.);start=p;ctrl=None;previous='';points=[]
    def add(q):
        nonlocal p
        p=q;points.append([round(q[0]/109,5),round(q[1]/109,5)])
    while i<len(tokens):
        if tokens[i].isalpha():cmd=tokens[i];i+=1
        if cmd is None:raise ValueError('Malformed SVG')
        upper=cmd.upper();relative=cmd.islower();sizes={'M':2,'L':2,'H':1,'V':1,'C':6,'S':4,'Q':4,'T':2,'Z':0}
        if upper not in sizes:raise ValueError('Unsupported SVG command '+cmd)
        n=sizes[upper]
        if upper=='Z':add(start);cmd=None;previous='Z';continue
        values=list(map(float,tokens[i:i+n]));i+=n
        if len(values)!=n:raise ValueError('Incomplete SVG')
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
def distance(p,a,b):
    dx=b[0]-a[0];dy=b[1]-a[1];den=dx*dx+dy*dy
    t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)) if den else 0
    return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
def simplify(line):
    if len(line)<3:return line
    pairs=[(distance(line[i],line[0],line[-1]),i) for i in range(1,len(line)-1)]
    value,index=max(pairs)
    if value<=.0012:return [line[0],line[-1]]
    return simplify(line[:index+1])[:-1]+simplify(line[index:])
def download(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Kotoba-stroke-pack/0.3.2'}),timeout=120) as r:return r.read(100_000_000)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--from-pack');args=parser.parse_args()
    # Reuse the exact JavaScript curriculum target rule, including Unicode Han iteration marks.
    code="import fs from 'node:fs';import {writingChars} from './src/catalog.js';const words=['N5','N4','N3','N2','N1'].flatMap(l=>JSON.parse(fs.readFileSync('data/'+l+'.json')).words);console.log(JSON.stringify([...new Set(words.flatMap(writingChars))].sort()));"
    required=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=ROOT,text=True))
    licenses=ROOT/'data/licenses';licenses.mkdir(exist_ok=True,parents=True)
    if args.from_pack:
        source=json.loads(Path(args.from_pack).read_text());assert source['meta']['commit']==REV;bank=source['chars']
    else:
        raw=download(f'https://codeload.github.com/KanjiVG/kanjivg/zip/{REV}')
        if hashlib.sha256(raw).hexdigest()!=ARCHIVE_SHA:raise ValueError('Pinned KanjiVG archive checksum mismatch')
        z=zipfile.ZipFile(io.BytesIO(raw));bank={};needed=set(required)
        for name in z.namelist():
            m=re.search(r'/kanji/([0-9a-f]{5})\.svg$',name)
            if not m or chr(int(m.group(1),16)) not in needed:continue
            char=chr(int(m.group(1),16));tree=ET.fromstring(z.read(name))
            paths=[(int(re.search(r'-s(\d+)$',el.attrib['id']).group(1)),sample(el.attrib['d'])) for el in tree.iter('{http://www.w3.org/2000/svg}path') if re.search(r'-s\d+$',el.attrib.get('id',''))]
            bank[char]=[p for _,p in sorted(paths)]
        copy=next(n for n in z.namelist() if n.endswith('/COPYING') and n.count('/')==1)
        (licenses/'KanjiVG-COPYING.txt').write_bytes(z.read(copy))
    missing=[c for c in required if c not in bank]
    if missing:raise ValueError('Missing handwriting targets: '+''.join(missing))
    chars={c:[[[round(x,4),round(y,4)] for x,y in simplify(path)] for path in bank[c]] for c in required}
    for c,paths in chars.items():
        if not paths or any(len(p)<2 for p in paths):raise ValueError('Invalid path '+c)
    pack={'version':1,'source':'KanjiVG','sourceCommit':REV,'license':'CC-BY-SA-3.0','archiveSha256':ARCHIVE_SHA,'characters':chars}
    text=json.dumps(pack,ensure_ascii=False,separators=(',',':'));(ROOT/'data/strokes.json').write_text(text,encoding='utf-8')
    report={'version':'0.3.2','characters':len(chars),'strokes':sum(map(len,chars.values())),'missing':missing,'bytes':len(text.encode()),'sha256':hashlib.sha256(text.encode()).hexdigest(),'mode':'apk-local-stroke-snap','sourceCommit':REV}
    (ROOT/'data/stroke-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
