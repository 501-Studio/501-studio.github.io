"""Prepare sentence candidates with actual Tatoeba IDs/authors and headword indices.
No scraped commercial textbooks, no CC-BY-NC datasets, no inferred author names.
Unmatched vocabulary is exported for new editorial sentences, never filled by a
meaningless template or a sentence that just says 'this word means ...'.
"""
from pathlib import Path
import bz2,hashlib,json,re,tarfile,urllib.request,unicodedata,collections,io
import fugashi
ROOT=Path('jlpt-quest/data');OUT=Path('/tmp/examples039-extended');OUT.mkdir(exist_ok=True)
CACHE=Path('/tmp/tatoeba039');CACHE.mkdir(exist_ok=True)
tag=fugashi.Tagger();REV='c42fd9fa3777bfc1775446f7c418d549dfd6e4cf'
def hira(t):return ''.join(chr(ord(c)-96) if '\u30a1'<=c<='\u30f6' else c for c in unicodedata.normalize('NFKC',str(t or '')))
def norm(t):return unicodedata.normalize('NFKC',str(t or '')).strip()
def canonical(t):
 a=[re.sub(r'\([^)]*\)|（[^）]*）','',p).strip() for p in re.split(r'[/／;,、]',norm(t))];a=[p for p in a if p];return next((p for p in a if re.search('[一-龯]',p)),a[0] if a else '')
sources={}
def download(name,url):
 p=CACHE/name
 if not p.exists():p.write_bytes(urllib.request.urlopen(url,timeout=90).read())
 sources[name]={'url':url,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()};return p

def sentences(lang):
 p=download(lang+'.bz2',f'https://downloads.tatoeba.org/exports/per_language/{lang}/{lang}_sentences_detailed.tsv.bz2')
 out={}
 with bz2.open(p,'rt',encoding='utf-8') as f:
  for line in f:
   cols=line.rstrip('\n').split('\t')
   if len(cols)>=6 and cols[3] not in ('','\\N'):out[int(cols[0])]={'id':int(cols[0]),'text':cols[2],'author':cols[3],'modified':cols[5]}
 return out
jp=sentences('jpn');en=sentences('eng');ko=sentences('kor')
jatext={r['text']:r for r in jp.values()};entext={r['text']:r for r in en.values()}
words=[]
for level in ['N5','N4','N3','N2','N1']:words+=json.loads((ROOT/f'{level}.json').read_text())['words']
byword=collections.defaultdict(list)
for w in words:
 for variant in set([w['word']]+[canonical(x) for x in w.get('rawWords',[])]):byword[variant].append(w)
ban=re.compile(r'\b(?:kill|murder|suicide|sex|porn|rape|fuck|shit|hell|damn|gun|bomb|drug|naked|blood|die|death|war|hate|fool|idiot|God|christ)\b',re.I)
def suitable(j,e):return 5<=len(j)<=58 and 3<=len(e)<=140 and not ban.search(e) and '\n' not in j and not re.search('[<>]',j)
def attribution(r):return {'sentenceId':r['id'],'author':r['author'],'modified':r['modified'],'url':'https://tatoeba.org/en/sentences/show/'+str(r['id']),'license':'CC-BY-2.0-FR'}
choices=collections.defaultdict(list)
def add(w,j,e,checked=False):
 if not suitable(j['text'],e['text']):return
 choices[w['id']].append({'ja':j['text'],'en':e['text'],'provenance':{'japanese':attribution(j),'english':attribution(e),'license':'CC-BY-2.0-FR'},'score':len(j['text'])+len(e['text'])/8-(12 if checked else 0)})
