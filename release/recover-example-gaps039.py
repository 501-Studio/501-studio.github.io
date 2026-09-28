"""Recover genuine usage examples for spelling variants and rare headwords.
Tatoeba attribution is by sentence URL and any available account name. An orphan
sentence is identified as such, not assigned an invented author. Source: Tatoeba
Terms of Use, attribution by hyperlink to the reused sentence; CC BY 2.0 FR.
"""
from pathlib import Path
import bz2,collections,functools,hashlib,json,re,tarfile,unicodedata,urllib.request
import fugashi
OUT=Path('/tmp/examples039-recovered');OUT.mkdir(exist_ok=True)
ROOT=Path('jlpt-quest/data');CACHE=Path('/tmp/tatoeba039');CACHE.mkdir(exist_ok=True)
tag=fugashi.Tagger();sources={}
def norm(t):return unicodedata.normalize('NFKC',str(t or '')).strip()
def hira(t):return ''.join(chr(ord(c)-96) if '\u30a1'<=c<='\u30f6' else c for c in norm(t))
def get(name,url):
 p=CACHE/name
 if not p.exists():p.write_bytes(urllib.request.urlopen(url,timeout=90).read())
 sources[name]={'url':url,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()};return p

def corpus(lang):
 p=get(lang+'.bz2',f'https://downloads.tatoeba.org/exports/per_language/{lang}/{lang}_sentences_detailed.tsv.bz2');rows={}
 with bz2.open(p,'rt',encoding='utf-8') as f:
  for line in f:
   c=line.rstrip('\n').split('\t')
   if len(c)>=6:rows[int(c[0])]={'id':int(c[0]),'text':c[2],'author':None if c[3] in ('','\\N') else c[3],'modified':c[5]}
 return rows
jp=corpus('jpn');en=corpus('eng');ko=corpus('kor')
words=[w for l in ['N5','N4','N3','N2','N1'] for w in json.loads((ROOT/f'{l}.json').read_text())['words']]
existing=json.loads(Path('/tmp/examples039-extended/candidates.json').read_text())
selected={r['word']['id']:r for r in existing};byreading=collections.defaultdict(list);byform=collections.defaultdict(list)
for w in words:
 byreading[hira(w['reading'])].append(w)
 for s in set([w['word']]+[re.sub(r'\([^)]*\)','',s).strip() for raw in w.get('rawWords',[]) for s in re.split(r'[/／;、]',raw)]):byform[s].append(w)
stop=set('a an the to of in on into for from by with and or that which as is be it someone something somebody some one ones person people do doing make get have take at over out up down not very so too also your his her their my its this'.split())
def enkeys(w):return {x.lower() for s in w.get('sourceMeanings',[w['meaning']]) for x in re.findall('[a-zA-Z]{3,}',s) if x.lower() not in stop}
keys={w['id']:enkeys(w) for w in words}
@functools.lru_cache(maxsize=80000)
def parsed(form):
 ts=list(tag(form));reading=''.join(hira(t.feature.kana or t.surface) for t in ts)
 return reading,tuple((t.feature.lemma or t.surface).split('-')[0] for t in ts)
def attr(r):return {'sentenceId':r['id'],'author':r['author'],'authorCredit':'Tatoeba sentence history' if not r['author'] else r['author'],'modified':r['modified'],'url':'https://tatoeba.org/en/sentences/show/'+str(r['id']),'license':'CC-BY-2.0-FR'}
def acceptable(j,e):
 return 4<=len(j)<=84 and 3<=len(e)<=210 and not re.search(r'\b(fuck|shit|porn|naked|sexual|rape)\b',e,re.I) and not re.search('[<>\n]',j)
