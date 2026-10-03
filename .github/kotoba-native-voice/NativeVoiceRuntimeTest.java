package com.studio501.kotoba;

import static org.junit.Assert.*;
import android.app.ActivityManager;
import android.app.Instrumentation;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.UiAutomation;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Opt-in disposable guest integration QA. No UI-gesture, physical sound, secure-lock or video proof. */
@RunWith(AndroidJUnit4.class)
public final class NativeVoiceRuntimeTest {
    private static final String PACKAGE = "com.studio501.kotoba.debug";
    private static final String MARKER = "KOTOBA_NATIVE_VOICE_RUNTIME_JSON=";
    private static final int MAX_FILE_BYTES = 2 * 1024 * 1024;
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final JSONArray events = new JSONArray(), stages = new JSONArray();
    private Context context;
    private UiAutomation automation;
    private JSONObject report;
    private long started, deadline, workDeadline;
    private String lastEvent = "", homePackage = "";
    private volatile TextToSpeech tts;
    private File pcmFile;

    @Test(timeout = 220000) public void realOfflinePlaylistServiceAndKoreanPcm() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Explicit runtime opt-in required", "true".equals(args.getString("nativeVoiceRuntimeQA")));
        context = instrumentation.getTargetContext();
        assertEquals("true", args.getString("ciIsolatedEmulator"));
        assertEquals("internal_debug", BuildConfig.BUILD_STAGE);
        assertFalse(BuildConfig.SELLING_ENABLED);
        assertEquals(PACKAGE, context.getPackageName());
        assertEquals(36, Build.VERSION.SDK_INT);
        assertTrue("Disposable emulator only", "ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE));
        started = SystemClock.elapsedRealtime(); deadline = started + 180000; workDeadline = deadline - 6000;
        report = new JSONObject().put("schemaVersion", 1).put("status", "INCOMPLETE")
                .put("runtimeChecksComplete", false).put("packageName", PACKAGE).put("sdk", Build.VERSION.SDK_INT)
                .put("startRoute", "activity_integration_PlaylistService.start")
                .put("runtimeTypeObservationMethod", "own_app_service_reference_framework_getForegroundServiceType")
                .put("runtimeForegroundServiceType", 0).put("statusEvents", events).put("stageObservations", stages)
                .put("homeObservationMillis", 0).put("screenOffObservationMillis", 0)
                .put("homeAutomaticTransitionCount", 0).put("screenOffAutomaticTransitionCount", 0)
                .put("koreanSynthesisCallback", "NOT_ATTEMPTED");
        String[] flags = {"guestInternetUnavailableAtStart", "guestInternetUnavailableAtEnd", "koreanPcmVerified",
                "mainActivityResumedAtStart", "automaticJapaneseReadingObserved", "automaticKoreanMeaningObserved",
                "automaticJapaneseExampleObserved", "automaticNextEntryObserved", "ownForegroundServiceObserved",
                "runtimeMediaPlaybackTypeObserved", "activePlaylistNotificationObserved", "mediaSessionPlayingObserved",
                "homeProgressObserved", "screenOffProgressObserved", "screenOffObserved", "pausePendingIntentVerified",
                "resumePendingIntentVerified", "stopPendingIntentVerified", "serviceRemovedAfterStop", "notificationRemovedAfterStop",
                "uiGestureVerified", "physicalAudibilityVerified", "secureLockVerified", "demonstrationVideoCreated",
                "playGeneratedApkRuntimeVerified", "productionAdsVerified", "productionBillingVerified", "productionReleaseApproved",
                "accountRequirementVerified", "actualActiveEnginePackageVerified", "voiceSampleActionPerformed", "loginActionPerformed",
                "termsAcceptanceActionPerformed", "engineSelectionActionPerformed", "languageInstallActionPerformed"};
        for (String key : flags) report.put(key, false);
        ActivityScenario<MainActivity> scenario = null;
        boolean initiallyInteractive = screen().optBoolean("interactive");
        report.put("initialScreen", screen());
        try {
            automation = instrumentation.getUiAutomation();
            require(automation != null, "UiAutomation unavailable");
            require(screen().optBoolean("powerAvailable") && screen().optBoolean("keyguardAvailable"), "Screen/keyguard observations unavailable");
            report.put("guestInternetUnavailableAtStart", noInternetNetwork());
            require(report.optBoolean("guestInternetUnavailableAtStart"), "Guest has an Internet-capable network");
            require(koreanPcm(), "Korean offline PCM diagnostic incomplete");
            shutdownTts();
            JSONObject payload = realPayload();
            report.put("payloadEntryIds", new JSONArray().put("N5-1ok9x3q").put("N5-mibmyg"))
                    .put("includeMeaning", true).put("includeExample", true).put("repeat", true);
            scenario = ActivityScenario.launch(MainActivity.class);
            require(scenario.getState() == Lifecycle.State.RESUMED, "MainActivity is not RESUMED");
            AtomicReference<Boolean> shown = new AtomicReference<>(false);
            AtomicReference<Exception> launchFailure = new AtomicReference<>();
            long visibleDeadline = limit(8000);
            while (SystemClock.elapsedRealtime() < visibleDeadline) {
                scenario.onActivity(activity -> shown.set(activity.getLifecycle().getCurrentState() == Lifecycle.State.RESUMED
                        && activity.getWindow().getDecorView().isShown()));
                if (shown.get() && screen().optBoolean("interactive") && PACKAGE.equals(activeRootPackage())) break;
                SystemClock.sleep(100);
            }
            boolean visible = shown.get() && screen().optBoolean("interactive") && PACKAGE.equals(activeRootPackage());
            report.put("mainActivityResumedAtStart", visible);
            require(visible && timeLeft(), "Visible resumed app context not observed");
            scenario.onActivity(activity -> { try { PlaylistService.start(activity, payload); } catch (Exception failure) { launchFailure.set(failure); } });
            require(launchFailure.get() == null, "Actual service start rejected: " + launchFailure.get());
            require(automaticProgress(), "Required automatic reading/meaning/example/next-entry progression not observed");
            require(observeMedia("playing", PlaybackState.STATE_PLAYING), "Actual foreground type/notification/media state incomplete");
            require(automation.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME), "Home request rejected");
            ResolveInfo home = context.getPackageManager().resolveActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0);
            require(home != null && home.activityInfo != null, "Home activity did not resolve");
            homePackage = home.activityInfo.packageName;
            long homeDeadline = limit(3000);
            while (!home.activityInfo.packageName.equals(activeRootPackage()) && SystemClock.elapsedRealtime() < homeDeadline) SystemClock.sleep(100);
            report.put("homeRootPackage", bounded(activeRootPackage()));
            require(home.activityInfo.packageName.equals(activeRootPackage()), "Actual Home root not observed");
            require(backgroundProgress("home", false, scenario), "Home continuation incomplete");
            report.put("homeProgressObserved", true);
            report.put("screenOffInputAccepted", key(KeyEvent.KEYCODE_SLEEP));
            require(report.optBoolean("screenOffInputAccepted"), "Screen-off input rejected");
            long sleepDeadline = limit(3000);
            while (screen().optBoolean("interactive") && SystemClock.elapsedRealtime() < sleepDeadline) SystemClock.sleep(100);
            report.put("screenOffObserved", !screen().optBoolean("interactive"));
            require(report.optBoolean("screenOffObserved"), "Screen-off not observed");
            require(backgroundProgress("screenOff", true, scenario), "Screen-off continuation incomplete");
            report.put("screenOffProgressObserved", true);
            require(key(KeyEvent.KEYCODE_WAKEUP), "Wake input rejected");
            report.put("afterWakeScreen", screen()); // A wake event is not an unlock or secure-lock proof.
            PendingIntent pause = actualAction("일시정지");
            require(pause != null, "Actual notification pause PendingIntent unavailable");
            report.put("pausePendingIntentAttempted", true); pause.send();
            require(awaitPlaying(false, PlaybackState.STATE_PAUSED), "Pause PendingIntent did not produce paused service/media state");
            report.put("pausePendingIntentVerified", true);
            PendingIntent resume = actualAction("재생");
            require(resume != null, "Actual notification resume PendingIntent unavailable; rendered SystemUI behavior not established");
            report.put("resumePendingIntentAttempted", true); resume.send();
            require(awaitPlaying(true, PlaybackState.STATE_PLAYING), "Resume PendingIntent did not produce playing service/media state");
            require(resumedProgress(), "No callback-driven progress after resume PendingIntent");
            report.put("resumePendingIntentVerified", true);
            PendingIntent stop = actualAction("정지");
            require(stop != null, "Actual notification stop PendingIntent unavailable");
            report.put("stopPendingIntentAttempted", true); stop.send();
            require(awaitRemoved(limit(5000)), "Stop PendingIntent did not remove own service/notification");
            report.put("stopPendingIntentVerified", true);
            report.put("guestInternetUnavailableAtEnd", noInternetNetwork());
            require(report.optBoolean("guestInternetUnavailableAtEnd") && timeLeft(), "Network isolation or global budget changed");
            report.put("runtimeChecksComplete", true).put("status", "RUNTIME_CHECKS_PASSED");
        } catch (Exception failure) {
            report.put("status", "INCOMPLETE").put("runtimeChecksComplete", false)
                    .put("stopReason", bounded(failure.getClass().getSimpleName() + ": " + failure.getMessage()));
        } finally {
            try {
                instrumentation.runOnMainSync(() -> PlaylistService.control("stop"));
                report.put("finallyStopRequested", true);
                report.put("finallyServiceAndNotificationRemoved", awaitRemoved(Math.min(deadline, SystemClock.elapsedRealtime() + 5000)));
                shutdownTts();
                if (pcmFile != null && pcmFile.exists() && !pcmFile.delete()) incomplete("Temporary PCM cleanup failed");
                if (initiallyInteractive && !screen().optBoolean("interactive") && automation != null)
                    report.put("finallyWakeInputAccepted", key(KeyEvent.KEYCODE_WAKEUP));
                long wakeDeadline = Math.min(deadline, SystemClock.elapsedRealtime() + 2000);
                while (initiallyInteractive && !screen().optBoolean("interactive") && SystemClock.elapsedRealtime() < wakeDeadline) SystemClock.sleep(100);
                report.put("finalScreen", screen()).put("guestInternetUnavailableAtEnd", noInternetNetwork());
                report.put("initialInteractiveStateRestored", !initiallyInteractive || screen().optBoolean("interactive"));
                if (scenario != null) scenario.close();
                if (!report.optBoolean("finallyServiceAndNotificationRemoved") || !report.optBoolean("guestInternetUnavailableAtEnd")
                        || !report.optBoolean("initialInteractiveStateRestored"))
                    incomplete("Final cleanup or network isolation incomplete");
            } catch (Exception cleanup) { incomplete("Cleanup: " + cleanup.getClass().getSimpleName()); }
            report.put("elapsedMs", SystemClock.elapsedRealtime() - started);
            if (SystemClock.elapsedRealtime() > deadline) incomplete("Global 180-second budget exceeded");
            while (report.toString().length() > 19000 && events.length() > 1) { events.remove(1); report.put("statusEventsTruncated", true); }
            assertTrue("Runtime diagnostic exceeds stream bound", report.toString().length() <= 20000);
            Bundle stream = new Bundle(); stream.putString("stream", "\n" + MARKER + report + "\n"); instrumentation.sendStatus(0, stream);
        }
    }

    private boolean koreanPcm() throws Exception {
        CountDownLatch initialized = new CountDownLatch(1); AtomicInteger initStatus = new AtomicInteger(TextToSpeech.ERROR);
        instrumentation.runOnMainSync(() -> tts = new TextToSpeech(context, status -> { initStatus.set(status); initialized.countDown(); }));
        boolean callback = initialized.await(Math.max(0, Math.min(8000, workDeadline - SystemClock.elapsedRealtime())), TimeUnit.MILLISECONDS);
        report.put("koreanInitCallbackReceived", callback).put("koreanInitStatus", initStatus.get());
        if (tts == null || !callback || initStatus.get() != TextToSpeech.SUCCESS || !timeLeft()) return false;
        report.put("configuredDefaultEngine", bounded(tts.getDefaultEngine()));
        if (!"com.google.android.tts".equals(tts.getDefaultEngine())) return false;
        Set<Voice> voices = tts.getVoices(); Voice selected = null; int ja = 0, ko = 0;
        if (voices == null || voices.size() > 1024) return false;
        for (Voice voice : voices) {
            if (!timeLeft() || voice == null || voice.getLocale() == null || voice.getFeatures() == null) return false;
            if (voice.isNetworkConnectionRequired() || voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
            String language = voice.getLocale().getLanguage();
            if ("ja".equals(language)) ja++;
            if ("ko".equals(language)) { ko++; if (selected == null || voice.getQuality() > selected.getQuality()) selected = voice; }
        }
        report.put("runtimeVoiceInventoryComplete", true).put("runtimeVoiceCount", voices.size())
                .put("offlineJapaneseVoiceCount", ja).put("offlineKoreanVoiceCount", ko);
        if (ja == 0 || selected == null || !noInternetNetwork()) return false;
        report.put("selectedKoreanVoice", bounded(selected.getName()));
        if (tts.setVoice(selected) != TextToSpeech.SUCCESS) return false;
        CountDownLatch completed = new CountDownLatch(1); AtomicReference<String> status = new AtomicReference<>("TIMEOUT");
        String id = "kotoba-runtime-korean-pcm";
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utterance) { }
            @Override public void onDone(String utterance) { finish(utterance, "DONE"); }
            @Override public void onError(String utterance) { finish(utterance, "ERROR"); }
            @Override public void onError(String utterance, int code) { finish(utterance, "ERROR_" + code); }
            @Override public void onStop(String utterance, boolean interrupted) { finish(utterance, "STOPPED"); }
            private void finish(String utterance, String value) { if (id.equals(utterance)) { status.set(value); completed.countDown(); } }
        });
        pcmFile = File.createTempFile("kotoba-runtime-ko-", ".wav", context.getCacheDir());
        report.put("koreanSynthesisAttempted", true);
        int accepted = tts.synthesizeToFile("학교에 갑니다. 산 위에서 강이 보입니다.", new Bundle(), pcmFile, id);
        report.put("koreanSynthesisRequestStatus", accepted);
        boolean done = accepted == TextToSpeech.SUCCESS && completed.await(Math.max(0, Math.min(30000, workDeadline - SystemClock.elapsedRealtime())), TimeUnit.MILLISECONDS);
        report.put("koreanSynthesisCallback", status.get());
        if (!done || !"DONE".equals(status.get()) || !timeLeft()) return false;
        JSONObject pcm = inspectPcm(pcmFile); report.put("koreanPcm", pcm);
        boolean valid = pcm.optBoolean("pcmDataNonempty") && pcm.optBoolean("signalNonSilent") && noInternetNetwork();
        report.put("koreanPcmVerified", valid); return valid;
    }

    private JSONObject realPayload() throws Exception {
        JSONArray words = assetJson("www/data/N5.json").getJSONArray("words");
        JSONArray examples = assetJson("www/data/examples.json").getJSONArray("entries"), rows = new JSONArray();
        for (String id : new String[]{"N5-1ok9x3q", "N5-mibmyg"}) {
            JSONObject found = null;
            for (int i = 0; i < words.length(); i++) if (id.equals(words.getJSONObject(i).optString("id"))) { require(found == null, "Duplicate actual word ID"); found = words.getJSONObject(i); }
            require(found != null && !found.optString("meaning").isEmpty(), "Actual word asset unavailable");
            String example = "";
            for (int i = 0; i < examples.length(); i++) {
                JSONObject entry = examples.getJSONObject(i); JSONArray targets = entry.optJSONArray("targets");
                if (targets != null) for (int j = 0; j < targets.length(); j++) if (found.getString("word").equals(targets.optString(j))) { example = entry.optString("ja"); break; }
                if (!example.isEmpty()) break;
            }
            require(!example.isEmpty(), "Actual example asset unavailable");
            rows.put(new JSONObject().put("wordId", id).put("word", found.getString("word"))
                    .put("reading", found.getString("reading")).put("meaning", found.getString("meaning")).put("example", example));
        }
        return new JSONObject().put("entries", rows).put("includeMeaning", true).put("includeExample", true).put("repeat", true).put("rate", .8);
    }

    private JSONObject assetJson(String path) throws Exception {
        try (InputStream input = context.getAssets().open(path); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int read;
            while ((read = input.read(buffer)) != -1) { require(output.size() + read <= 1024 * 1024 && timeLeft(), "Asset read bound exceeded"); output.write(buffer, 0, read); }
            return new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
        }
    }

    private boolean automaticProgress() throws Exception {
        long until = limit(45000); int phase = 0;
        while (SystemClock.elapsedRealtime() < until) {
            JSONObject state = state("automatic");
            if (!state.optString("error").isEmpty()) return false;
            if (state.optBoolean("playing") && state.optInt("total") == 2) {
                int index = state.optInt("index", -1), part = state.optInt("part", -1);
                if (phase == 0 && index == 0 && part == 0) { report.put("automaticJapaneseReadingObserved", true); phase = 1; }
                else if (phase == 1 && index == 0 && part == 1) { report.put("automaticKoreanMeaningObserved", true); phase = 2; }
                else if (phase == 2 && index == 0 && part == 2) { report.put("automaticJapaneseExampleObserved", true); phase = 3; }
                else if (phase == 3 && index == 1 && part == 0) { report.put("automaticNextEntryObserved", true); return noInternetNetwork(); }
            }
            SystemClock.sleep(100);
        }
        return false;
    }

    private boolean backgroundProgress(String stage, boolean screenOff, ActivityScenario<MainActivity> scenario) throws Exception {
        long begin = SystemClock.elapsedRealtime(), until = begin + 10000;
        require(until < workDeadline, "Insufficient background observation budget");
        JSONObject initial = state(stage); String previous = progressKey(initial); int transitions = 0;
        JSONObject row = new JSONObject().put("stage", stage).put("startScreen", screen()).put("startState", initial)
                .put("startActivityState", scenario.getState().name());
        stages.put(row);
        while (SystemClock.elapsedRealtime() < until) {
            JSONObject current = state(stage);
            if (!current.optBoolean("playing") || current.optInt("total") != 2 || !current.optString("error").isEmpty()
                    || !ownForeground() || !noInternetNetwork() || (screenOff && screen().optBoolean("interactive"))) return false;
            if (current.optInt("index", -1) < 0 || current.optInt("index", -1) > 1 || current.optInt("part", -1) < 0 || current.optInt("part", -1) > 2) return false;
            if (scenario.getState() == Lifecycle.State.RESUMED || (!screenOff && (!screen().optBoolean("interactive") || !homePackage.equals(activeRootPackage())))) return false;
            String next = progressKey(current); if (!previous.equals(next)) { transitions++; previous = next; }
            SystemClock.sleep(100);
        }
        long elapsed = SystemClock.elapsedRealtime() - begin;
        JSONObject endScreen = screen(), endState = state(stage); Lifecycle.State endActivityState = scenario.getState();
        row.put("elapsedMs", elapsed).put("transitions", transitions).put("endScreen", endScreen).put("endState", endState)
                .put("endActivityState", endActivityState.name());
        report.put(stage + "ObservationMillis", elapsed).put(stage + "AutomaticTransitionCount", transitions);
        report.put(stage + "Screen", endScreen);
        boolean finalContext = endActivityState != Lifecycle.State.RESUMED && endScreen.optBoolean("powerAvailable")
                && endScreen.optBoolean("keyguardAvailable") && (screenOff ? !endScreen.optBoolean("interactive")
                : endScreen.optBoolean("interactive") && homePackage.equals(activeRootPackage()));
        boolean finalState = endState.optBoolean("playing") && endState.optInt("total") == 2 && endState.optString("error").isEmpty()
                && endState.optInt("index", -1) >= 0 && endState.optInt("index", -1) <= 1
                && endState.optInt("part", -1) >= 0 && endState.optInt("part", -1) <= 2;
        return transitions > 0 && elapsed >= 10000 && finalContext && finalState && noInternetNetwork()
                && observeMedia(stage, PlaybackState.STATE_PLAYING);
    }

    private JSONObject state(String stage) throws Exception {
        AtomicReference<JSONObject> value = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> { try { value.set(new JSONObject(PlaylistService.status().toString())); } catch (Exception unavailable) { value.set(new JSONObject()); } });
        JSONObject raw = value.get();
        JSONObject boundedState = new JSONObject().put("playing", raw.optBoolean("playing")).put("index", raw.optInt("index", -1))
                .put("part", raw.optInt("part", -1)).put("total", raw.optInt("total", -1)).put("error", bounded(raw.optString("error"))).put("word", bounded(raw.optString("word")));
        String fingerprint = boundedState.toString();
        if (!fingerprint.equals(lastEvent)) { lastEvent = fingerprint; if (events.length() < 64) events.put(new JSONObject(boundedState.toString()).put("stage", stage).put("elapsedMs", SystemClock.elapsedRealtime() - started)); else report.put("statusEventsTruncated", true); }
        return boundedState;
    }

    private boolean ownForeground() {
        ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        if (manager == null) return false;
        for (ActivityManager.RunningServiceInfo info : manager.getRunningServices(100))
            if (info.service.getPackageName().equals(PACKAGE) && info.service.getClassName().equals(PlaylistService.class.getName())) return info.foreground;
        return false;
    }

    private int actualType() throws Exception {
        AtomicInteger result = new AtomicInteger(-1); AtomicReference<Exception> error = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            try {
                // Read only our app's reference. Public framework getter supplies the actual service type.
                Field field = PlaylistService.class.getDeclaredField("active"); field.setAccessible(true); Object active = field.get(null);
                if (active != null && active.getClass() == PlaylistService.class && PACKAGE.equals(((Service) active).getPackageName())
                        && ((Service) active).getApplicationInfo().uid == context.getApplicationInfo().uid) result.set(((Service) active).getForegroundServiceType());
            } catch (Exception failure) { error.set(failure); }
        });
        if (error.get() != null) throw error.get(); return result.get();
    }

    private StatusBarNotification notice() {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        StatusBarNotification found = null;
        if (manager == null) return null;
        for (StatusBarNotification item : manager.getActiveNotifications()) if (PACKAGE.equals(item.getPackageName()) && item.getUid() == context.getApplicationInfo().uid
                && item.getId() == 410 && "kotoba-listening".equals(item.getNotification().getChannelId())) { if (found != null) return null; found = item; }
        return found;
    }

    private MediaController controller(StatusBarNotification notice) {
        if (notice == null) return null;
        MediaSession.Token token = notice.getNotification().extras.getParcelable(Notification.EXTRA_MEDIA_SESSION, MediaSession.Token.class);
        if (token == null) return null;
        MediaController controller = new MediaController(context, token);
        return PACKAGE.equals(controller.getPackageName()) && "KotobaPlaylist".equals(controller.getTag()) ? controller : null;
    }

    private boolean observeMedia(String stage, int expected) throws Exception {
        StatusBarNotification notice = notice(); MediaController controller = controller(notice); PlaybackState playback = controller == null ? null : controller.getPlaybackState();
        boolean foreground = ownForeground(); int type = actualType();
        boolean typed = type == ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
        boolean activeNotice = notice != null && (notice.getNotification().flags & Notification.FLAG_FOREGROUND_SERVICE) != 0;
        boolean playing = playback != null && playback.getState() == PlaybackState.STATE_PLAYING;
        JSONArray actions = new JSONArray();
        if (notice != null && notice.getNotification().actions != null) for (Notification.Action action : notice.getNotification().actions)
            if (actions.length() < 8) actions.put(new JSONObject().put("title", bounded(String.valueOf(action.title))).put("creatorPackage", action.actionIntent == null ? "" : bounded(action.actionIntent.getCreatorPackage())));
        stages.put(new JSONObject().put("stage", stage).put("ownForeground", foreground).put("frameworkServiceType", type)
                .put("activePlaylistNotification", activeNotice).put("mediaPlaybackState", playback == null ? -1 : playback.getState()).put("notificationActions", actions)
                .put("mediaTitle", controller == null || controller.getMetadata() == null ? "" : bounded(controller.getMetadata().getString(android.media.MediaMetadata.METADATA_KEY_TITLE))));
        if (foreground) report.put("ownForegroundServiceObserved", true);
        if (typed) report.put("runtimeMediaPlaybackTypeObserved", true).put("runtimeForegroundServiceType", type);
        if (activeNotice) report.put("activePlaylistNotificationObserved", true);
        if (playing) report.put("mediaSessionPlayingObserved", true);
        return foreground && typed && activeNotice && playback != null && playback.getState() == expected;
    }

    private PendingIntent actualAction(String title) throws Exception {
        StatusBarNotification item = notice(); PendingIntent found = null; JSONArray labels = new JSONArray();
        if (item != null && item.getNotification().actions != null) for (Notification.Action action : item.getNotification().actions) {
            labels.put(bounded(String.valueOf(action.title)));
            if (action.title != null && title.contentEquals(action.title) && action.actionIntent != null && PACKAGE.equals(action.actionIntent.getCreatorPackage())
                    && action.actionIntent.getCreatorUid() == context.getApplicationInfo().uid && action.actionIntent.isService() && action.actionIntent.isImmutable()) { if (found != null) return null; found = action.actionIntent; }
        }
        stages.put(new JSONObject().put("stage", "pending_intent_lookup").put("requestedTitle", title).put("actualTitles", labels)); return found;
    }

    private boolean awaitPlaying(boolean playing, int mediaState) throws Exception {
        long until = limit(5000), observedSince = -1;
        while (SystemClock.elapsedRealtime() < until) {
            JSONObject state = state(playing ? "resume" : "pause");
            MediaController media = controller(notice()); PlaybackState playback = media == null ? null : media.getPlaybackState();
            if (!state.optString("error").isEmpty()) return false;
            boolean matched = state.optBoolean("playing") == playing && playback != null && playback.getState() == mediaState && ownForeground() && noInternetNetwork();
            if (matched) { if (observedSince < 0) observedSince = SystemClock.elapsedRealtime(); if (SystemClock.elapsedRealtime() - observedSince >= 300) return true; }
            else observedSince = -1;
            SystemClock.sleep(100);
        }
        return false;
    }

    private boolean resumedProgress() throws Exception {
        String previous = progressKey(state("resume_progress")); long until = limit(8000);
        while (SystemClock.elapsedRealtime() < until) {
            JSONObject current = state("resume_progress");
            if (!current.optBoolean("playing") || !current.optString("error").isEmpty() || !ownForeground() || !noInternetNetwork()) return false;
            if (!previous.equals(progressKey(current))) return true;
            SystemClock.sleep(100);
        }
        return false;
    }

    private boolean awaitRemoved(long until) throws Exception {
        do {
            boolean serviceGone = !ownForeground() && actualType() == -1, noticeGone = notice() == null;
            if (serviceGone) report.put("serviceRemovedAfterStop", true);
            if (noticeGone) report.put("notificationRemovedAfterStop", true);
            if (serviceGone && noticeGone) return true;
            if (SystemClock.elapsedRealtime() >= until) break;
            SystemClock.sleep(100);
        } while (true);
        return false;
    }

    private JSONObject screen() throws Exception {
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        KeyguardManager keyguard = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        return new JSONObject().put("powerAvailable", power != null).put("keyguardAvailable", keyguard != null).put("interactive", power != null && power.isInteractive())
                .put("keyguardLocked", keyguard != null && keyguard.isKeyguardLocked()).put("deviceLocked", keyguard != null && keyguard.isDeviceLocked());
    }

    private String activeRootPackage() {
        AccessibilityNodeInfo root = automation.getRootInActiveWindow(); if (root == null) return "";
        try { return root.getPackageName() == null ? "" : root.getPackageName().toString(); } finally { root.recycle(); }
    }

    private boolean key(int code) {
        long now = SystemClock.uptimeMillis();
        boolean down = automation.injectInputEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0), true);
        boolean up = automation.injectInputEvent(new KeyEvent(now, SystemClock.uptimeMillis(), KeyEvent.ACTION_UP, code, 0), true); return down && up;
    }

    private boolean noInternetNetwork() {
        ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        for (Network network : manager.getAllNetworks()) { NetworkCapabilities capabilities = manager.getNetworkCapabilities(network); if (capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false; }
        return true;
    }
    private long limit(long duration) { return Math.min(workDeadline, SystemClock.elapsedRealtime() + duration); }
    private boolean timeLeft() { return SystemClock.elapsedRealtime() < workDeadline; }
    private String progressKey(JSONObject state) { return state.optInt("index", -1) + ":" + state.optInt("part", -1); }
    private void require(boolean condition, String reason) throws Exception { if (!condition) throw new Exception(reason); }
    private void incomplete(String reason) throws Exception { report.put("status", "INCOMPLETE").put("runtimeChecksComplete", false).put("cleanupReason", bounded(reason)); }
    private static String bounded(String value) { return value == null ? "" : value.substring(0, Math.min(value.length(), 96)); }
    private void shutdownTts() { TextToSpeech current = tts; tts = null; if (current != null) { current.stop(); current.shutdown(); } }

    /** Same strict bounded RIFF/WAVE integer PCM inspection as the separate Japanese preflight. */
    private static JSONObject inspectPcm(File file) throws Exception {
        long size = file.length();
        JSONObject result = new JSONObject().put("fileBytes", size).put("pcmDataNonempty", false).put("signalNonSilent", false);
        if (size < 44 || size > MAX_FILE_BYTES) return result.put("reason", "File size outside diagnostic bounds");
        byte[] bytes = Files.readAllBytes(file.toPath());
        ByteBuffer wave = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        if (!fourcc(bytes, 0, "RIFF") || !fourcc(bytes, 8, "WAVE")
                || Integer.toUnsignedLong(wave.getInt(4)) + 8 != bytes.length) return result.put("reason", "Not a complete RIFF/WAVE file");
        int channels = 0, rate = 0, bits = 0, alignment = 0, dataStart = -1, dataSize = 0;
        boolean pcm = false;
        int offset = 12;
        for (; offset + 8 <= bytes.length;) {
            long length = Integer.toUnsignedLong(wave.getInt(offset + 4));
            long end = offset + 8L + length;
            if (end + (length & 1) > bytes.length) return result.put("reason", "Truncated WAV chunk or padding");
            if (fourcc(bytes, offset, "fmt ") && length >= 16) {
                pcm = Short.toUnsignedInt(wave.getShort(offset + 8)) == 1;
                channels = Short.toUnsignedInt(wave.getShort(offset + 10));
                rate = wave.getInt(offset + 12);
                alignment = Short.toUnsignedInt(wave.getShort(offset + 20));
                bits = Short.toUnsignedInt(wave.getShort(offset + 22));
            } else if (fourcc(bytes, offset, "data") && dataStart < 0) { dataStart = offset + 8; dataSize = (int) length; }
            offset = (int) (end + (length & 1));
        }
        if (offset != bytes.length) return result.put("reason", "Incomplete trailing WAV chunk header");
        result.put("channels", channels).put("sampleRate", rate).put("bitsPerSample", bits).put("dataBytes", dataSize);
        if (!pcm || channels < 1 || channels > 8 || rate <= 0 || rate > 192000
                || !(bits == 8 || bits == 16 || bits == 24 || bits == 32)
                || alignment != channels * (bits / 8) || dataStart < 0 || dataSize <= 0 || dataSize % alignment != 0)
            return result.put("reason", "Unsupported or incomplete integer PCM");
        boolean signal = false;
        for (int i = dataStart; i < dataStart + dataSize; i++) {
            if ((bits == 8 && (bytes[i] & 255) != 128) || (bits != 8 && bytes[i] != 0)) { signal = true; break; }
        }
        return result.put("pcmDataNonempty", true).put("signalNonSilent", signal).put("frameCount", dataSize / alignment);
    }
    private static boolean fourcc(byte[] bytes, int offset, String expected) {
        if (offset < 0 || offset + 4 > bytes.length) return false;
        for (int i = 0; i < 4; i++) if ((bytes[offset + i] & 255) != expected.charAt(i)) return false;
        return true;
    }
}
