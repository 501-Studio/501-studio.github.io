"""Translate complete English reference sentences, not isolated dictionary glosses.
M2M100 (MIT) is build-time only. Existing original/direct Korean pairs take priority.
Uncertain or malformed output is recorded for correction, never called reviewed.
"""
from pathlib import Path
import argparse,collections,hashlib,json,re,time
p=argparse.ArgumentParser();p.add_argument('--shard',type=int,required=True);p.add_argument('--shards',type=int,default=8);a=p.parse_args()
ROOT=Path('/tmp/examples039-recovered');OUT=Path('/tmp/example-translations039');OUT.mkdir(exist_ok=True)
source=json.loads((ROOT/'candidates.json').read_text());group={}
for r in source:
 e=r['entry'];key=hashlib.sha256(e['ja'].encode()).hexdigest()[:20]
 if key not in group:group[key]={**e,'id':'EX-'+key,'wordIds':[],'sourceKind':r['origin']}
 x=group[key];x['wordIds'].append(r['word']['id'])
 if e.get('ko') and not x.get('ko'):x['ko']=e['ko'];x['provenance']=e.get('provenance',x.get('provenance'))
entries=[group[k] for k in sorted(group)][a.shard::a.shards]
pending=[e for e in entries if not e.get('ko')]
MODEL='facebook/m2m100_418M';REV='55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636'
def problem(s):
 if not isinstance(s,str) or not re.search('[가-힣]',s):return 'missing-korean'
 if len(s)>230:return 'too-long'
 if re.search(r'(.{3,10})\1{3,}',s):return 'repetition'
 if re.search('원래 제목|사전 의미',s):return 'translation-label'
 return None
started=time.time()
if pending:
 import torch
 from transformers import M2M100Tokenizer,M2M100ForConditionalGeneration
 torch.set_num_threads(2);torch.set_num_interop_threads(1);torch.manual_seed(0)
 tokenizer=M2M100Tokenizer.from_pretrained(MODEL,revision=REV);tokenizer.src_lang='en'
 model=M2M100ForConditionalGeneration.from_pretrained(MODEL,revision=REV).eval()
 for start in range(0,len(pending),32):
  batch=pending[start:start+32];inputs=tokenizer([e['en'] for e in batch],return_tensors='pt',padding=True,truncation=True,max_length=160)
  with torch.inference_mode():generated=model.generate(**inputs,forced_bos_token_id=tokenizer.get_lang_id('ko'),max_new_tokens=120,num_beams=2,early_stopping=True,no_repeat_ngram_size=4)
  for e,text in zip(batch,tokenizer.batch_decode(generated,skip_special_tokens=True)):
   e['ko']=re.sub(r'\s+',' ',text).strip();e['translationMethod']='M2M100 English reference to Korean, editorial review pending';e['translationProblem']=problem(e['ko'])
  (OUT/f'part-{a.shard}.json').write_text(json.dumps({'shard':a.shard,'entries':entries,'finished':False},ensure_ascii=False))
  print('translated',a.shard,min(start+32,len(pending)),len(pending),round(time.time()-started),flush=True)
for e in entries:
 e.setdefault('translationMethod','Original bilingual sentence' if e['sourceKind']=='original' else 'Direct Tatoeba Korean translation')
 e['review']='independent bilingual review pending';e['translationProblem']=problem(e['ko'])
result={'shard':a.shard,'finished':True,'entries':entries,'summary':{'sentences':len(entries),'translated':len(pending),'flagged':sum(bool(e['translationProblem']) for e in entries),'model':MODEL,'modelRevision':REV,'modelLicense':'MIT'}}
(OUT/f'part-{a.shard}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result['summary'],ensure_ascii=False))
