"""Fix malformed pronunciation readings found by the 0.3.8 full audio audit.
Only the three source-reading defects discovered across all 8,451 vocabulary entries
are changed. This runs before audio synthesis and before the APK asset sync.
"""
from pathlib import Path
import json

root=Path('jlpt-quest/data')
changes={
    'N5-cgfly3':('十','じゅう','じゅう とお'),
    'N3-1b97nrt':('とん','とん','(1000'),
    'N3-1d6ofkx':('賛成','さんせい','Uӣ[い'),
}
seen=set()
for level in ['N5','N4','N3','N2','N1']:
    path=root/f'{level}.json'
    pack=json.loads(path.read_text(encoding='utf-8'))
    for w in pack['words']:
        if w['id'] not in changes:continue
        word,new,old=changes[w['id']]
        assert w['word']==word,(w['id'],w['word'],word)
        assert w.get('reading') in {old,new},(w['id'],w.get('reading'))
        w['reading']=new
        w['pronunciationRevision']='038-audit-1'
        seen.add(w['id'])
    path.write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
assert seen==set(changes),(seen,set(changes)-seen)
print('Corrected pronunciation readings:',sorted(seen))
