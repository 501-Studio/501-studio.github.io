# JLPT 단어장 - 코토바 Android integration — 0.4.2

Source review date: 2026-10-03. The app wraps APK-local learning assets in a trusted-origin WebView and provides installed Japanese TTS, file backup/restore, reminders, background word playback, advertising consent and Google Play commerce. This source prepares a release; it does not establish Play publication or production approval.

Configuration: `com.studio501.kotoba`, minSdk 24, compileSdk/targetSdk 36. Debug builds use `.debug` and `-internal` suffixes. Dependencies include AndroidX WebKit 1.14.0, Google Mobile Ads 25.4.0, UMP 4.0.0 and Billing Library 9.1.0. INTERNET and ACCESS_NETWORK_STATE support advertising and commerce. The app manifest does not request microphone, camera, contacts or precise location permissions.

Handwriting practice compares bundled stroke geometry in the web app. The current project does not depend on ML Kit Digital Ink or download a handwriting recognition model, and does not establish general handwriting recognition accuracy.

## Speech and offline learning

Vocabulary, meanings, examples and stroke data are bundled. No prerecorded Ogg files or audio fallback are shipped. Speech uses an installed Japanese TTS voice that reports offline availability; uninstalled voices and voices requiring a network are excluded. Without a suitable voice, playback fails with a setup message rather than using online speech or marking listening successful. Voice installation may require internet access. Quality, Japanese readings and long background playback require physical-device verification.

## Build and checks

Use Node 22, Python 3, Java 17, Android SDK 36 and Gradle 8.13. From `jlpt-quest`, run `npm test`, `node scripts/verify-bundled-assets.mjs` and `npm run android:sync`. From `kotoba-android`, run:

```sh
gradle --no-daemon assembleDebug bundleDebug assembleDebugAndroidTest testDebugUnitTest lintDebug
```

Browser suites and Android instrumentation also verify lesson recreation, playback lifecycle and tutorial state. A debug APK/AAB is an internal artifact, not a signed production release. `npm run release:check` reports missing evidence; its failure does not permit manufacturing approvals.

## Production configuration

Defaults use Google test ad IDs and disable sales. Product and existing purchase queries may still connect to Google Play. Purchase and restore actions require configured sales, an HTTPS verification endpoint and an entitlement public key. `billing-server/` is not deployed and does not implement authenticated RTDN, durable token ownership or refund synchronization.

Release builds require actual AdMob IDs, verified commerce infrastructure, upload signing, content/policy evidence, physical-device QA, Play App Signing and account testing. Record approval only after completing each check. Display name: Studio 501; support: 501.dingerlab@gmail.com. The requested release country is Korea and intended audience is ages 13 and older. Non-personalized/G-rated ads alone do not certify youth privacy or consent compliance; verify final under-age-of-consent settings and actual content suitability. If the actual app targets children, review Families requirements as well. See `jlpt-quest/release/GOOGLE_PLAY_RELEASE_AUDIT.md` and `PLAY_CONSOLE_FIELDS_KO.md` for confirmed operator information and remaining requirements.
