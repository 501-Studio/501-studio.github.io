# Data licensing and provenance

Current content revision: **0.4.2 / 042-editorial-1**, checked 2026-10-03. These notices describe the installed data and retain attribution for earlier releases. They do not imply endorsement by any source project.

## Vocabulary data — CC BY-SA 4.0

OpenJLPT pinned commit: `c42fd9fa3777bfc1775446f7c418d549dfd6e4cf`.

- OpenJLPT: https://github.com/evanclan/OpenJLPT
- EDRDG JMdict / EDICT, copyright James William Breen and the Electronic Dictionary Research and Development Group: https://www.edrdg.org/ and https://www.edrdg.org/edrdg/licence.html
- Level assignments: Jonathan Waller, https://www.tanos.co.uk/jlpt/
- License: Creative Commons Attribution-ShareAlike 4.0 International, https://creativecommons.org/licenses/by-sa/4.0/ and https://creativecommons.org/licenses/by-sa/4.0/legalcode
- The source attributions and license links are retained here and in `licenses.html`. Source counts and hashes: `data/coverage.json`.

8,334 source level entries become **8,451 installed level entries** after one duplicate merge and 118 editorial additions: N5 669, N4 655, N3 1,798, N2 1,844 and N1 3,485. Levels may share vocabulary; these counts are level entries, not a count of unique Japanese lexemes. The source list is not an official exhaustive JLPT syllabus.

Kotoba changes include alternate-spelling normalization, duplicate merging, original Korean starter lessons, Korean display glosses, removal of source example sentences from the vocabulary imports, curriculum metadata, and explicit corrections to damaged headwords/readings. Stable vocabulary IDs are retained to preserve learning progress; the 35 explicit identity aliases are recorded in `src/reviewed-identities.js`. The derived vocabulary and Korean gloss layer remain **CC BY-SA 4.0**. Original application code is separate from this data license.

### Korean meanings and semantic review

The initial preparation had 397 existing Korean glosses and 8,054 English entries requiring a Korean display gloss. These are historical input counts. The current installed packs display **8,451 Korean or language-neutral meanings, with zero English display definitions**.

Revision `042-editorial-1` has assistant semantic-review coverage for all 8,451 installed entries: 8,396 explicit ID-based decisions and 55 meanings propagated only to an identical Japanese headword and reading. The new `editorial/review042/` records individually assessed 6,037 previously outstanding cards; earlier review records cover the remaining decisions. Common vocabulary was assessed from Japanese/Korean lexical knowledge, with uncertain meanings, spellings and readings checked against primary dictionary sources including JMdict. Formatting-only changes do not count as semantic review. The audit reports zero remaining semantic-review entries and zero automatic flags.

Evidence and original meanings are retained in `editorial/overrides036.json`, `editorial/review042/`, `editorial/change-log.json`, and each entry's source/pre-edit fields. Summary counts are in `editorial/audit.json`. This is assistant review, **not independent external human or native-speaker approval**. It applies to vocabulary meanings and reviewed lexical corrections; it does not certify all example sentences, contextual readings, pronunciation or JLPT level assignments.

### Earlier Korean gloss generation — M2M100 MIT

For entries without an existing edited Korean meaning, release preparation generated a Korean draft from English definitions with **facebook/m2m100_418M**, revision `55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636`.

- Model: https://huggingface.co/facebook/m2m100_418M
- Model license: MIT.
- The model was used only on the release-preparation machine and is not included in the installed app.
- `data/korean-glosses.json` now contains the reviewed display layer; explicit editorial meanings override the machine drafts.

The build-only model license does not replace the CC BY-SA 4.0 terms of the derived vocabulary data.

## Handwriting stroke data — CC BY-SA 3.0

KanjiVG, copyright Ulrich Apel and contributors.

- Project: https://kanjivg.tagaini.net/
- Source: https://github.com/KanjiVG/kanjivg
- Pinned commit: `422b5538595676da918c288a4230cb5e22a1ee7e`
- License: https://creativecommons.org/licenses/by-sa/3.0/
- Full original license: `data/licenses/KanjiVG-COPYING.txt`

