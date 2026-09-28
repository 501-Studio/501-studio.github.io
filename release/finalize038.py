"""Build complete example coverage; do not mistake coverage for language approval."""
from pathlib import Path
from collections import Counter,defaultdict
import json,os,re
from pykakasi import kakasi
WEB=Path('jlpt-quest');SRC=Path('/tmp/kotoba038-direct');OUT=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba038-qa'));OUT.mkdir(parents=True,exist_ok=True)
words=[w for l in ['N5','N4','N3','N2','N1'] for w in json.loads((WEB/f'data/{l}.json').read_text())['words']]
assert len(words)==8451 and len({w['id'] for w in words})==8451
byid={w['id']:w for w in words};original=json.loads((WEB/'data/examples.json').read_text())
legacy={w['id'] for w in words if any(w['word'] in e['targets'] for e in original['entries'])}
assert len(original['entries'])==164 and len(legacy)==482
report=json.loads((SRC/'translation-report.json').read_text());raw=json.loads((SRC/'examples-corpus.json').read_text())
assert report['entries']==6026 and report['wordIds']==6992
assert report['model']=='mixed-build-drafts' and report['directJobCompleted'] is False
models={'facebook/m2m100_1.2B':'11301d1d63d756517521fc0fd34d81c5bff0d946','OPUS-MT eng-kor original Marian':'opusTCv20210807-sepvoc_transformer-big_2022-07-28'}
corrections=json.loads(Path('release/examples038/corrections.json').read_text());reader=kakasi();expanded=[];linked=set()
for s in raw['entries']:
 e={k:s[k] for k in ['id','ja','ko','reading','wordIds','source','sourceId','license','dictionaryEntry','surface','translationReview','translationModel','translationRevision','readingReview','selectionMethod','originalJa','exampleReview'] if k in s}
 assert models[e['translationModel']]==e['translationRevision']
 if e['id'] in corrections:
  f=corrections[e['id']];assert f['ja']==e['ja'],e['id'];e['ko']=f['ko'];e['translationReview']='assistant-edited'
 assert re.search('[가-힣]',e['ko']) and '<unk>' not in e['ko'] and len(e['ko'])<=220,e['id']
 assert e['wordIds'] and all(i in byid for i in e['wordIds']) and not set(e['wordIds'])&legacy
 e['targets']=[];e['independentNativeReview']=False;linked.update(e['wordIds']);expanded.append(e)
assert len(linked)==6992 and len(expanded)==6026
missing={w['id']:w for w in words if w['id'] not in legacy|linked};assert len(missing)==977
lookup=defaultdict(list)
for w in missing.values():lookup[w['word']].append(w['id'])
authored=set();unused=[];count=0
for path in sorted(Path('release/examples038').glob('*.tsv')):
 for lineno,line in enumerate(path.read_text().splitlines(),1):
  if not line.strip():continue
  parts=line.split('\t');assert len(parts)==3,(path,lineno)
  heads,ja,ko=parts;targets=heads.split(',');ids=sorted({i for h in targets for i in lookup.get(h,[])})
  if not ids:unused.append({'file':path.name,'line':lineno,'targets':targets});continue
  assert 5<=len(ja)<=180 and re.search('[가-힣]',ko)
  expanded.append({'id':f'kotoba038-{path.stem}-{lineno:04d}','ja':ja,'ko':ko,'reading':''.join(x['hira'] for x in reader.convert(ja)),'wordIds':ids,'targets':[],'authoredTargets':targets,'source':'Kotoba original example, assistant-authored','license':'Project original example; CC BY-SA 4.0 vocabulary linkage','translationReview':'assistant-authored','readingReview':'automated-pykakasi-2.3.0','independentNativeReview':False})
  authored.update(ids);count+=1
