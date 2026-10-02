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

Debug builds use Google test ad IDs. Production IDs are read from `jlpt-quest/release/admob-production.json`, whose account review remains pending. Sales default to disabled. Product and existing purchase queries may still connect to Google Play. Purchase and restore actions require configured sales, an HTTPS verification endpoint, an entitlement public key, a Google OAuth client and a Play Integrity project. `billing-server/` implements authenticated RTDN, encrypted durable ownership and refund synchronization, but has not been deployed or connected to real Google credentials.

## Signed Play testing bundles

The `.debug` package cannot establish the real app's Play App Signing certificate or test real product ownership. Build the separate `playTest` variant with package `com.studio501.kotoba` to begin Play's internal testing before production QA is complete. It inherits release optimization, is not debuggable, and retains `-play-test` plus manifest metadata `com.studio501.kotoba.BUILD_STAGE` for artifact inspection. Production gates still apply to `bundleRelease`.

Supply `KOTOBA_UPLOAD_KEYSTORE`, `KOTOBA_UPLOAD_STORE_PASSWORD`, `KOTOBA_UPLOAD_KEY_ALIAS` and `KOTOBA_UPLOAD_KEY_PASSWORD` through a private local environment or secret store. Preserve the upload key securely; do not put keys, passwords or secret environment files in Git or command-line arguments. Set a new `KOTOBA_VERSION_CODE` for each uploaded bundle.

Choose `KOTOBA_PLAY_TEST_STAGE=bootstrap` explicitly for initial Play App Signing setup. This forces Google sample ads and disables sales, identity and verification configuration even if production environment values are present. Once Play provides the app signing certificate, configure Integrity with that certificate (not the upload certificate), OAuth, the server and test products. Then choose `KOTOBA_PLAY_TEST_STAGE=sandbox` and the commerce environment above to test purchases and restores. Both stages use Google sample ad IDs.

```sh
gradle --no-daemon bundlePlayTest
```

Distribute these bundles only through internal testing. Confirm every purchaser is a Google Play license tester and selects a test payment method; an internal track by itself does not prevent real charges. Test success is evidence, not a production approval. Play Console permits promotion of test bundles, so inspect the actual final bundle's stage, sample IDs and purchase configuration before production submission. Only a `production` bundle built after all recorded gates pass may be submitted for the requested release.

References: [Android build variants](https://developer.android.com/build/build-variants), [Play App Signing](https://developer.android.com/studio/publish/app-signing), [billing test accounts](https://developer.android.com/google/play/billing/test).

Release builds require actual AdMob IDs, verified commerce infrastructure, upload signing, content/policy evidence, physical-device QA, Play App Signing and account testing. Record approval only after completing each check. Display name: Studio 501; support: 501.dingerlab@gmail.com. The requested release country is Korea and intended audience is ages 13 and older. Non-personalized/G-rated ads alone do not certify youth privacy or consent compliance; verify final under-age-of-consent settings and actual content suitability. If the actual app targets children, review Families requirements as well. See `jlpt-quest/release/GOOGLE_PLAY_RELEASE_AUDIT.md` and `PLAY_CONSOLE_FIELDS_KO.md` for confirmed operator information and remaining requirements.