# Candidate associations from the pinned public dataset, with current sentence identities.
for level in ['N5','N4','N3','N2','N1']:
 p=download('raw-'+level+'.json',f'https://raw.githubusercontent.com/evanclan/OpenJLPT/{REV}/data/json/vocab/{level.lower()}.json')
 for r in json.loads(p.read_text()):
  form=canonical(r['word'])
  for w in byword.get(form,[]):
   if w['level']!=level:continue
   for x in r.get('examples',[]):
    j=jatext.get(x.get('ja'));e=entext.get(x.get('en'))
    if not j or not e:continue
    tokens=list(tag(j['text']));reading=hira(w['reading']);valid=False
    if len(w['word'])>1 and w['word'] in j['text']:valid=True
    if any((t.surface==w['word'] or (t.feature.lemma or '').split('-')[0]==w['word']) and reading in (hira(t.feature.kana),hira(t.feature.kanaBase)) for t in tokens):valid=True
    if valid:add(w,j,e)
# Tanaka/Tatoeba B-line indices explicitly associate dictionary headwords and senses.
p=download('indices.tar.bz2','https://downloads.tatoeba.org/exports/jpn_indices.tar.bz2')
with tarfile.open(p,'r:bz2') as t:
 member=next(m for m in t.getmembers() if m.isfile())
 for b in t.extractfile(member):
  cols=b.decode('utf-8').rstrip('\n').split('\t')
  if len(cols)<3:continue
  j=jp.get(int(cols[0]));e=en.get(int(cols[1]));
  if not j or not e or not suitable(j['text'],e['text']):continue
  for token in cols[2].split():
   m=re.match(r'^([^({\[~]+)(?:\(([^)]+)\))?',token)
   if not m:continue
   form,reading=m.group(1),m.group(2)
   for w in byword.get(form,[]):
    if reading and hira(reading)!=hira(w['reading']):continue
    add(w,j,e,token.endswith('~'))
# Existing authored bilingual sentences take priority where explicitly mapped.
original=json.loads((ROOT/'examples.json').read_text())['entries'];own=collections.defaultdict(list)
for x in original:
 for word in x['targets']:
  for w in byword.get(word,[]):own[w['id']].append(x)
selected=[];missing=[]
for w in words:
 if own[w['id']]:
  x=min(own[w['id']],key=lambda x:len(x['ja']));selected.append({'word':w,'entry':x,'origin':'original'});continue
 if not choices[w['id']]:missing.append(w);continue
 x=min(choices[w['id']],key=lambda x:x['score']);x.pop('score',None)
 x['reading']=''.join((t.surface if t.surface in ['は','へ','を'] else hira(t.feature.kana or t.surface)) for t in tag(x['ja']))
 selected.append({'word':w,'entry':x,'origin':'tatoeba-indexed'})
# Resolve direct Korean translations where available. Translation is not inferred via English.
selected_ids={r['entry']['provenance']['japanese']['sentenceId'] for r in selected if r['origin']!='original'};kr_links=collections.defaultdict(list)
p=download('links.tar.bz2','https://downloads.tatoeba.org/exports/links.tar.bz2')
with tarfile.open(p,'r:bz2') as t:
 member=next(m for m in t.getmembers() if m.isfile())
 for b in t.extractfile(member):
  a,b=map(int,b.split())
  if a in selected_ids and b in ko:kr_links[a].append(ko[b])
for r in selected:
 if r['origin']=='original':continue
 x=r['entry'];options=kr_links.get(x['provenance']['japanese']['sentenceId'],[])
 options=[k for k in options if re.search('[가-힣]',k['text']) and len(k['text'])<150]
 if options:
  k=min(options,key=lambda k:len(k['text']));x['ko']=k['text'];x['provenance']['korean']=attribution(k)
summary={'words':len(words),'selected':len(selected),'missing':len(missing),'uniqueJapanese':len(set(r['entry']['ja'] for r in selected)),'koreanPresent':sum(bool(r['entry'].get('ko')) for r in selected),'independentSemanticReview':False}
for name,data in [('candidates.json',selected),('missing.json',missing),('summary.json',summary),('sources.json',sources)]:
 (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2))
