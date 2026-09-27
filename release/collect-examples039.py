"""Inspect compact licensed candidates; preserve real attribution, never guess it."""
from pathlib import Path
import bz2,hashlib,json,re,unicodedata,urllib.request
import fugashi
OUT=Path('/tmp/examples039');OUT.mkdir(exist_ok=True)
ROOT=Path('jlpt-quest/data');REV='c42fd9fa3777bfc1775446f7c418d549dfd6e4cf';tag=fugashi.Tagger()
def norm(t):return unicodedata.normalize('NFKC',str(t or '')).strip()
def hira(t):return ''.join(chr(ord(c)-96) if '\u30a1'<=c<='\u30f6' else c for c in norm(t))
def canon(t):
 p=[re.sub(r'\([^)]*\)|（[^）]*）','',x).strip() for x in re.split(r'[/／;,、]',norm(t))];p=[x for x in p if x]
 return next((x for x in p if re.search('[一-龯]',x)),p[0] if p else '')
def matching(w,ja):
 form=w['word'];reading=hira(w['reading'])
 if len(form)>1 and form in ja:return True
 for x in tag(ja):
  f=x.feature;lemma=(f.lemma or x.surface).split('-')[0]
  if form in (x.surface,lemma) and (reading in (hira(f.kana),hira(f.kanaBase)) or not reading):return True
 return False
ban=re.compile(r'\b(?:kill|murder|suicide|sex|porn|rape|fuck|shit|hell|damn|gun|bomb|drug|naked|blood|die|death|war|hate|fool|idiot|God|christ)\b',re.I)
rows=[];missing=[];own=json.loads((ROOT/'examples.json').read_text())['entries'];byown={}
for e in own:
 for t in e['targets']:byown.setdefault(t,[]).append(e)
for level in ['N5','N4','N3','N2','N1']:
 raw=urllib.request.urlopen(f'https://raw.githubusercontent.com/evanclan/OpenJLPT/{REV}/data/json/vocab/{level.lower()}.json',timeout=40).read();(OUT/f'raw-{level}.json').write_bytes(raw)
 indexed={}
 for r in json.loads(raw):indexed.setdefault(canon(r['word']),[]).append(r)
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
   e=min(choices,key=lambda x:len(x['ja'])+len(x['en'])/8);rows.append({'word':w,'entry':e,'origin':'openjlpt-tatoeba-candidate','provenance':{'openjlptRevision':REV,'datasetLicense':'CC-BY-SA-4.0','sentenceLicense':'CC-BY-2.0-FR'}})
  else:missing.append(w)
texts={r['entry']['ja'] for r in rows if r['origin']!='original'};matched={};download_errors=[]
url='https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences_detailed.tsv.bz2'
try:
 b=urllib.request.urlopen(url,timeout=60).read();(OUT/'source-export.sha256').write_text(hashlib.sha256(b).hexdigest())
 for line in bz2.decompress(b).decode('utf-8').splitlines():
  f=line.split('\t')
  if len(f)>=6 and f[2] in texts and f[3] not in ('','\\N'):matched[f[2]]={'sentenceId':int(f[0]),'author':f[3],'modified':f[5],'url':'https://tatoeba.org/en/sentences/show/'+f[0],'license':'CC-BY-2.0-FR'}
except Exception as exc:download_errors.append(str(exc))
for r in rows:
 if r['origin']!='original':r['provenance']['japanese']=matched.get(r['entry']['ja'])
(OUT/'candidates.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2));(OUT/'missing.json').write_text(json.dumps(missing,ensure_ascii=False,indent=2))
summary={'words':len(rows)+len(missing),'selected':len(rows),'original':sum(r['origin']=='original' for r in rows),'attributed':len(matched),'missing':len(missing),'downloadErrors':download_errors,'safeForProduction':False}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(json.dumps(summary,ensure_ascii=False,indent=2))
