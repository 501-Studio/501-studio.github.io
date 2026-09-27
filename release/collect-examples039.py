"""Select compact neutral Japanese examples; no runtime downloading.
Uses the existing pinned OpenJLPT candidate list, then resolves actual Tatoeba
sentence IDs/authors from the official export. Missing attribution is not guessed.
"""
from pathlib import Path
import bz2,csv,hashlib,io,json,re,unicodedata,urllib.request
import fugashi
OUT=Path('/tmp/examples039');OUT.mkdir(exist_ok=True)
ROOT=Path('jlpt-quest/data');REV='c42fd9fa3777bfc1775446f7c418d549dfd6e4cf'
tag=fugashi.Tagger()
def norm(t):
 return unicodedata.normalize('NFKC',str(t)).strip()
def hira(t):return ''.join(chr(ord(c)-96) if '\u30a1'<=c<='\u30f6' else c for c in norm(t))
def canon(t):
 parts=[re.sub(r'\([^)]*\)|（[^）]*）','',x).strip() for x in re.split(r'[/／;,、]',norm(t))];parts=[x for x in parts if x]
 return next((x for x in parts if re.search('[一-龯]',x)),parts[0] if parts else '')
def tokens(t):
 return [(x.surface,x.feature.lemma.split('-')[0],hira(x.feature.kana),hira(x.feature.kanaBase)) for x in tag(t)]
def matching(w,ja):
 ts=tokens(ja);form=w['word'];reading=hira(w['reading'])
 # Whole multi-character headword is allowed; single characters require a token.
 if len(form)>1 and form in ja:return True
 return any((form in (surface,lemma) and (reading in (kana,base) or not reading)) for surface,lemma,kana,base in ts)
ban=re.compile(r'kill|murder|suicid|sex|porn|rape|fuck|shit|hell|damn|gun|bomb|drug|naked|blood|die|death|war|hate|fool|idiot|God|christ',re.I)
rows=[];missing=[];own=json.loads((ROOT/'examples.json').read_text())['entries'];byown={}
for e in own:
 for t in e['targets']:byown.setdefault(t,[]).append(e)
for level in ['N5','N4','N3','N2','N1']:
 url=f'https://raw.githubusercontent.com/evanclan/OpenJLPT/{REV}/data/json/vocab/{level.lower()}.json'
 raw=urllib.request.urlopen(url,timeout=40).read();(OUT/f'raw-{level}.json').write_bytes(raw)
 candidates=json.loads(raw);indexed={}
 for r in candidates:indexed.setdefault(canon(r['word']),[]).append(r)
 words=json.loads((ROOT/f'{level}.json').read_text())['words']
 for w in words:
  if w['word'] in byown:
   e=min(byown[w['word']],key=lambda x:len(x['ja']));rows.append({'word':w,'entry':e,'origin':'original'});continue
  choices=[]
  for r in indexed.get(w['word'],[]):
   for e in r.get('examples',[]):
    ja=e.get('ja','').strip();en=e.get('en','').strip()
    if 5<=len(ja)<=54 and 3<=len(en)<=140 and not ban.search(en) and matching(w,ja):choices.append(e)
  if choices:
   e=min(choices,key=lambda x:len(x['ja'])+len(x['en'])/8)
   rows.append({'word':w,'entry':e,'origin':'openjlpt-tatoeba-candidate','provenance':{'openjlptRevision':REV,'datasetLicense':'CC-BY-SA-4.0','sentenceLicense':'CC-BY-2.0-FR'}})
  else:missing.append(w)
# Retain actual author, ID, URL and modification date; no fabricated attribution.
texts={r['entry']['ja'] for r in rows if r['origin']!='original'};matched={};download_errors=[]
url='https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences_detailed.tsv.bz2'
try:
 b=urllib.request.urlopen(url,timeout=60).read();(OUT/'source-export.sha256').write_text(hashlib.sha256(b).hexdigest())
 for line in bz2.decompress(b).decode('utf-8').splitlines():
  f=line.split('\t')
  if len(f)>=6 and f[2] in texts and f[3] not in ('','\\N'):
   matched[f[2]]={'sentenceId':int(f[0]),'author':f[3],'modified':f[5],'url':'https://tatoeba.org/en/sentences/show/'+f[0],'license':'CC-BY-2.0-FR'}
except Exception as exc:download_errors.append(str(exc))
for r in rows:
 if r['origin']!='original':r['provenance']['japanese']=matched.get(r['entry']['ja'])
(OUT/'candidates.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
(OUT/'missing.json').write_text(json.dumps(missing,ensure_ascii=False,indent=2))
summary={'words':len(rows)+len(missing),'selected':len(rows),'original':sum(r['origin']=='original' for r in rows),'attributed':len(matched),'missing':len(missing),'downloadErrors':download_errors,'safeForProduction':False}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(json.dumps(summary,ensure_ascii=False,indent=2))
