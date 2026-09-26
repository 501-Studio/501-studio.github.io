#!/usr/bin/env python3
"""Create a Korean-only display-gloss layer for every installed JLPT vocabulary item.

Rules:
- Existing human-edited Korean meanings always win.
- A pinned M2M100 revision is used only on the build machine.
- English dictionary metadata is removed before translation.
- Any residual Latin alphabet in a display gloss is rejected.
- Common short/ambiguous words may have explicit human overrides.
- The installed app never contains or calls the translation model.
"""
from __future__ import annotations
import argparse, json, re, time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
LEVELS=['N5','N4','N3','N2','N1']
MODEL='facebook/m2m100_418M'
REVISION='55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636'
HANGUL=re.compile(r'[가-힣]')
LATIN=re.compile(r'[A-Za-z]')
META_PAREN=re.compile(
    r'\((?:\d+|abbr|arch|col|comp|conj|exp|fam|hon|id|int|n|nav\.?|uk|adj|adv|vs|vi|vt|'
    r'de:[^)]*|nl:[^)]*|pt:[^)]*)\)', re.I
)
LATIN_TOKEN=re.compile(r'(?<![가-힣])[A-Za-z][A-Za-z0-9+._^/-]*(?![가-힣])')

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
    '零|れい':'영 · 0',
    'など|など':'등 · 따위',
    'スカート|すかーと':'치마 · 스커트',
    'テレビ|てれび':'텔레비전',
    '牛肉|ぎゅうにく':'소고기',
    '飛ぶ|とぶ':'날다 · 뛰어오르다',
    '噛る|かじる':'베어 먹다 · 갉아 먹다',
    '沼|ぬま':'늪 · 연못',
    '垂れる|たれる':'늘어지다 · 처지다 · 떨어지다',
    '壷|つぼ':'항아리 · 단지 · 화병',
    '揺らぐ|ゆらぐ':'흔들리다 · 동요하다',
    'スーツ|すーつ':'정장 · 슈트',
    '手袋|てぶくろ':'장갑',
    '優しい|やさしい':'상냥하다 · 친절하다',
    'うなる|うなる':'신음하다 · 으르렁거리다',
    'おそらく|おそらく':'아마 · 아마도',
    '咳|せき':'기침',
    '缶|かん':'깡통 · 캔',
    '濠|ほり':'해자 · 성 주위의 도랑',
    '退屈|たいくつ':'지루함 · 무료함',
    '謎|なぞ':'수수께끼 · 의문',
    '余り|あまり':'그다지 · 별로',
    '雷|かみなり':'천둥 · 번개',
    'ガム|がむ':'껌',
    '引算|ひきざん':'뺄셈',
    '櫛|くし':'빗',
    '胡椒|こしょう':'후추',
    '裁縫|さいほう':'바느질 · 재봉',
    '酌む|くむ':'술을 따르다',
    '蹴る|ける':'차다',
    '真似る|まねる':'흉내 내다 · 모방하다',
    '青白い|あおじろい':'창백하다 · 푸르스름하게 희다',
    '扇ぐ|あおぐ':'부채질하다',
    '抽象|ちゅうしょう':'추상',
    '跳ぶ|とぶ':'뛰다 · 뛰어오르다 · 날아오르다',
    '謎謎|なぞなぞ':'수수께끼',
    'し|し':'10의 24제곱 · 자',
    'タイル|たいる':'타일',
    'ドリル|どりる':'드릴 · 송곳',
    'ルーズ|るーず':'헐겁다 · 칠칠치 못하다',
    '恐らく|おそらく':'아마 · 아마도',
    '軽蔑|けいべつ':'경멸',
    '濠|ごう':'해자 · 성 주위의 도랑',
    '図る|はかる':'꾀하다 · 계획하다 · 도모하다',
    '沈める|しずめる':'가라앉히다 · 침몰시키다',
    '津波|つなみ':'쓰나미 · 지진해일',
    '痛切|つうせつ':'절실함 · 뼈저림',
    '電源|でんげん':'전원 · 전력 공급원',
    '肺|はい':'폐 · 허파',
    '無礼|ぶれい':'무례함 · 버릇없음',
    '雷|いかずち':'천둥',
    '炒める|いためる':'볶다',
}

def load_words(selected=None):
    words=[]
    for level in LEVELS:
        if selected and level != selected:
            continue
        pack=json.loads((DATA/f'{level}.json').read_text(encoding='utf-8'))
        words.extend(pack['words'])
    return words

def compact(text:str)->str:
    text=re.sub(r'\s+',' ',str(text)).strip()
    text=text.replace(' ; ',' · ').replace('; ',' · ').replace(';',' · ')
    text=text.replace(' / ',' · ')
    text=re.sub(r'( · ){2,}',' · ',text)
    parts=text.split()
    if parts and len(set(parts))==1:
        text=parts[0]
    return text.strip(' ·,;:/')

def clean_source(text:str)->str:
    text=META_PAREN.sub(' ',str(text))
    text=re.sub(r'\s+',' ',text)
    text=text.strip(' ·,;:/')
    return text or 'meaning'

