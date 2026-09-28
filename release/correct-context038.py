"""Correct explicitly identified homographs without changing legacy vocabulary IDs."""
from pathlib import Path
import json,os
from collections import Counter
W=Path('jlpt-quest');p=W/'data/examples-expanded.json';pack=json.loads(p.read_text())
fixes=[
 ('N1-1vyy6j9','音','ね','秋の夜に、虫の音が聞こえる。','あきのよるに、むしのねがきこえる。','가을밤에 벌레 소리가 들린다。'.replace('。','.'),'秋の夜に、虫のねが聞こえる。'),
 ('N1-1q4fjw6','盛る','さかる','夏になると、庭の草木が盛る。','なつになると、にわのくさきがさかる。','여름이 되면 정원의 초목이 무성해진다.','夏になると、庭の草木がさかる。'),
 ('N1-3cibxg','夜行','やぎょう','絵巻には、百鬼夜行の様子が描かれている。','えまきには、ひゃっきやぎょうのようすがえがかれている。','그림 두루마리에는 온갖 귀신이 밤에 돌아다니는 모습이 그려져 있다.','絵巻には、ひゃっきやぎょうの様子が描かれている。'),
 ('N1-owuhwh','何々','どれどれ','「どれどれ」と言って、友人が写真をのぞき込んだ。','「どれどれ」といって、ゆうじんがしゃしんをのぞきこんだ。','어디 보자고 말하며 친구가 사진을 들여다보았다。'.replace('。','.'),'「どれどれ」と言って、友人が写真をのぞき込んだ。')]
words={w['id']:w for l in ['N5','N4','N3','N2','N1'] for w in json.loads((W/f'data/{l}.json').read_text())['words']}
for wid,word,reading,ja,kana,ko,speech in fixes:
 assert words[wid]['word']==word and words[wid]['reading']==reading
 found=False
 for e in pack['entries']:
  if wid in e['wordIds']:
   assert not e.get('sourceId'),'Only replace authored homograph entries';e['wordIds'].remove(wid);found=True
 assert found,wid
 pack['entries']=[e for e in pack['entries'] if e['wordIds']]
 pack['entries'].append({'id':'kotoba038-sense-'+wid,'wordIds':[wid],'targets':[],'ja':ja,'reading':kana,'speechText':speech,'ko':ko,'source':'Kotoba original example, assistant-authored; explicit reading-specific context','license':'Project original example; CC BY-SA 4.0 vocabulary linkage','translationReview':'assistant-authored','readingReview':'assistant-authored','independentNativeReview':False})
c=pack['coverage'];c['newAuthoredExampleRecords']=sum(not e.get('sourceId') for e in pack['entries']);c['totalExampleRecords']=c['existingExampleRecords']+len(pack['entries']);c['translationReviewCounts']=dict(Counter(e['translationReview'] for e in pack['entries']));c['explicitHomographCorrections']=[f[0] for f in fixes]
original=json.loads((W/'data/examples.json').read_text())['entries'];legacy={w['id'] for w in words.values() if any(w['word'] in e['targets'] for e in original)}
assert legacy|{wid for e in pack['entries'] for wid in e['wordIds']}==set(words)
p.write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':')))
for q in [W/'data/example-coverage.json',Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba038-qa'))/'example-coverage.json']:q.write_text(json.dumps(c,ensure_ascii=False,indent=2))
print('Explicit homograph contexts corrected:',c['explicitHomographCorrections'])