Kotoba selects characters used by the current curriculum, samples SVG cubic/quadratic paths in order, normalizes 109-unit SVG coordinates, simplifies polylines at a fixed tolerance and rounds coordinates to four decimal places. The current local pack contains **2,258 characters and 22,653 strokes**, with zero missing curriculum characters. Source archive and derived hashes are in `data/stroke-coverage.json`.

The derived `strokes.json` remains **CC BY-SA 3.0**. Preserve these notices and that license when adapting the stroke data. The 0.3.7 kana extension used the same pinned source and license; current counts reflect the rebuilt 0.4.2 curriculum subset. Reuse does not imply endorsement by KanjiVG. No Duolingo assets or third-party fonts are included.

## Current pronunciation — installed device TTS

Since 0.3.9, the current app requests an already-installed Japanese voice from the device's TTS engine that is reported as usable offline. A usable Japanese voice must be installed; playback can be unavailable when the engine or voice is missing. No pre-generated Ogg clips, Open JTalk engine, Kokoro model weights, or copied Google/Samsung voice files are included in the current APK.

The retained `data/audio-coverage.json` and `data/audio-manifest.json` contain historical Kokoro generation records. Their clip counts do not describe audio files in the current APK. The current audio implementation and bundled-asset verifier require device-only speech. Vocabulary and handwriting data are local. Advertising, purchases and related account services use network access when enabled; this is not a claim that the entire app has no network capability.

## Historical 0.3.6 audio — HTS Voice CC BY 3.0

The previous 0.3.6 audio was generated during build preparation with Open JTalk and **HTS Voice "NIT ATR503 M001" version 1.05**.

- Voice project: https://open-jtalk.sourceforge.net/
- Voice license notice: https://open-jtalk.sourceforge.net/readme_hts_voice_nitech_jp_atr503_m001.php
- License: Creative Commons Attribution 3.0, https://creativecommons.org/licenses/by/3.0/
- Copyright © 2003–2012 Nagoya Institute of Technology, Department of Computer Science.
- Copyright © 2003–2008 Tokyo Institute of Technology, Interdisciplinary Graduate School of Science and Engineering.

Kotoba synthesized each curriculum reading, trimmed leading/trailing silence, and encoded mono 16 kHz Ogg Opus; identical readings shared one clip. Open JTalk and the NAIST Japanese Dictionary were build-only tools; the Debian dictionary package identified the converted NAIST dictionary as BSD-style licensed. The historical generated clips carried HTS Voice attribution and CC BY 3.0 terms. These notices are retained as provenance; those clips are not in the current package.

## Historical 0.3.7 audio — Kokoro Apache-2.0

The 0.3.7 replacement audio was synthesized with **Kokoro-82M v1.0, jf_alpha**, whose model/voice license is Apache-2.0. Historical notices and the full license remain in `data/licenses/Kokoro-NOTICE.md` and `data/licenses/Kokoro-Apache-2.0.txt`. The Open JTalk clips were removed in 0.3.7; the Kokoro clips were removed when the app moved to device TTS in 0.3.9. Historical voice generation and pronunciation were not independently reviewed by native speakers.

## Example sentences — separate provenance and review scope

The 164 original 0.3.7 examples and their Korean text were authored for this project; see `release/EXAMPLES-037.md`. The expanded 0.3.8 example layer includes Japanese sentences by **Tatoeba contributors**, under **CC BY 2.0 FR**, and vocabulary linkage from **EDRDG JMdict**, under **CC BY-SA 4.0**. Individual sentence IDs and sources provide attribution.

- Tatoeba: https://tatoeba.org/
- Sentence license: https://creativecommons.org/licenses/by/2.0/fr/
- Detailed attribution, model revisions, adaptations and review status: `data/licenses/Examples-038-NOTICE.md`.

Project-authored or adapted sentences are marked separately. Korean draft translations were prepared with build-only OPUS-MT and M2M100 models; generated readings use pykakasi unless otherwise marked. No translation models or user learning records are sent to an external translation service by the app. The full example corpus, draft translations and context-dependent readings still lack independent native-speaker review. Vocabulary semantic-review completion does not change these example-review limits.
