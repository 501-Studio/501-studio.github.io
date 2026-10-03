#!/usr/bin/env python3
"""Apply explicit Japanese+reading keyed editorial changes. Never guess translations.

All entries receive delimiter normalization. 'semanticReviewed' counts only explicit
assistant-reviewed entries, not the complete corpus or an independent human review.
Original source meanings and stable vocabulary IDs are retained for audit/migration.
"""
import json,re,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def dumps(p,obj):p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def tidy(s):
    s=re.sub(r'\s*[·•;]\s*',', ',str(s));s=re.sub(r'\s*,\s*',', ',s)
    return ', '.join(dict.fromkeys(x.strip() for x in s.split(',') if x.strip()))

def main():
    keyed={};pairs={};review=[]
    allwords=[w for level in ['N5','N4','N3','N2','N1'] for w in json.loads((ROOT/'data'/f'{level}.json').read_text(encoding='utf-8'))['words']]
    payload=json.loads((ROOT/'editorial/overrides036.json').read_text(encoding='utf-8'))
    revision=payload['revision']
    digest=hashlib.sha256('\n'.join(w['id'] for w in allwords).encode()).hexdigest()
    if digest!=payload['baseVocabularyIdsSha256']:raise ValueError('Source vocabulary order changed; reconcile editorial overrides first.')
    by_id={w['id']:w for w in allwords}
    for entry in payload.get('readingCorrections',[]):
        w=by_id[entry['id']]
        if w['word']!=entry['word'] or not re.fullmatch(r'[ぁ-ゖァ-ヺー・\s]+',entry['reading']):
            raise ValueError('Invalid explicit reading correction: '+entry['id'])
        w.setdefault('pre036Reading',w['reading'])
        w['reading']=entry['reading']
    for entry in payload.get('lexicalCorrections',[]):
        w=by_id[entry['id']]
        if (w['word'] not in [entry['originalWord'],entry['word']] or
            w['reading'] not in [entry['originalReading'],entry['reading']] or
            not entry['word'] or len(entry['word'])>60 or
            not re.fullmatch(r'[ぁ-ゖァ-ヺー・\s]+',entry['reading'])):
            raise ValueError('Invalid explicit lexical correction: '+entry['id'])
        if w['word']!=entry['word']:
            w.setdefault('pre036Word',w['word']);w['word']=entry['word']
        if w['reading']!=entry['reading']:
            w.setdefault('pre036Reading',w['reading']);w['reading']=entry['reading']
    for index,meaning in payload['corrections']:
        w=dict(allwords[index]);w['meaning']=meaning
        keyed[w['id']]=w;pairs.setdefault(w['word']+'|'+w['reading'],w)
    total=0;changed=0;semantic=0;propagated=0;flags=[];levels={};layer={}
    for level in ['N5','N4','N3','N2','N1']:
        path=ROOT/'data'/f'{level}.json';pack=json.loads(path.read_text(encoding='utf-8'));nchange=nreview=nprop=0
        for w in pack['words']:
            corrected=by_id[w['id']]
            if 'pre036Word' in corrected:
                w.update(word=corrected['word'],pre036Word=corrected['pre036Word'])
            if 'pre036Reading' in corrected:
                w.update(reading=corrected['reading'],pre036Reading=corrected['pre036Reading'])
            old=w['meaning'];before=w.get('pre036Meaning',old)
            e=keyed.get(w['id']);scope='id'
            if e is None:e=pairs.get(w['word']+'|'+w['reading']);scope='same-word-reading'
            text=tidy(e['meaning'] if e else old)
            if not text or re.search(r'[A-Za-z]',text):raise ValueError(f"Invalid Korean meaning: {w['id']} {text}")
            w.update(meaning=text,language='ko',contentRevision=revision)
            if e:
                w['glossReview']='assistant-reviewed' if scope=='id' else 'assistant-reviewed-same-lexeme'
                nreview+=1
                if scope!='id':nprop+=1
            else:w['glossReview']='machine-draft-needs-semantic-review'
            if text!=before:
                w['pre036Meaning']=before;nchange+=1
                review.append({'id':w['id'],'word':w['word'],'reading':w['reading'],'old':before,'new':text,'scope':scope if e else 'punctuation-only'})
            # Suspicious lexical/reading issues are exposed in release audit, not silently cleared.
            reasons=[]
            if re.search(r'단어\s*의미|원래\s*제목|사전적?\s*의미|곡 영어',text):reasons.append('translation-artifact')
            tokens=text.replace(',',' ').split()
            if len(tokens)>5 and len(set(tokens))<len(tokens)*.6:reasons.append('repetition')
            if len(text)>95:reasons.append('long-definition')
            if len(text)<2 and w['glossReview'].startswith('machine'):reasons.append('very-short')
            if not re.fullmatch(r'[ぁ-ゖァ-ヺー・\s]+',w['reading']):reasons.append('reading-format')
            if reasons:flags.append({'id':w['id'],'word':w['word'],'reading':w['reading'],'meaning':text,'reasons':reasons})
            layer[w['id']]=text
        level_complete=nreview==len(pack['words']) and not any(f['id'].startswith(level+'-') for f in flags)
        pack.update(contentRevision=revision,koreanOnly=True,semanticReviewComplete=level_complete)
        path.write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        levels[level]={'words':len(pack['words']),'changed':nchange,'semanticReviewed':nreview,'propagatedSameLexeme':nprop}
        total+=len(pack['words']);changed+=nchange;semantic+=nreview;propagated+=nprop
    complete=semantic==total and not flags
    korean=json.loads((ROOT/'data/korean-glosses.json').read_text(encoding='utf-8'));korean.update(glosses=layer,contentRevision=revision,semanticReviewComplete=complete,semanticReviewed=semantic)
    (ROOT/'data/korean-glosses.json').write_text(json.dumps(korean,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    coverage=json.loads((ROOT/'data/coverage.json').read_text(encoding='utf-8'));coverage.update(contentRevision=revision,semanticReviewComplete=complete,semanticReviewed=semantic)
    for level,info in levels.items():coverage['levels'][level].update(english=0,korean=info['words'],semanticReviewed=info['semanticReviewed'])
    dumps(ROOT/'data/coverage.json',coverage)
    report={'contentRevision':revision,'total':total,'changed':changed,'semanticReviewed':semantic,'propagatedSameLexeme':propagated,'remainingSemanticReview':total-semantic,'englishDisplay':0,'semanticReviewComplete':complete,'reviewer':'assistant; not external human review','levels':levels,'remainingAutomaticFlags':len(flags),'note':'Comma formatting is applied to all entries. Formatting-only changes are NOT counted as semantic review.'}
    identities={e['id']:[e['word'],e['reading']] for e in payload.get('readingCorrections',[])+payload.get('lexicalCorrections',[])}
    (ROOT/'src/reviewed-identities.js').write_text('// Generated from explicit editorial corrections; preserve existing progress IDs.\nexport const CONTENT_REVISION='+json.dumps(revision)+';\nexport const REVIEWED_IDENTITIES='+json.dumps(identities,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
    dumps(ROOT/'editorial/audit.json',report);dumps(ROOT/'editorial/change-log.json',review);dumps(ROOT/'editorial/remaining-flags.json',flags)
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
