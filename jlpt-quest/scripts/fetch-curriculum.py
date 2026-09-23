"""Pinned open vocabulary build. No example sentences imported."""
import hashlib,json,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
commit='c42fd9fa3777bfc1775446f7c418d549dfd6e4cf'
counts={'N5':662,'N4':632,'N3':1784,'N2':1793,'N1':3463}
words=[];hashes={}
for level,count in counts.items():
    url=f'https://raw.githubusercontent.com/evanclan/OpenJLPT/{commit}/data/json/vocab/{level.lower()}.json'
    with urllib.request.urlopen(url,timeout=90) as response: data=response.read()
    entries=json.loads(data)
    assert isinstance(entries,list) and len(entries)==count,(level,len(entries))
    hashes[level]=hashlib.sha256(data).hexdigest()
    for item in entries:
        assert isinstance(item['word'],str) and isinstance(item['meanings'],list)
        words.append({'word':item['word'],'reading':item.get('reading',''),'meanings':item['meanings'],'level':level})
out=root/'data';out.mkdir(parents=True,exist_ok=True)
pack={'meta':{'version':1,'complete':True,'source':'OpenJLPT','sourceCommit':commit,'sourceCounts':counts,'sourceTotal':len(words),'sourceSha256':hashes,'license':'CC-BY-SA-4.0','examplesImported':False},'words':words}
(out/'curriculum.json').write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
with urllib.request.urlopen(f'https://raw.githubusercontent.com/evanclan/OpenJLPT/{commit}/NOTICE.md',timeout=60) as response: notice=response.read()
(out/'OpenJLPT-NOTICE.md').write_bytes(notice)
summary={'sourceCounts':counts,'sourceTotal':len(words),'definitionsPresent':sum(bool(w['meanings']) for w in words),'missingReadings':sum(not w['reading'] for w in words),'sourceSha256':hashes}
(out/'content-build-report.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
