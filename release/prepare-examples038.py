"""Complete draft corpus, not a claim of full linguistic approval.
Direct translation timed out after 4896 records. Use the complete OPUS base and
only structurally valid direct alternatives; preserve actual per-entry provenance.
"""
from pathlib import Path
from collections import Counter
import json,re
B=Path('/tmp/kotoba038-pivot');D=Path('/tmp/kotoba038-partial');O=Path('/tmp/kotoba038-direct');O.mkdir(exist_ok=True)
base=json.loads((B/'examples-corpus.json').read_text());partial=json.loads((D/'examples-corpus.json').read_text())
assert len(base['entries'])==6026
byid={e['id']:e for e in base['entries']};direct={e['id']:e for e in partial['entries'] if e.get('translationModel')=='facebook/m2m100_1.2B'}
assert len(direct)==4896
for eid,e in direct.items():assert eid in byid and e['ja']==byid[eid]['ja'] and e['wordIds']==byid[eid]['wordIds']
words={w['id']:w for l in ['N5','N4','N3','N2','N1'] for w in json.loads(Path(f'jlpt-quest/data/{l}.json').read_text())['words']}
def valid(s):return bool(re.search('[가-힣]',s)) and '<unk>' not in s and len(s)<=220
def score(e,s):
 anchors=set()
 for wid in e['wordIds']:
  for t in re.findall('[가-힣]{2,}',words[wid]['meaning']):
   t=re.sub('(하다|되다|이다|다)$','',t)
   if len(t)>=2 and t not in {'그리고','또는','대한','어떤','있는','않은','모든','없이','같은','보다','위한','위해'}:anchors.add(t)
 return sum(min(len(a),3) for a in anchors if a in s)-(len(re.findall('[A-Za-z]',s))>8)*2
patches=json.loads(Path('release/examples038/quality-patches.json').read_text());entries=[]
for e in base['entries']:
 d=direct.get(e['id']);chosen=dict(e)
 if d and valid(d['ko']) and (not valid(e['ko']) or score(e,d['ko'])>score(e,e['ko'])):chosen=dict(d)
 chosen.pop('koPivot',None);chosen['selectionMethod']='Target-gloss heuristic, OPUS default; NOT semantic verification'
 if e['id'] in patches:
  fix=patches[e['id']];assert fix['ja']==e['ja'],e['id'];chosen['ko']=fix['ko'];chosen['translationReview']='assistant-edited'
  if fix.get('replacementJa'):
   chosen['originalJa']=e['ja'];chosen['ja']=fix['replacementJa'];chosen['reading']=fix['reading'];chosen['readingReview']='assistant-authored';chosen['exampleReview']='assistant-adapted'
 assert valid(chosen['ko']),chosen['id'];entries.append(chosen)
base['entries']=entries;base['model']='mixed-build-drafts';base['revision']='038-complete-base-plus-4896-direct-checkpoint';base['translation']='Machine drafts, hidden by default; independent linguistic review pending'
report={'entries':len(entries),'wordIds':sum(len(e['wordIds']) for e in entries),'invalidIds':[],'model':base['model'],'revision':base['revision'],'selectedModelCounts':dict(Counter(e['translationModel'] for e in entries)),'availableDirectTranslations':len(direct),'directJobCompleted':False,'independentNativeReview':False,'selection':'Target-gloss heuristic, OPUS default; not semantic verification'}
(O/'examples-corpus.json').write_text(json.dumps(base,ensure_ascii=False,separators=(',',':')))
(O/'translation-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
