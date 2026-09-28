"""Build-time candidate collection only. Does not publish or alter app packs.
Source: EDRDG JMdict example edition; example sentences originate in Tatoeba.
Retains per-sentence IDs, surfaces, and licenses for editorial review.
"""
from pathlib import Path
import gzip, hashlib, json, re, urllib.request, xml.etree.ElementTree as ET
OUT=Path('/tmp/kotoba038-content');OUT.mkdir(parents=True,exist_ok=True)
words=[w for level in ['N5','N4','N3','N2','N1'] for w in json.loads(Path(f'jlpt-quest/data/{level}.json').read_text())['words']]
lookup={}
for w in words:lookup.setdefault(w['word'],[]).append(w)
original=json.loads(Path('jlpt-quest/data/examples.json').read_text())
covered={t for e in original['entries'] for t in e['targets']}
url='https://ftp.edrdg.org/pub/Nihongo/JMdict_e_examp.gz'
req=urllib.request.Request(url,headers={'User-Agent':'Kotoba-content-editorial/0.3.8 (open-source vocabulary app)'})
raw=urllib.request.urlopen(req,timeout=120).read()
assert raw[:2]==b'\x1f\x8b', 'Expected compressed JMdict example edition'
print('Downloaded',len(raw),'bytes',flush=True)
xml=gzip.decompress(raw)
candidates={}
lang='{http://www.w3.org/XML/1998/namespace}lang'
from io import BytesIO
for event,entry in ET.iterparse(BytesIO(xml),events=['end']):
 if entry.tag!='entry':continue
 keys=[x.text for x in entry.findall('k_ele/keb')]+[x.text for x in entry.findall('r_ele/reb')]
 readings={x.text for x in entry.findall('r_ele/reb')}
 matched=[w for key in keys for w in lookup.get(key,[]) if w['reading'] in readings]
 if matched:
  for sense in entry.findall('sense'):
   gloss=[x.text for x in sense.findall('gloss') if x.text]
   for example in sense.findall('example'):
    sentences={x.get(lang):x.text for x in example.findall('ex_sent')}
    ja=sentences.get('jpn','');en=sentences.get('eng','');surface=example.findtext('ex_text','');sid=example.findtext('ex_srce','')
    if not (10<=len(ja)<=75 and 6<=len(en)<=180 and surface and surface in ja):continue
    if re.search(r'\b(fuck|rape|sex|suicide|nigger|bitch|porn)\b',en,re.I):continue
    e={'id':'tatoeba-'+sid,'ja':ja,'en':en,'surface':surface,'sourceId':sid,'source':'Tatoeba via EDRDG JMdict examples','license':'CC BY 2.0 FR (sentences); CC BY-SA 4.0 (dictionary linkage)','dictionaryEntry':entry.findtext('ent_seq'),'gloss':gloss,'review':'indexed usage; Korean translation not yet prepared'}
    for w in matched:
     # Prefer exact dictionary spelling, short but complete context, and overlapping gloss.
     wanted=set(re.findall(r'[a-z]{3,}', ' '.join(w.get('sourceMeanings',[])).lower()))
     available=set(re.findall(r'[a-z]{3,}', ' '.join(gloss).lower()))
     score=(0 if not wanted or wanted&available else 60)+(0 if w['word'] in ja else 8)+abs(len(ja)-26)+len(en)/30
     candidates.setdefault(w['id'],[]).append((score,e))
 entry.clear()
result=[]
for w in words:
 choices=sorted(candidates.get(w['id'],[]),key=lambda x:x[0]);unique=[];seen=set()
 for _,e in choices:
  if e['ja'] in seen:continue
  seen.add(e['ja']);unique.append(e)
  if len(unique)==3:break
 result.append({'word':w,'originalCovered':w['word'] in covered,'candidates':unique})
missing=[x['word'] for x in result if not x['originalCovered'] and not x['candidates']]
report={'source':url,'sha256':hashlib.sha256(raw).hexdigest(),'total':len(words),'originalCovered':sum(w['word'] in covered for w in words),'indexedCovered':sum(bool(x['candidates']) for x in result),'missingCount':len(missing),'missingByLevel':{l:sum(w['level']==l for w in missing) for l in ['N5','N4','N3','N2','N1']}}
(OUT/'candidates.json').write_text(json.dumps(result,ensure_ascii=False))
(OUT/'missing.json').write_text(json.dumps(missing,ensure_ascii=False,indent=2))
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
