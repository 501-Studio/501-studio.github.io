"""Build-only direct JA→KO drafts, preserving source IDs and draft labels.
Model weights are MIT licensed; no model is bundled or called by the app.
"""
from pathlib import Path
import json,re,time,gc
from huggingface_hub import snapshot_download
from transformers import AutoTokenizer
from ctranslate2.converters import TransformersConverter
from ctranslate2 import Translator
MODEL='facebook/m2m100_1.2B';REV='11301d1d63d756517521fc0fd34d81c5bff0d946'
root=Path('/tmp/kotoba038-pivot');out=Path('/tmp/kotoba038-direct');out.mkdir(exist_ok=True)
pack=json.loads((root/'examples-corpus.json').read_text());entries=pack['entries']
local=snapshot_download(MODEL,revision=REV,allow_patterns=['*.json','*.model','*.safetensors'])
tok=AutoTokenizer.from_pretrained(local,local_files_only=True);tok.src_lang='ja'
TransformersConverter(local,low_cpu_mem_usage=True).convert('/tmp/kotoba038-m2m',quantization='int8',force=True)
gc.collect();tr=Translator('/tmp/kotoba038-m2m',device='cpu',compute_type='int8',intra_threads=4,inter_threads=1)
def translate(texts):
 src=[tok.convert_ids_to_tokens(tok.encode(t)) for t in texts]
 res=tr.translate_batch(src,target_prefix=[[tok.lang_code_to_token['ko']]]*len(src),beam_size=4,max_batch_size=24,max_decoding_length=120,repetition_penalty=1.05)
 return [tok.decode(tok.convert_tokens_to_ids(r.hypotheses[0][1:]),skip_special_tokens=True).strip() for r in res]
smoke_text=['あなたは小学校に通っているの？','彼は右に急カーブした。','私は新しいミシンを買った。','濃い霧のために私たちの飛行機は遅れた。']
smoke=translate(smoke_text);print('DIRECT SMOKE',list(zip(smoke_text,smoke)),flush=True)
assert all(re.search('[가-힣]',x) for x in smoke) and '학교' in smoke[0]
pack['model']=MODEL;pack['revision']=REV;pack['translation']='Direct JA→KO machine drafts; not native-speaker-approved'
invalid=[];start=time.time()
for off in range(0,len(entries),96):
 batch=entries[off:off+96]
 for e,ko in zip(batch,translate([e['ja'] for e in batch])):
  e['koPivot']=e['ko'];e['ko']=ko;e['translationModel']=MODEL;e['translationRevision']=REV
  if not re.search('[가-힣]',ko) or len(ko)>220 or '<unk>' in ko:invalid.append(e['id'])
 (out/'examples-corpus.json').write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':')))
 print(off+len(batch),'/',len(entries),'seconds',round(time.time()-start),flush=True)
(out/'translation-report.json').write_text(json.dumps({'entries':len(entries),'wordIds':sum(len(x['wordIds']) for x in entries),'invalidIds':invalid,'smoke':list(zip(smoke_text,smoke)),'model':MODEL,'revision':REV,'seconds':round(time.time()-start),'independentNativeReview':False},ensure_ascii=False,indent=2))
for name in ['missing.json','report.json']:(out/name).write_bytes((root/name).read_bytes())
