# Data licensing and provenance

The full N1–N5 vocabulary source is OpenJLPT, pinned to commit
`c42fd9fa3777bfc1775446f7c418d549dfd6e4cf`.

- OpenJLPT: https://github.com/evanclan/OpenJLPT
- EDRDG JMdict / EDICT: https://www.edrdg.org/ and https://www.edrdg.org/edrdg/licence.html
- Level assignments: Jonathan Waller, https://www.tanos.co.uk/jlpt/
- Dataset license: **Creative Commons Attribution-ShareAlike 4.0 International**,
  https://creativecommons.org/licenses/by-sa/4.0/ and https://creativecommons.org/licenses/by-sa/4.0/legalcode

The original attribution notice is preserved as `data/OPENJLPT-NOTICE.md`.
Source counts and SHA-256 hashes are retained in `data/source-manifest.json` or `data/coverage.json`.

Modifications in Kotoba: normalize alternate spellings, merge one duplicate normalized
entry, prepend/preserve original Korean starter lessons, add short Korean editorial
glosses where available, remove unreviewed example sentences, attach stable IDs and
curriculum metadata. **The derivative vocabulary data under data/ is CC BY-SA 4.0.**
Reusers must preserve attribution and apply the same license to derived data.
The independently authored application code is not relicensed by this data notice.
No third-party font files are redistributed.

The source contains 8,334 level entries, not an official exhaustive JLPT syllabus.
After one merge and 118 editorial additions, this build has 8,451 level entries.
The same word may legitimately occur in different level lists; these are level entries,
not a claim of 8,451 globally unique lexemes.

Most full-pack glosses are English. Korean translations and the source's unofficial
level assignments require editorial review before commercial educational release.
Examples were deliberately excluded because sampled source examples sometimes did
not match the headword sense. No copied commercial textbook or exam questions are used.