choices=collections.defaultdict(list)
p=get('indices.tar.bz2','https://downloads.tatoeba.org/exports/jpn_indices.tar.bz2')
with tarfile.open(p,'r:bz2') as t:
 member=next(m for m in t.getmembers() if m.isfile())
 for raw in t.extractfile(member):
  cols=raw.decode().rstrip('\n').split('\t')
  if len(cols)<3:continue
  j=jp.get(int(cols[0]));e=en.get(int(cols[1]))
  if not j or not e or not acceptable(j['text'],e['text']):continue
  english=e['text'].lower()
  for token in cols[2].split():
   m=re.match(r'^([^({\[~]+)(?:\(([^)]+)\))?',token)
   if not m:continue
   form,read=m.groups();derived,lemmas=parsed(form);read=hira(read) if read else derived
   exact=byform.get(form,[])
   candidates={w['id']:(w,True) for w in exact}
   for lemma in lemmas:
    for w in byform.get(lemma,[]):candidates.setdefault(w['id'],(w,True))
   for w in byreading.get(read,[]):candidates.setdefault(w['id'],(w,False))
   for wid,(w,is_exact) in candidates.items():
    if wid in selected:continue
    if hira(w['reading']) not in (read,derived) and not (is_exact and len(w['word'])>1 and w['word'] in j['text']):continue
    meaning_hit=any(re.search(r'\b'+re.escape(k)+r'(?:s|ed|ing)?\b',english) for k in keys[wid])
    if not is_exact and not meaning_hit:continue
    score=len(j['text'])+len(e['text'])/10-(12 if token.endswith('~') else 0)-(6 if meaning_hit else 0)
    choices[wid].append({'ja':j['text'],'en':e['text'],'provenance':{'japanese':attr(j),'english':attr(e),'license':'CC-BY-2.0-FR'},'match':{'index':token,'lemmaMatch':is_exact,'englishMeaningHit':meaning_hit},'score':score})
for w in words:
 if w['id'] not in selected and choices[w['id']]:
  x=min(choices[w['id']],key=lambda x:x['score']);x.pop('score');x['reading']=''.join((t.surface if t.surface in ['は','へ','を'] else hira(t.feature.kana or t.surface)) for t in tag(x['ja']));selected[w['id']]={'word':w,'entry':x,'origin':'tatoeba-indexed'}
# Same lexeme in another level can reuse an example, but homophones cannot.
for w in words:
 if w['id'] in selected:continue
 options=[]
 for r in selected.values():
  q=r['word']
  if q['reading']!=w['reading']:continue
  if q['word']==w['word'] or set(q.get('sourceMeanings',[]))&set(w.get('sourceMeanings',[])) or q['meaning']==w['meaning']:options.append(r)
 if options:
  r=min(options,key=lambda x:len(x['entry']['ja']));selected[w['id']]={'word':w,'entry':r['entry'],'origin':r['origin'],'sameLexemeId':r['word']['id']}
selected_ids={r['entry']['provenance']['japanese']['sentenceId'] for r in selected.values() if r['origin']!='original'};links=collections.defaultdict(list)
p=get('links.tar.bz2','https://downloads.tatoeba.org/exports/links.tar.bz2')
with tarfile.open(p,'r:bz2') as t:
 member=next(m for m in t.getmembers() if m.isfile())
 for raw in t.extractfile(member):
  a,b=map(int,raw.split())
  if a in selected_ids and b in ko and re.search('[가-힣]',ko[b]['text']) and len(ko[b]['text'])<190:links[a].append(ko[b])
for r in selected.values():
 if r['origin']=='original' or r['entry'].get('ko'):continue
 e=r['entry'];options=links.get(e['provenance']['japanese']['sentenceId'],[])
 if options:
  k=min(options,key=lambda k:len(k['text']));e['ko']=k['text'];e['provenance']['korean']=attr(k)
rows=[selected[w['id']] for w in words if w['id'] in selected];missing=[w for w in words if w['id'] not in selected]
summary={'words':len(words),'selected':len(rows),'missing':len(missing),'uniqueJapanese':len(set(r['entry']['ja'] for r in rows)),'koreanPresent':sum(bool(r['entry'].get('ko')) for r in rows),'nativeReviewed':False}
for name,data in [('candidates.json',rows),('missing.json',missing),('summary.json',summary),('sources.json',sources)]:
 (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2))
