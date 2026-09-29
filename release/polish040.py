"""Asserted integration fixes for the 0.4 learning suite. No user data is edited."""
from pathlib import Path
import json
ROOT = Path('jlpt-quest')

def replace(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if new in text:
        return
    assert old in text, f'Expected source fragment missing: {path}'
    p.write_text(text.replace(old, new))

# Keep two independent chart drilldowns distinct for assistive tools and regression tests.
replace('src/advanced-ui.js', '<p class="stats-day-readout">${advanced.date}', '<p class="monthly-day-readout" aria-live="polite">${advanced.date}')
replace('tests/advanced040-browser.py', "p.locator('.stats-day-readout').last.inner_text()", "p.locator('.monthly-day-readout').inner_text()")
replace('src/advanced-ui.js', 'function strokeView(state){const rows=Object.entries(study(state).strokes)', "function strokeView(state,words){const allowed=new Set(filtered(words).flatMap(writingChars));const rows=Object.entries(study(state).strokes).filter(([char])=>allowed.has(char))")
replace('src/advanced-ui.js', 'strokes:()=>strokeView(state)', 'strokes:()=>strokeView(state,words)')
replace('src/advanced-ui.js', "advanced.level=el.dataset.level;render();return true;", "advanced.level=el.dataset.level;advanced.drill=null;render();return true;")
# Avoid counting a second planned repetition as an independent first recall.
replace('src/study-data.js', 'retry:e.retry===true,relearned:', "retry:e.retry===true,sessionId:text(e.sessionId,80),relearned:")
replace('src/study-data.js', "retry:t.attempt>0,relearned:", "retry:t.attempt>0||!!state.session?.id&&(old?.lastSession===state.session.id||s.events.some(e=>e.sessionId===state.session.id&&e.wordId===t.wordId&&e.skill===t.skill)),sessionId:String(state.session?.id||'').slice(0,80),relearned:")
# Surface the weakest observed level/type in the monthly summary, not a fabricated rate.
replace('src/study-data.js', 'return {newIds,events,correct:', "const wordMap=new Map(words.map(w=>[w.id,w])),groups=new Map();for(const e of ind){const level=wordMap.get(e.wordId)?.level,key=level+':'+e.skill;const g=groups.get(key)||{level,skill:e.skill,total:0,misses:0};g.total++;if(!e.correct)g.misses++;groups.set(key,g);}const weakest=[...groups.values()].filter(g=>g.total>=3&&g.misses>0).sort((a,b)=>b.misses/b.total-a.misses/a.total||b.total-a.total)[0]||null;\n return {weakest,newIds,events,correct:")
replace('src/advanced-ui.js', "<p class=\"stats-note\">정답률·재오답·장기 진입은", "${m.weakest?`<p class=\"weakest-month\">오답 비율이 높은 유형: ${m.weakest.level} ${labels[m.weakest.skill]} · ${m.weakest.misses}/${m.weakest.total}회</p>`:'<p class=\"fine\">유형별 정오답이 3회 이상 쌓이면 약점을 표시합니다.</p>'}<p class=\"stats-note\">정답률·재오답·장기 진입은")
# Very easy never automatically schedules sound/writing questions. Explicit user-selected tests are unchanged.
replace('src/course-engine.js', "if(!ids.has(wordId)||!SKILLS.includes(skill))return [];", "if(!ids.has(wordId)||!SKILLS.includes(skill)||intensity(state.settings.intensity)[skill]===0)return [];")
replace('src/course-engine.js', "for(const skill of SKILLS)if(!state.memory[keyOf(wordId,skill)])rows.push", "for(const skill of SKILLS)if(intensity(state.settings.intensity)[skill]>0&&!state.memory[keyOf(wordId,skill)])rows.push")
# Reject duplicate session identities on import before any original record is replaced.
replace('src/course-engine.js', "s.legacy=input.legacy?", "const sessionIds=[s.session,s.suspendedSession,...s.parkedSessions].filter(Boolean).map(q=>q.id);if(new Set(sessionIds).size!==sessionIds.length)throw new Error('수업 보관 기록이 중복되었습니다.');\n s.legacy=input.legacy?")
# Response-time heuristics must not interpret a modal/background interruption as slow recall.
replace('src/app.js', "function openModal(body){modalFit();", "function openModal(body){if(promptClock.id)promptClock.invalid=true;modalFit();")
replace('src/app.js', "const elapsed=promptClock.id===t.id?performance.now()-promptClock.at:0;", "const elapsed=promptClock.id===t.id&&!promptClock.invalid?performance.now()-promptClock.at:0;")
replace('src/app.js', "if(document.hidden){promptClock={id:null,at:0};", "if(document.hidden){promptClock.invalid=true;")
# Corrected exam mistakes leave the automatic error list; unrelated pending errors remain.
replace('src/exam-engine.js', "e.recorded=true;}", "study(state).examErrors=[...new Set(study(state).examWrongIds.map(id=>bank.get(id)?.wordId).filter(Boolean))];e.recorded=true;}")
# Save a stable result timestamp instead of returning a new one whenever results render.
replace('src/exam-engine.js', "return result;\n}", "return study(state).exams.find(r=>r.id===e.id)||result;\n}")
# A single word/example pauses a browser playlist just as it does on Android.
replace('src/audio.js', "stopAudio();const mine=generation;", "globalThis.document?.dispatchEvent?.(new Event('kotoba-single-speech'));stopAudio();const mine=generation;")
replace('src/playlist.js', "let entries=[],", "if(typeof document!=='undefined')document.addEventListener('kotoba-single-speech',()=>{if(playing&&!isNative()){stopBrowser();error='단어 재생으로 연속 듣기를 일시정지했습니다.';}});\nlet entries=[],")
# Surface the complete method-specific pronunciation for explicit sense corrections.
replace('src/playlist.js', "example:(examplesFor(w)[0]?.ja||'').slice(0,500)", "example:(examplesFor(w)[0]?.speechText||examplesFor(w)[0]?.ja||'').slice(0,500)")
# Clear the prior auto-stop timer when stopped or paused, rather than retaining idle work.
replace('src/playlist.js', "playing=false;error='재생이 중단되었습니다. 다시 재생을 누르세요.';", "stopBrowser();error='재생이 중단되었습니다. 다시 재생을 누르세요.';")
# Keep calendar scope explicit: the panel below filtered charts deliberately covers all levels.
replace('src/advanced-ui.js', '<h2>월간 기록</h2>', '<h2>월간 기록 · 전체</h2>')
# Cap incremental speech/review actions to valid, finite input values.
replace('src/study-data.js', 'cap=Math.max(10,Math.min(300,Math.round(cap)));', 'cap=Number.isFinite(cap)?Math.max(10,Math.min(300,Math.round(cap))):60;')
# Match recognizable historical constructions, not common kanji in words such as 天候.
replace('src/example-quality.js', '/[候也哉]|ござる|けり|なりけり|古典|古い文章/', '/ござる|に候|と候|なりけり|けり[。！？]|古典|古い文章/')
# Bundle the integration regression suite in normal npm test, not only in CI.
p=ROOT/'package.json';value=json.loads(p.read_text())
if 'tests/integration040.test.mjs' not in value['scripts']['test']:
    value['scripts']['test'] += ' tests/integration040.test.mjs'
p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
css=ROOT/'advanced.css';text=css.read_text()
if '.monthly-day-readout{' not in text:
    css.write_text(text+'\n.monthly-day-readout{font-size:13px;color:var(--muted);line-height:1.6;padding:12px 0;}\n')
print('Applied 0.4 integration fixes without editing user records.')
