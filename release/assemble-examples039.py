"""Assemble contextual examples without placeholder/filler sentences.
Stable IDs are taken from actual word mappings. Translations remain explicitly
marked as machine drafts until independently reviewed. Speech build may run
before the Korean refinement because Japanese text/IDs do not change.
"""
from pathlib import Path
import argparse,json,hashlib,re,collections
p=argparse.ArgumentParser();p.add_argument('--source',default='/tmp/translated039/translated-examples.json');p.add_argument('--refined');p.add_argument('--out',default='/tmp/examples039-final');a=p.parse_args()
W=Path('jlpt-quest');out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
words=[w for l in ['N5','N4','N3','N2','N1'] for w in json.loads((W/'data'/f'{l}.json').read_text())['words']];wordmap={w['id']:w for w in words}
source=json.loads(Path(a.source).read_text());entries=source['entries'];assert len(entries)==7052
original={e['ja']:e for e in json.loads((W/'data/examples.json').read_text())['entries'] if 'sourceKind' not in e or e.get('sourceKind')=='original'}
refined=json.loads(Path(a.refined).read_text())['translations'] if a.refined else {}
for e in entries:
 if e['sourceKind']=='original' and e['ja'] in original:
  e['ko']=original[e['ja']]['ko'];e['translationMethod']='original bilingual drafting';e['translationProblem']=False
 elif a.refined:
  t=refined[e['id']];e['ko']=t['ko'];e['previousTranslation']=e.get('ko');e['translationMethod']=t['method'];e['translationProblem']=t['translationProblem']
 e['review']='independent bilingual/native review pending'
 e['kind']='context'
 if e['sourceKind']!='original':
  jp=e['provenance']['japanese'];assert jp.get('sentenceId') and jp.get('url') and jp.get('license')
  e['credit']={'author':jp.get('author') or jp.get('authorCredit') or 'Tatoeba sentence history','sentenceId':jp['sentenceId'],'url':jp['url'],'license':'CC-BY-2.0-FR','modified':'Korean translation and reading added for Kotoba; Japanese sentence retained'}
 else:e['credit']={'author':'Kotoba original drafting','license':'Original project contribution','modified':'New bilingual example supplied for this project'}
# Preferred original contexts for sparse/rare entries. One kanji/old spelling may
# require a compound or orthographic example instead of pretending it is an everyday word.
rare=['N1-zdio7s','N1-57pvlh','N1-q6srbi','N1-17ky4s2','N1-1uwv9pt','N1-1ai0ym9','N1-1p4sfyr','N1-1b4vnkt','N1-1nii1qb','N1-12ler7e','N1-18uherw','N1-vijsn3','N1-12fqyyw','N1-1f3x0g1','N1-193eq0k']
for path in [Path('release/original-examples039-1.tsv'),*sorted(Path('release').glob('original-examples039-2-*.tsv'))]:
 for line in path.read_text().splitlines():
  if not line.strip():continue
  fields=line.split('\t');assert len(fields) in [4,5],(str(path),line)
  ids,ja,reading,ko=fields[:4];ids=ids.split(',');assert all(i in wordmap for i in ids),ids
  assert re.search('[가-힣]',ko) and re.search('[ぁ-ゖァ-ヶ]',ja)
  entries.append({'id':'EX-ORI-'+hashlib.sha256(ja.encode()).hexdigest()[:16],'wordIds':ids,'ja':ja,'reading':reading,'ko':ko,'sourceKind':'original','translationMethod':'original bilingual drafting','translationProblem':False,'review':'assistant draft; independent native review pending','kind':'word-formation' if any(i in rare for i in ids) else 'context','credit':{'author':'Kotoba original drafting','license':'Original project contribution','modified':'New bilingual example supplied for this project'}})
# Consolidate duplicate Japanese sentences while preserving provenance of each source.
merged={}
for e in entries:
 if e['ja'] in merged:
  prior=merged[e['ja']];prior['wordIds']=list(dict.fromkeys(prior['wordIds']+e['wordIds']));prior.setdefault('otherCredits',[]).append(e['credit'])
 else:merged[e['ja']]=e
entries=list(merged.values());ids=set();coverage=set()
for e in entries:
 assert e['id'] not in ids,e['id'];ids.add(e['id']);assert e['ja'] and e['ko'] and e['reading'];coverage.update(e['wordIds'])
 e['audioFile']=hashlib.sha256(('kotoba039-example-jf-alpha|'+e['ja']).encode()).hexdigest()[:24]+'.ogg'
missing=set(wordmap)-coverage;assert not missing,[(i,wordmap[i]['word']) for i in missing]
assert coverage==set(wordmap)
entries.sort(key=lambda e:(e['sourceKind']!='original',len(e['ja']),e['id']))
report={'version':3,'totalWords':len(words),'coveredWordIds':len(coverage),'sentences':len(entries),'sourceSentences':sum(e['sourceKind']!='original' for e in entries),'originalSentences':sum(e['sourceKind']=='original' for e in entries),'flaggedTranslations':sum(bool(e.get('translationProblem')) for e in entries),'directJapaneseKorean':bool(a.refined),'independentNativeReview':False,'missingWordIds':[],'byLevel':{l:sum(i.startswith(l+'-') for i in coverage) for l in ['N5','N4','N3','N2','N1']}}
pack={'version':3,'entries':entries,'coverage':report,'rights':'Source sentences: Tatoeba CC BY 2.0 FR with per-sentence author/history links. Original supplemental text separately marked. Korean translations are adaptations; no third-party voice recording is included.'}
(out/'examples.json').write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':')))
(out/'example-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
