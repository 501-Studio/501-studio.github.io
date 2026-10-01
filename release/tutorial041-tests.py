"""Teach older scenario tests to dismiss help, without changing app test behavior."""
from pathlib import Path
ROOT=Path('jlpt-quest/tests')
replacements={
 'advanced040-browser.py':("  navigate(p,'home');check('page identity", "  navigate(p,'home');dismiss_tutorial(p);check('page identity"),
 'autopronounce041-browser.py':("  nav(p,'home');check('real app", "  nav(p,'home');dismiss_tutorial(p);check('real app"),
 'continuation040-browser.py':("  nav(p,'home');check('app identity", "  nav(p,'home');dismiss_tutorial(p);check('app identity"),
 'examples038-browser.py':("p.wait_for_selector('.kana-entry');check('correct nonblank", "p.wait_for_selector('.kana-entry');dismiss_tutorial(p);check('correct nonblank"),
 'personal039-browser.py':("p.wait_for_selector('.level-progress-grid');check('page identity", "p.wait_for_selector('.level-progress-grid');dismiss_tutorial(p);check('page identity"),
 'release036-browser.py':("  p.goto(BASE);p.wait_for_selector('.level-progress-grid',timeout=15000)", "  p.goto(BASE);p.wait_for_selector('.level-progress-grid',timeout=15000);dismiss_tutorial(p)"),
 'release037-browser.py':("  p.goto(BASE);p.wait_for_selector('.kana-entry')", "  p.goto(BASE);p.wait_for_selector('.kana-entry');dismiss_tutorial(p)"),
 'release038-browser.py':("p.wait_for_selector('.kana-entry');seed(p)", "p.wait_for_selector('.kana-entry');dismiss_tutorial(p);seed(p)")
}
for name,(old,new) in replacements.items():
 p=ROOT/name;s=p.read_text()
 if new not in s:assert old in s,name;s=s.replace(old,new)
 if 'from qa_tutorial import dismiss_tutorial' not in s:s=s.replace('from playwright.sync_api import sync_playwright','from playwright.sync_api import sync_playwright\nfrom qa_tutorial import dismiss_tutorial')
 p.write_text(s)
p=Path('kotoba-android/app/src/androidTest/java/com/studio501/kotoba/LessonRotationTest.java');s=p.read_text()
old='// Start and classify the actual lesson through its public UI.'
new='js(s,"document.querySelector(\'[data-action=\\\"tutorial-skip\\\"]\')?.click();true");\n            // Start and classify the actual lesson through its public UI.'
if new not in s:assert old in s;s=s.replace(old,new)
p.write_text(s)
# Changing only #route is same-document navigation. The upgrade fixture must boot
# a fresh app after removing its device preference, like an actual app update.
# Do not clear/modify any app runtime flag to make this test pass.
p=ROOT/'tutorial041-browser.py';s=p.read_text()
for old,new in [
 ("p.goto(BASE+'#lesson');p.wait_for_selector('.answer-option')", "p.goto(BASE+'?upgrade041=1#lesson');p.wait_for_selector('.answer-option')"),
 ("p.goto(BASE+'#home');step(p,0);before=learning(p)", "p.goto(BASE+'?upgrade041=1#home');step(p,0);before=learning(p)"),
 ("def screenshot(p,name):p.screenshot(path=str(OUT/name),full_page=True)", "def screenshot(p,name):p.screenshot(path=str(OUT/name),full_page=False)")
]:
 if new not in s:assert old in s,old;s=s.replace(old,new)
p.write_text(s)
print('Historical regressions dismiss actual help UI; upgrade fixture performs a new boot.')
