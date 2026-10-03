# Kotoba Android service integration

This branch contains Android handwriting recognition, Japanese TTS, file backup and trusted-origin WebView integration for the v0.3 curriculum app. It is not a published application or an APK download.

CI compiles native API calls against Android 36, AndroidX WebKit 1.14 and ML Kit Digital Ink 19.0.0. Compilation does not establish handwriting accuracy or physical-device behavior. The complete web app/data bundle is supplied separately in the conversation's v0.3 source archive and must be synced to app/src/main/assets/www before installing a debug build.

Recognition sees the user's strokes only, not the expected answer. The frontend compares the first recognized candidate with the exact target character. First use requires an explicit Japanese model download. No microphone or camera permission is requested.

Release builds require complete vocabulary assets and explicit physical-device, editorial, privacy, signing and testing approvals. Do not create approvals without conducting those checks.