def clean_translation(text:str)->str:
    text=compact(text)
    if re.search(r'원래\s*제목|original\s*title',text,re.I):
        return ''
    if HANGUL.search(text):
        text=LATIN_TOKEN.sub(' ',text)
        text=re.sub(r'\(\s*\)|\[\s*\]',' ',text)
        text=re.sub(r'\s*([·,;:/])\s*',r' \1 ',text)
        text=re.sub(r'(\s*[·,;:/]\s*){2,}',' · ',text)
        text=re.sub(r'\s+',' ',text).strip(' ·,;:/')
    return text

def valid_korean_display(text:str)->bool:
    text=str(text).strip()
    if not text or LATIN.search(text):
        return False
    # Pure numerals/symbols are allowed, but ordinary lexical meanings should contain Hangul.
    return bool(HANGUL.search(text) or re.fullmatch(r'[\d\s.,%+\-·/]+',text))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--batch-size',type=int,default=96)
    ap.add_argument('--max-new-tokens',type=int,default=48)
    ap.add_argument('--level',choices=LEVELS)
    args=ap.parse_args()

    words=load_words(args.level)
    out_path=DATA/(f'korean-glosses-{args.level}.json' if args.level else 'korean-glosses.json')
    coverage_path=DATA/(f'korean-coverage-{args.level}.json' if args.level else 'korean-coverage.json')

    existing={}
    if out_path.exists():
        try:
            raw=json.loads(out_path.read_text(encoding='utf-8'))
            if raw.get('modelRevision')==REVISION:
                existing.update(raw.get('glosses',{}))
        except Exception:
            pass

    glosses={}
    pending=[]
    for w in words:
        key=w['id']
        pair=w['word']+'|'+w.get('reading','')
        if pair in OVERRIDES:
            glosses[key]=OVERRIDES[pair]
            continue
        if w.get('language')=='ko' and valid_korean_display(w.get('meaning','')):
            glosses[key]=compact(w['meaning'])
            continue
        if key in existing and valid_korean_display(existing[key]):
            glosses[key]=compact(existing[key])
            continue
        source=compact(w.get('meaning',''))
        if not source:
            raise RuntimeError(f'Missing source gloss: {key} {w.get("word")}')
        pending.append((key,source,w['word'],w.get('reading','')))

    print(f'level={args.level or "ALL"} words={len(words)} preserved={len(glosses)} translate={len(pending)}',flush=True)

    if pending:
        import torch
        from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer
        torch.set_num_threads(max(1,min(8,torch.get_num_threads())))
        tokenizer=M2M100Tokenizer.from_pretrained(MODEL,revision=REVISION)
        tokenizer.src_lang='en'
        model=M2M100ForConditionalGeneration.from_pretrained(MODEL,revision=REVISION)
        model.eval()
        target=tokenizer.get_lang_id('ko')
        started=time.time()

        def run_batches(items, contextual=False):
            bad=[]
            for start in range(0,len(items),args.batch_size):
                batch=items[start:start+args.batch_size]
                texts=[('dictionary meaning: '+clean_source(x[1])) if contextual else clean_source(x[1]) for x in batch]
                encoded=tokenizer(texts,return_tensors='pt',padding=True,truncation=True,max_length=128)
                with torch.inference_mode():
                    generated=model.generate(
                        **encoded,
                        forced_bos_token_id=target,
                        max_new_tokens=args.max_new_tokens,
                        num_beams=1
                    )
                translated=tokenizer.batch_decode(generated,skip_special_tokens=True)
                for item,ko in zip(batch,translated):
                    key,source,word,reading=item
                    ko=clean_translation(ko)
                    ko=re.sub(r'^(사전의?\s*)?(뜻|의미)\s*[:：]\s*','',ko).strip()
                    if not valid_korean_display(ko):
                        bad.append(item)
                        continue
                    glosses[key]=ko
                done=min(start+args.batch_size,len(items))
                if not contextual and done%480<args.batch_size:
                    print(f'{args.level or "ALL"} translated {done}/{len(items)} in {time.time()-started:.1f}s',flush=True)
            return bad

        retry=run_batches(pending,False)
        if retry:
            print(f'{args.level or "ALL"} retrying {len(retry)} difficult glosses',flush=True)
            retry=run_batches(retry,True)
        if retry:
            sample='; '.join(f'{w}({r})={src!r}' for _,src,w,r in retry[:80])
            raise RuntimeError(f'{len(retry)} meanings still have no Korean-only translation: {sample}')

    by_pair={w['word']+'|'+w.get('reading',''):w['id'] for w in words}
    for pair,ko in OVERRIDES.items():
        if pair in by_pair:
            glosses[by_pair[pair]]=ko

    missing=[w for w in words if w['id'] not in glosses or not valid_korean_display(glosses[w['id']])]
    if missing:
        sample='; '.join(f'{w["word"]}({w.get("reading","")})' for w in missing[:80])
        raise RuntimeError(f'Korean coverage failed: {len(missing)} items: {sample}')

    payload={
        'version':1,'complete':True,'sourceWords':len(words),'koreanWords':len(glosses),
        'model':MODEL,'modelRevision':REVISION,'modelLicense':'MIT',
        'note':'Machine-translated Korean draft glosses plus human overrides; production education review is still required.',
        'glosses':glosses
    }
    if args.level:
        payload['level']=args.level
    out_path.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    report={
        'complete':True,'level':args.level,'sourceWords':len(words),'koreanWords':len(glosses),
        'englishVisible':0,'humanOverrides':sum(1 for p in OVERRIDES if p in by_pair)
    }
    coverage_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':
    main()
