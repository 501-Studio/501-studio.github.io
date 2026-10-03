# Kokoro Japanese pronunciation assets

Generated for Kotoba with hexgrad/Kokoro-82M v1.0, voice jf_alpha.
Model and voice weights are published under Apache License 2.0.
- Model: https://huggingface.co/hexgrad/Kokoro-82M
- Voice documentation: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
- Library: https://github.com/hexgrad/kokoro

Only newly synthesized audio is bundled. No model weights or runtime model download is included in the app. Audio is generated at 24,000 samples/s, encoded Ogg Opus mono 48 kbps VBR, silence-trimmed with margins and peak-limited. This is not an upsample of the prior Open JTalk voice.

The model card identifies permissive/public-domain and synthetic training sources and credits Koniwa and SIWIS among its CC BY training sources. See the upstream model card for full provenance. Apache-2.0 is a permission license, not a declaration that all possible rights are absent. No native-speaker review of every generated pronunciation has been completed. Very short utterances are a documented model weakness.

Google and Samsung voices are not copied into this package. The optional Android system-speech mode requests only already-installed Japanese voices which the engine advertises as not requiring a network connection and not requiring a voice download. The engine may be unavailable; the app then falls back to bundled audio.
