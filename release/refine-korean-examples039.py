"""Build-time direct JA->KO translation; never silently certify MT as edited.
Use Apache-2.0 MADLAD-400, not the earlier English-pivot M2M100 output.
No model or external translation service is included in the installed app.
"""
from pathlib import Path
import argparse,json,re,time,hashlib
from huggingface_hub import snapshot_download
from transformers import AutoTokenizer
import ctranslate2
p=argparse.ArgumentParser();p.add_argument('--shard',type=int,required=True);p.add_argument('--shards',type=int,default=8);p.add_argument('--limit',type=int,default=0);a=p.parse_args()
MODEL='cstr/madlad400-3b-ct2-int8';REV='fd0b55729c074372eb84b52b9309a00dc65c40c4'
root=Path('/tmp/refined039');root.mkdir(exist_ok=True)
entries=json.loads(Path('/tmp/translated039/translated-examples.json').read_text())['entries']
items=sorted(entries,key=lambda e:e['id'])[a.shard::a.shards]
if a.limit:items=items[:a.limit]
path=snapshot_download(MODEL,revision=REV,allow_patterns=['model.bin','config.json','shared_vocabulary.json','tokenizer*','spiece.model','special_tokens_map.json','added_tokens.json','README.md'])
tokenizer=AutoTokenizer.from_pretrained(path)
translator=ctranslate2.Translator(path,device='cpu',compute_type='int8',intra_threads=4,inter_threads=1)
result={};issues=[];start=time.time()
for offset in range(0,len(items),24):
 batch=items[offset:offset+24]
 encoded=[tokenizer.convert_ids_to_tokens(tokenizer.encode('<2ko> '+e['ja'])) for e in batch]
 outputs=translator.translate_batch(encoded,beam_size=3,max_decoding_length=110,max_input_length=256,repetition_penalty=1.1)
 for e,o in zip(batch,outputs):
  text=tokenizer.decode(tokenizer.convert_tokens_to_ids(o.hypotheses[0]),skip_special_tokens=True).strip()
  problem=not re.search('[가-힣]',text) or bool(re.search('[ぁ-ゖァ-ヶ]',text)) or len(text)>280
  if problem:issues.append({'id':e['id'],'ja':e['ja'],'ko':text})
  result[e['id']]={'ko':text,'previousKo':e.get('ko',''),'method':'MADLAD400 direct Japanese to Korean','review':'machine-translation; independent bilingual review pending','translationProblem':problem}
 (root/f'part-{a.shard}.json').write_text(json.dumps({'shard':a.shard,'finished':False,'translations':result,'issues':issues},ensure_ascii=False))
 print(a.shard,min(offset+24,len(items)),len(items),round(time.time()-start),flush=True)
(root/f'part-{a.shard}.json').write_text(json.dumps({'shard':a.shard,'finished':True,'model':MODEL,'revision':REV,'license':'Apache-2.0','translations':result,'issues':issues},ensure_ascii=False))
print('Finished direct Japanese translation:',len(result),'flagged:',len(issues),flush=True)
