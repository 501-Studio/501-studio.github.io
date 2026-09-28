"""Build-only translation, not an application network dependency.
Tatoeba English translations are converted to Korean drafts. Every draft is labeled.
No user records, accounts, or lesson data are sent to a translation service.
"""
from pathlib import Path
import json, re, time
from huggingface_hub import snapshot_download
from transformers import MarianTokenizer
from ctranslate2.converters import TransformersConverter
from ctranslate2 import Translator
from pykakasi import kakasi
ROOT=Path('/tmp/kotoba038-content');OUT=Path('/tmp/kotoba038-translated');OUT.mkdir(parents=True,exist_ok=True)
MODEL='Helsinki-NLP/opus-mt-tc-big-en-ko';REV='50d9c6c628ae37fda43988a293139c8612bf9f2d'
rows=json.loads((ROOT/'candidates.json').read_text());selected={}
for row in rows:
 if row['originalCovered'] or not row['candidates']:continue
 e=row['candidates'][0]
 if e['id'] not in selected:selected[e['id']]={**e,'wordIds':[],'targets':[],'ko':'','translationReview':'machine-draft','translationModel':MODEL,'translationRevision':REV}
 assert selected[e['id']]['ja']==e['ja']
 selected[e['id']]['wordIds'].append(row['word']['id'])
entries=list(selected.values());print('Selected',len(entries),'distinct sentence translations for',sum(len(e['wordIds']) for e in entries),'word IDs',flush=True)
local=snapshot_download(MODEL,revision=REV,allow_patterns=['*.json','*.spm','*.safetensors'])
tok=MarianTokenizer.from_pretrained(local,local_files_only=True)
model_dir='/tmp/kotoba038-ct2';TransformersConverter(local).convert(model_dir,quantization='int8',force=True)
translator=Translator(model_dir,device='cpu',compute_type='int8',inter_threads=1,intra_threads=4)
reader=kakasi()
pack={'version':1,'generatedAt':'2026-09-28','license':'CC BY-SA 4.0 (dictionary-derived links); Tatoeba CC BY 2.0 FR sentences','translation':'Korean machine drafts, not native-speaker approval','model':MODEL,'revision':REV,'entries':entries}
errors=[];start=time.time()
for offset in range(0,len(entries),96):
 batch=entries[offset:offset+96]
 sources=[tok.convert_ids_to_tokens(tok.encode(re.sub(r'\[(?:M|F)\]','',e['en']).strip())) for e in batch]
 results=translator.translate_batch(sources,beam_size=3,max_batch_size=24,max_decoding_length=110,repetition_penalty=1.05)
 for e,result in zip(batch,results):
  with tok.as_target_tokenizer():ko=tok.convert_tokens_to_string(result.hypotheses[0]).strip()
  ko=ko.replace('</s>','').replace('<pad>','').strip();e['ko']=ko
  e['reading']=''.join(x['hira'] for x in reader.convert(e['ja']));e['readingReview']='automated-pykakasi-2.3.0'
  if not re.search('[가-힣]',ko) or len(ko)>220 or not ko:errors.append(e['id'])
 (OUT/'examples-corpus.json').write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':')))
 print(offset+len(batch),'/',len(entries),'elapsed',round(time.time()-start), 's',flush=True)
(OUT/'translation-report.json').write_text(json.dumps({'entries':len(entries),'wordIds':sum(len(e['wordIds']) for e in entries),'invalidIds':errors,'seconds':round(time.time()-start),'model':MODEL,'revision':REV,'independentNativeReview':False},ensure_ascii=False,indent=2))
for name in ['missing.json','report.json']:(OUT/name).write_bytes((ROOT/name).read_bytes())
print(json.dumps(entries[:3],ensure_ascii=False,indent=2),flush=True)
assert not errors, 'Some translations need editorial repair: '+str(errors)
