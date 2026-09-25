# Data licensing and provenance

## Vocabulary data — CC BY-SA 4.0

OpenJLPT pinned commit: c42fd9fa3777bfc1775446f7c418d549dfd6e4cf

- OpenJLPT: https://github.com/evanclan/OpenJLPT
- EDRDG JMdict / EDICT: https://www.edrdg.org/ and https://www.edrdg.org/edrdg/licence.html
- Level assignments: Jonathan Waller, https://www.tanos.co.uk/jlpt/
- License: Creative Commons Attribution-ShareAlike 4.0 International,
  https://creativecommons.org/licenses/by-sa/4.0/ and https://creativecommons.org/licenses/by-sa/4.0/legalcode

Original notice: data/OPENJLPT-NOTICE.md. Source counts and hashes: data/coverage.json.
Kotoba changes: normalize alternate spellings, merge normalized duplicates, preserve/add original Korean starter lessons, add short editorial glosses, remove unreviewed example sentences and attach curriculum metadata. The derived vocabulary data remains CC BY-SA 4.0. Original application code is separate from this data license.

8,334 source level entries become 8,451 installed level entries after one merge and 118 editorial additions. Levels may share vocabulary. 397 entries have Korean glosses; 8,054 are English and need Korean editorial review. No official exhaustive JLPT syllabus is claimed.

## Handwriting stroke data — CC BY-SA 3.0

KanjiVG, copyright Ulrich Apel and contributors.
- Project: https://kanjivg.tagaini.net/
- Source: https://github.com/KanjiVG/kanjivg
- Pinned commit: 422b5538595676da918c288a4230cb5e22a1ee7e
- License: https://creativecommons.org/licenses/by-sa/3.0/
- Full original license: data/licenses/KanjiVG-COPYING.txt

Kotoba changes: select characters used by this curriculum; sample SVG cubic/quadratic paths in order; normalize 109-unit SVG coordinates; simplify polylines at a fixed tolerance and round coordinates to 4 decimals. The derived strokes.json dataset is CC BY-SA 3.0. Preserve these notices and the same license for adaptations of the stroke data. Source archive hash and derived data hash are in data/stroke-coverage.json.

The 2,244-character, 22,615-stroke pack is bundled locally, not downloaded by the installed APK. Reuse does not imply endorsement by KanjiVG. No Duolingo assets or third-party fonts are included.


## Offline pronunciation audio — HTS Voice CC BY 3.0

The Android release bundles Japanese pronunciation clips generated at build time with Open JTalk and **HTS Voice "NIT ATR503 M001" version 1.05**.

- Voice project: https://open-jtalk.sourceforge.net/
- Voice license notice: https://open-jtalk.sourceforge.net/readme_hts_voice_nitech_jp_atr503_m001.php
- License: Creative Commons Attribution 3.0, https://creativecommons.org/licenses/by/3.0/
- Copyright © 2003–2012 Nagoya Institute of Technology, Department of Computer Science
- Copyright © 2003–2008 Tokyo Institute of Technology, Interdisciplinary Graduate School of Science and Engineering

Kotoba modification: each curriculum reading is synthesized during the reproducible build, leading/trailing silence is trimmed, and audio is encoded as mono 16 kHz Ogg Opus. Identical readings share one clip. The installed app contains the resulting audio files and does not contain the Open JTalk engine, model, or Japanese dictionary executable data.

Open JTalk and the NAIST Japanese Dictionary are used only on the build machine. The Debian Open JTalk Japanese dictionary package identifies the converted NAIST dictionary as BSD-style licensed. The generated audio is distributed with attribution to the HTS Voice licensors and its CC BY 3.0 terms.

The installed Google Play Android build is intended to perform vocabulary, handwriting and listening without network access. Audio coverage metadata is generated as `data/audio-coverage.json`; `data/audio-manifest.json` maps every installed vocabulary ID to a bundled pronunciation clip.