assert authored==set(missing),'Uncovered words: '+str([missing[i] for i in set(missing)-authored])
covered=legacy|linked|authored;assert len(covered)==8451
assert len({e['id'] for e in original['entries']+expanded})==len(original['entries'])+len(expanded)
coverage={'version':'0.3.8-internal','totalWords':8451,'coveredWords':8451,'missingWordIds':[],'byLevel':{l:{'total':sum(w['level']==l for w in words),'covered':sum(w['level']==l and w['id'] in covered for w in words)} for l in ['N5','N4','N3','N2','N1']},'existingExampleRecords':164,'newCorpusExampleRecords':6026,'newAuthoredExampleRecords':count,'totalExampleRecords':164+len(expanded),'corpusWordIds':6992,'authoredWordIds':len(authored),'translationReviewCounts':dict(Counter(e['translationReview'] for e in expanded)),'independentNativeReview':False,'machineTranslationHiddenByDefault':True,'readingReview':'New automatic readings may have contextual ambiguity','productionReleased':False,'model':report['model'],'revision':report['revision'],'selectedModelCounts':report['selectedModelCounts'],'directJobCompleted':False,'unusedAuthoredRows':unused}
pack={'version':1,'generatedAt':'2026-09-28','license':'Tatoeba CC BY 2.0 FR; dictionary-derived links CC BY-SA 4.0; see licenses.html','editorialStatus':'Machine Korean drafts hidden by default. Independent native review pending.','coverage':coverage,'entries':expanded}
(WEB/'data/examples-expanded.json').write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':')))
for p in [WEB/'data/example-coverage.json',OUT/'example-coverage.json']:p.write_text(json.dumps(coverage,ensure_ascii=False,indent=2))
notice='''# Examples 0.3.8\n\nJapanese corpus sentences: Tatoeba contributors, https://tatoeba.org/ . Per-sentence IDs link to attribution. Sentences: CC BY 2.0 FR, https://creativecommons.org/licenses/by/2.0/fr/ . Korean adaptations are marked draft or assistant-edited. Original Japanese is retained where a sentence has been adapted.\n\nVocabulary linkage: EDRDG JMdict example edition, https://www.edrdg.org/pub/Nihongo/ ; CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/ . Input archive SHA256: 18a075c6312692b1beb2cf2a0ac5f377874e7d3df5e7412eb7a83117603344cb.\n\nProject-authored sentences: release/examples038/*.tsv. These are assistant-authored, not independently native-speaker-approved. Original vocabulary IDs and rare readings are preserved.\n\nBuild-only models: original OPUS-MT eng-kor Marian, opusTCv20210807-sepvoc_transformer-big_2022-07-28; and facebook/m2m100_1.2B revision 11301d1d63d756517521fc0fd34d81c5bff0d946 (MIT). Actual model and edit provenance are recorded per sentence. Direct JA-KO processing timed out after 4896 records; the complete OPUS corpus supplies the remainder. No model weights or user records are bundled/transmitted. Machine translations may be wrong and remain behind a closed, explicitly labeled disclosure.\n\nReadings are generated with pykakasi 2.3.0 unless otherwise marked; context-sensitive readings may need correction. Full word-ID coverage is NOT proof of semantic correctness.\n'''
p=WEB/'data/licenses/Examples-038-NOTICE.md';p.parent.mkdir(exist_ok=True);p.write_text(notice)
p=WEB/'licenses.html';html=p.read_text();section='''<section class="card" id="examples038"><h2>0.3.8 전체 어휘 예문</h2><p>일본어 용례: Tatoeba 기여자, CC BY 2.0 FR. 어휘 연결: EDRDG JMdict, CC BY-SA 4.0. 각 예문에 출처를 표시합니다.</p><p>한국어 자동번역은 검수 전 초안이며 오역 가능성이 있어 기본적으로 접혀 있습니다. 코토바 작성·수정 문장과 자동 생성 읽기에도 독립적인 원어민 전체 검수가 필요합니다.</p><p>번역은 OPUS-MT와 M2M100으로 빌드 시 생성합니다. 앱은 번역 모델을 포함하거나 학습 기록을 외부 번역 서비스에 보내지 않습니다. 예문 듣기에는 기기의 일본어 오프라인 음성을 사용합니다.</p><a href="data/licenses/Examples-038-NOTICE.md">상세 출처·라이선스·수정 내역</a></section>'''
if 'id="examples038"' not in html:p.write_text(html.replace('</body>',section+'</body>'))
Path('/tmp/kotoba038-final-paths.json').write_text(json.dumps(['jlpt-quest/data/examples-expanded.json','jlpt-quest/data/example-coverage.json','jlpt-quest/data/licenses/Examples-038-NOTICE.md','jlpt-quest/licenses.html']))
print(json.dumps(coverage,ensure_ascii=False,indent=2))
