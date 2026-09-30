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
print('Historical regressions dismiss the actual guide UI before testing their own flow.')
