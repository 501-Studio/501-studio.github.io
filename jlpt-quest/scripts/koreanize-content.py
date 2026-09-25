#!/usr/bin/env python3
"""Generate Korean-only JLPT glosses from the current full packs.

Existing hand-edited Korean glosses are preserved. Remaining English gloss strings are
translated once at build/release-preparation time with the pinned MIT-licensed
facebook/m2m100_418M model, then committed as data/korean-glosses.json.

The installed app does NOT include or call the translation model.
"""
from __future__ import annotations
import argparse,json,re,time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
LEVELS=['N5','N4','N3','N2','N1']
MODEL='facebook/m2m100_418M'
REVISION='55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636'
OUT=DATA/'korean-glosses.json'

# Human overrides for short/common meanings where generic MT tends to be wordy or ambiguous.
OVERRIDES={
    'あさって|あさって':'모레',
    'あそこ|あそこ':'저기 · 저곳',
    'あちら|あちら':'저쪽 · 저곳',
    'あっち|あっち':'저쪽',
    'ここ|ここ':'여기',
    'そこ|そこ':'거기',
    'こちら|こちら':'이쪽 · 여기',
    'そちら|そちら':'그쪽 · 거기',
    'どこ|どこ':'어디',
    'どちら|どちら':'어느 쪽 · 어디',
    'おととい|おととい':'그저께',
    '明後日|あさって':'모레',
    '一昨日|おととい':'그저께',
    'ゼロ|ぜろ':'영 · 0',
    'など|など':'등 · 따위',
    '噛る|かじる':'베어 먹다 · 갉아 먹다',
    '沼|ぬま':'늪 · 연못',
    '垂れる|たれる':'늘어지다 · 처지다 · 떨어지다',
    '壷|つぼ':'항아리 · 단지 · 화병',
    '揺らぐ|ゆらぐ':'흔들리다 · 동요하다',
}

HANGUL=re.compile(r'[가-힣]')

def load_words():
    out=[]
    for level in LEVELS:
        pack=json.loads((DATA/f'{level}.json').read_text(encoding='utf-8'))
        out.extend(pack['words'])
    return out

def compact(text:str)->str:
    text=re.sub(r'\s+',' ',text).strip()
    text=text.replace(' ; ',' · ').replace('; ',' · ').replace(';',' · ')
    text=text.replace(' / ',' · ')
    text=re.sub(r'( · ){2,}',' · ',text)
    parts=text.split()
    if parts and len(set(parts))==1:text=parts[0]
    return text.strip(' ·,;')

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--batch-size',type=int,default=96)
    ap.add_argument('--max-new-tokens',type=int,default=48)
    args=ap.parse_args()
    words=load_words()
    existing={}
    if OUT.exists():
        raw=json.loads(OUT.read_text(encoding='utf-8'))
        if raw.get('modelRevision')==REVISION:
            existing.update(raw.get('glosses',{}))
    # Hand-edited Korean in packs always wins over machine output.
    glosses={}
    pending=[]
    for w in words:
        key=w['id']
        pair=w['word']+'|'+w.get('reading','')
        if w.get('language')=='ko' and HANGUL.search(w.get('meaning','')):
            glosses[key]=compact(w['meaning']);continue
        if pair in OVERRIDES:
            glosses[key]=OVERRIDES[pair];continue
        if key in existing and HANGUL.search(existing[key]):
            glosses[key]=compact(existing[key]);continue
        source=compact(w.get('meaning',''))
        if not source:
            raise SystemExit(f'Missing source gloss: {key} {w.get("word")}')
        pending.append((key,source,w['word'],w.get('reading','')))
    print(f'words={len(words)} preserved={len(glosses)} translate={len(pending)}',flush=True)
    if pending:
        import torch
        from transformers import M2M100ForConditionalGeneration,M2M100Tokenizer
        torch.set_num_threads(max(1,min(8,torch.get_num_threads())))
        tokenizer=M2M100Tokenizer.from_pretrained(MODEL,revision=REVISION)
        tokenizer.src_lang='en'
        model=M2M100ForConditionalGeneration.from_pretrained(MODEL,revision=REVISION)
        model.eval()
        target=tokenizer.get_lang_id('ko')
        started=time.time()
        retry=[]
        def run_batches(items,contextual=False):
            bad=[]
            for start in range(0,len(items),args.batch_size):
                batch=items[start:start+args.batch_size]
                texts=[('dictionary meaning: '+x[1]) if contextual else x[1] for x in batch]
                encoded=tokenizer(texts,return_tensors='pt',padding=True,truncation=True,max_length=128)
                with torch.inference_mode():
                    generated=model.generate(**encoded,forced_bos_token_id=target,max_new_tokens=args.max_new_tokens,num_beams=1)
                translated=tokenizer.batch_decode(generated,skip_special_tokens=True)
                for item,ko in zip(batch,translated):
                    key,source,word,reading=item
                    ko=compact(ko)
                    ko=re.sub(r'^(사전의?\s*)?(뜻|의미)\s*[:：]\s*','',ko).strip()
                    if (not ko) or (not HANGUL.search(ko) and re.search(r'[A-Za-z]{2,}',ko)):
                        bad.append(item);continue
                    glosses[key]=ko
                done=min(start+args.batch_size,len(items))
                if not contextual and done%480<args.batch_size:
                    print(f'translated {done}/{len(items)} in {time.time()-started:.1f}s',flush=True)
            return bad
        retry=run_batches(pending,False)
        if retry:
            print(f'retrying {len(retry)} difficult glosses with dictionary context',flush=True)
            retry=run_batches(retry,True)
        if retry:
            sample='; '.join(f'{w}({r})={src!r}' for _,src,w,r in retry[:30])
            raise RuntimeError(f'{len(retry)} meanings still have no Korean translation: {sample}')
    # Re-apply human overrides after MT/cache.
    by_pair={w['word']+'|'+w.get('reading',''):w['id'] for w in words}
    for pair,ko in OVERRIDES.items():
        if pair in by_pair:glosses[by_pair[pair]]=ko
    missing=[w['id'] for w in words if w['id'] not in glosses or not glosses[w['id']].strip() or (not HANGUL.search(glosses[w['id']]) and re.search(r'[A-Za-z]{2,}',glosses[w['id']]))]
    if missing:raise SystemExit(f'Korean coverage failed: {len(missing)} missing')
    payload={
        'version':1,'complete':True,'sourceWords':len(words),'koreanWords':len(glosses),
        'model':MODEL,'modelRevision':REVISION,'modelLicense':'MIT',
        'note':'Machine-translated draft glosses plus human overrides; education editorial review is still required.',
        'glosses':glosses
    }
    OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    report={'complete':True,'sourceWords':len(words),'koreanWords':len(glosses),'englishVisible':0,'humanOverrides':sum(1 for p in OVERRIDES if p in by_pair)}
    (DATA/'korean-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
