# 0.3.9 internal — device voice, statistics, wordbook drills

Based on PR #5 and `feat/kotoba-038-study-flow` (`a37589c75c7de01c55886159b9372b90ae5cf492`). Changes belong to `feat/kotoba-039-device-stats`. No main, Pages, billing entitlement, or Play publication changes.

## User-facing behavior
- All word/kana/sentence playback uses installed Japanese device TTS. No prerecorded fallback. The APK excludes old Ogg clips and audio indexes. Existing audio preferences migrate to device-only. Japanese offline voice must be installed. Completion/error/cancellation boundaries are tested, not assumed to be audible.
- Settings use independent, labelled 48×28 track/22px thumb switches with >=44px targets. Thumb remains inside its track; motion setting and reduced-motion preference are honored. Daily target and audio-engine selectors are removed.
- Statistics: global XP and question-answering streak; selected-level progress; 7/30/90-day daily activity with click-to-inspect; non-overlapping word-status distribution; meaning/listening/writing stages; seven-day review schedule; earned milestones. Only stored data is used. No invented historic accuracy or practice duration. Current known status takes precedence over class-completed status in the distribution. Historical same-day word/skill duplicates count once.
- A self-reported known word is labelled `아는 단어 · 직접 표시`. Without a skill test record its status is `아는 단어로 분류 · 시험 전`; existing tested schedules remain visible. Self-report is never silently turned into a test pass.
- Early review includes future schedules and known-but-untested word/skill pairs. Correct early answers retain scheduled due time and stage. Incorrect answers schedule a 10-minute revisit. A pre-existing review resumes rather than being destroyed; the app identifies that explicitly.
- Each wordbook row/detail has word listening, example listening, and writing controls. The regular example viewer remains available. Japanese/Korean example attribution and draft disclosures from 038 remain unchanged.
- Wordbook writing supports any integer 1–20 repetitions, with 1/3/5/10/20 shortcuts. A full word counts as one repetition. Guide, answer, undo and retry controls are present. Real stroke matching remains required.
- Independent `wordPractice` plus `practiceLog` are validated and saved alongside—not instead of—`session`, `suspendedSession`, and kana. Pausing, reloading and resuming restore strokes. Replacing an unfinished wordbook drill requires confirmation. Repetitions do not grant quiz mastery, extend SRS, change known status, or award XP.
- Nonfunctional motivational headings are replaced with task labels. Error, licensing, translation-draft and record-protection notices are retained.

## Verification

`npm test` includes legacy course/curriculum/recognition/storage regression and new migration, early-review, statistics, repetition and device-TTS tests. Old bundled-audio expectations are replaced by device-only contract tests, not ignored.

`tests/personal039-browser.py` tests settings, wordbook audio, custom writing, accepted-stroke persistence, early review and statistics in real Chromium. Old 036/037 browser tests use a clearly marked device TTS test adapter. Browser plugin was not available, local Chromium was not installed, and local network DNS was unavailable; therefore browser/Android verification runs in GitHub Actions. All screenshots, reports and traces remain CI artifacts, not production assets. Statistics screenshots use labelled test-fixture data only; no fixtures ship in the app.

Android lifecycle tests enter a real trace task fixture without requiring an emulator Japanese voice. Production code does not bypass the grader or audio completion. Physical-device Japanese voice quality and Samsung-specific accessibility behavior are not claimed as tested. The production approval gate remains mandatory, including `physicalDeviceAudio` and content review.

## Installation

Internal debug build, versionCode 12. Back up existing records before installing. CI debug signing keys can differ between runs; do not uninstall the old app without a backup. The new source does not migrate an existing installed package's signature.
