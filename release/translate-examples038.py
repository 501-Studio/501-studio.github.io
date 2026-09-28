"""Build-only Korean draft translation using the original Marian vocabulary pair.
The converted Hugging Face en-ko model has a known upstream vocabulary mismatch.
Use the original model and run semantic smoke checks BEFORE processing examples.
No user data is used; runtime never calls a translation service.
"""
from pathlib import Path
from io import BytesIO
import json,re,time,zipfile,urllib.request,hashlib
import sentencepiece as spm
from ctranslate2.converters import OpusMTConverter
from ctranslate2 import Translator
from pykakasi import kakasi
ROOT=Path('/tmp/kotoba038-content');OUT=Path('/tmp/kotoba038-translated');OUT.mkdir(parents=True,exist_ok=True)
MODEL='OPUS-MT eng-kor original Marian';REV='opusTCv20210807-sepvoc_transformer-big_2022-07-28'
url='https://object.pouta.csc.fi/Tatoeba-MT-models/eng-kor/'+REV+'.zip'
raw=urllib.request.urlopen(url,timeout=180).read();digest=hashlib.sha256(raw).hexdigest();base=Path('/tmp/kotoba038-original');base.mkdir(exist_ok=True)
with zipfile.ZipFile(BytesIO(raw)) as z:
 for name in z.namelist():
  assert not name.startswith('/') and '..' not in Path(name).parts
 z.extractall(base)
print('Original model',digest,[str(x.relative_to(base)) for x in base.rglob('*') if x.is_file()],flush=True)
npz=next(base.rglob('*.npz'));model_dir='/tmp/kotoba038-ct2';OpusMTConverter(str(npz.parent)).convert(model_dir,quantization='int8',force=True)
src=next(base.rglob('source.spm'));trg=next(base.rglob('target.spm'))
source=spm.SentencePieceProcessor(model_file=str(src));target=spm.SentencePieceProcessor(model_file=str(trg))
translator=Translator(model_dir,device='cpu',compute_type='int8',inter_threads=1,intra_threads=4)
def translate(texts):
 result=translator.translate_batch([source.encode(t,out_type=str) for t in texts],beam_size=3,max_batch_size=24,max_decoding_length=110,repetition_penalty=1.05)
 return [target.decode(r.hypotheses[0]).strip() for r in result]
smoke=translate(['2, 4, 6 etc. are even numbers.','I am a student.','Please write to me when you get there.'])
print('TRANSLATION SMOKE',smoke,flush=True)
assert '짝수' in smoke[0] and '학생' in smoke[1], 'Broken vocabulary/model pairing; no corpus output permitted'
rows=json.loads((ROOT/'candidates.json').read_text());selected={}
for row in rows:
 if row['originalCovered'] or not row['candidates']:continue
 e=row['candidates'][0]
 if e['id'] not in selected:selected[e['id']]={**e,'wordIds':[],'targets':[],'ko':'','translationReview':'machine-draft','translationModel':MODEL,'translationRevision':REV}
 assert selected[e['id']]['ja']==e['ja'];selected[e['id']]['wordIds'].append(row['word']['id'])
entries=list(selected.values());reader=kakasi();errors=[];start=time.time()
pack={'version':1,'generatedAt':'2026-09-28','license':'CC BY-SA 4.0 (dictionary-derived links); Tatoeba CC BY 2.0 FR sentences','translation':'Korean machine drafts; independent native review pending','model':MODEL,'revision':REV,'modelSha256':digest,'entries':entries}
for offset in range(0,len(entries),96):
 batch=entries[offset:offset+96];translated=translate([re.sub(r'\[(?:M|F)\]','',e['en']).strip() for e in batch])
 for e,ko in zip(batch,translated):
  e['ko']=ko;e['reading']=''.join(x['hira'] for x in reader.convert(e['ja']));e['readingReview']='automated-pykakasi-2.3.0'
  if not re.search('[가-힣]',ko) or len(ko)>220 or '<unk>' in ko:errors.append(e['id'])
 (OUT/'examples-corpus.json').write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':')))
 print(offset+len(batch),'/',len(entries),'elapsed',round(time.time()-start),'s',flush=True)
(OUT/'translation-report.json').write_text(json.dumps({'entries':len(entries),'wordIds':sum(len(e['wordIds']) for e in entries),'invalidIds':errors,'seconds':round(time.time()-start),'model':MODEL,'revision':REV,'modelSha256':digest,'independentNativeReview':False,'smoke':smoke},ensure_ascii=False,indent=2))
for name in ['missing.json','report.json']:(OUT/name).write_bytes((ROOT/name).read_bytes())
print(json.dumps(entries[:3],ensure_ascii=False,indent=2),flush=True)
# Preserve complete candidates for explicit editorial repair, but never publish here.
if errors:print('EDITORIAL REPAIR REQUIRED',errors,flush=True)
