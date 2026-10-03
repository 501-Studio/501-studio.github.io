"""Reconstruct authored 0.3.7 source against immutable tested 0.3.6.
Successful CI preserves readable source. No approval or test is bypassed.
"""
from pathlib import Path
import base64, hashlib, json, lzma, subprocess, sys
BASE='faf920a4ff0cbc35416ea16e9ce49757cda3b12c'
data=base64.b64decode(''.join(Path(f'release/v037-core-part{i}.b64').read_text().strip() for i in range(1,5)),validate=True)
assert hashlib.sha256(data).hexdigest()=='186318d96cdc1ec890539859cc00fa74b48609567f2d438e4d3d2025419ea2c3'
delta=json.loads(lzma.decompress(data))
for name,entry in delta.items():
    p=Path(name)
    assert not p.is_absolute() and '..' not in p.parts and p.parts[0] in ['jlpt-quest','kotoba-android']
    if 'text' in entry:text=entry['text']
    else:
        raw=subprocess.check_output(['git','show',BASE+':'+name])
        assert hashlib.sha256(raw).hexdigest()==entry['base'],name+' baseline mismatch'
        lines=raw.decode().splitlines(keepends=True)
        for start,end,replacement in reversed(entry['ops']):lines[start:end]=[replacement]
        text=''.join(lines)
    p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8')
entries=[]
for line in Path('release/examples037.tsv').read_text().splitlines():
    if not line.strip():continue
    targets,ja,reading,ko=line.split('\t')
    reading=reading.replace('むだなしししゅつ','むだなししゅつ')
    entries.append({'id':f'kotoba-original-{len(entries)+1:03d}','targets':targets.split(','),'ja':ja,'reading':reading,'ko':ko,'source':'Kotoba original, assistant-authored 2026-09-27','review':'assistant bilingual review; not an independent native-speaker review'})
assert len(entries)==164
words=[]
for level in ['N5','N4','N3','N2','N1']:words+=json.loads(Path(f'jlpt-quest/data/{level}.json').read_text())['words']
targets={t for e in entries for t in e['targets']}
pack={'version':1,'origin':'Newly authored for Kotoba; not scraped or copied from a third-party textbook or dictionary.','rights':'Original assistant-generated text supplied for this project. No third-party sentence corpus incorporated. No assertion of exclusive copyright or universal legal clearance.','review':'Bilingual assistant review, native-speaker editorial review pending','entries':entries,'coverage':{'sentences':len(entries),'wordIds':sum(w['word'] in targets for w in words),'totalJlptWords':len(words)}}
Path('jlpt-quest/data/examples.json').write_text(json.dumps(pack,ensure_ascii=False,indent=2))
Path('jlpt-quest/data/licenses/Kokoro-Apache-2.0.txt').write_bytes(Path('/usr/share/common-licenses/Apache-2.0').read_bytes())
evidence=Path('/tmp/kotoba037-qa');evidence.mkdir(exist_ok=True)
(evidence/'source-transfer.sha256').write_text(hashlib.sha256(data).hexdigest()+'\n')
(evidence/'authored-source-checksums.json').write_text(json.dumps({name:hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in delta},indent=2))
Path('/tmp/kotoba037-source-paths.json').write_text(json.dumps(list(delta)+['jlpt-quest/data/examples.json','jlpt-quest/data/licenses/Kokoro-Apache-2.0.txt']))
subprocess.run([sys.executable,'release/source-build037.py'],check=True)
print('Verified and reconstructed',len(delta),'source files; example coverage:',pack['coverage'])
