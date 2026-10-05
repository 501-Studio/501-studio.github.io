package com.studio501.kotoba;

import static org.junit.Assert.*;
import android.app.ActivityManager;
import android.app.Instrumentation;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.app.UiAutomation;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.os.PowerManager;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.system.StructPollfd;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

/** CI-only, opt-in, fresh guest: inspect targets, inject real touches, then observe own service.
 * No DOM mutation/click, Accessibility ACTION_CLICK, PendingIntent send or bridge/service start.
 * Recorder markers only synchronize an independent host capture; they do not prove video/audio.
 */
@RunWith(AndroidJUnit4.class)
public final class NativeVoiceUiDemoTest {
    private static final String PACKAGE = "com.studio501.kotoba.debug", SYSTEM_UI = "com.android.systemui";
    private static final String READY = "voice-ui-demo-ready.json", ACK = "voice-ui-demo-recording-started.txt";
    private static final String END = "voice-ui-demo-recording-end.json", REPORT = "voice-ui-demo-report.json";
    private static final String MARKER = "KOTOBA_NATIVE_VOICE_UI_DEMO_JSON=";
    private static final int MAX_SCAN = 450, MAX_REPORT_CHARS = 48000, MAX_FILE_BYTES = 512 * 1024;
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final JSONArray gestures = new JSONArray(), events = new JSONArray(), stages = new JSONArray(), trees = new JSONArray();
    private final List<String> selectedWords = new ArrayList<>();
    private Context context;
    private UiAutomation automation;
    private ActivityScenario<MainActivity> scenario;
    private JSONObject report;
    private long started, workDeadline;
    private int displayWidth, displayHeight, inlineTreeChars, treeSequence;
    private String nonce, lastState = "", stage = "guard", homePackage = "";

    @Test(timeout = 300000) public void actualUiGestureForegroundListeningDemo() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Explicit UI demo opt-in required", "true".equals(args.getString("nativeVoiceUiDemo")));
        context = instrumentation.getTargetContext();
        assertEquals("true", args.getString("ciIsolatedEmulator"));
        assertEquals("internal_debug", BuildConfig.BUILD_STAGE);
        assertTrue("Real native age choice required", BuildConfig.ADS_ENABLED);
        assertFalse(BuildConfig.SELLING_ENABLED);
        assertEquals(PACKAGE, context.getPackageName());
        assertEquals(36, Build.VERSION.SDK_INT);
        assertTrue("Disposable emulator only", "ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE));
        started = SystemClock.elapsedRealtime(); workDeadline = started + 245000; nonce = UUID.randomUUID().toString();
        report = new JSONObject().put("schemaVersion", 1).put("packageName", PACKAGE).put("sdk", Build.VERSION.SDK_INT)
                .put("status", "INCOMPLETE").put("nonce", nonce).put("startRoute", "actual_ui_touch_web_bridge")
                .put("runtimeTypeObservationMethod", "own_app_service_reference_framework_getForegroundServiceType")
                .put("gestures", gestures).put("statusEvents", events).put("stageObservations", stages).put("uiSnapshots", trees)
                .put("homeObservationMillis", 0).put("screenOffObservationMillis", 0)
                .put("automaticTransitionCount", 0).put("homeAutomaticTransitionCount", 0).put("screenOffAutomaticTransitionCount", 0);
        for (String flag : new String[]{"freshDataVerified", "tutorialUnknownAgeNoSdkVerified", "tutorialCompletedByTouch",
                "nativeUnderFourteenChoiceVerified", "recordingStartAcknowledged", "wordSelectionByTouchVerified",
                "actualStartButtonTapVerified", "automaticProgressObserved", "homeProgressObserved", "screenOffObserved",
                "screenOffProgressObserved", "mediaPlaybackForegroundServiceObserved", "systemUiPauseTapVerified",
                "systemUiResumeTapVerified", "systemUiStopTapVerified", "serviceRemovedAfterStop", "notificationRemovedAfterStop",
                "uiGestureVerified", "finallyCleanupComplete", "cleanupUiStopTapVerified", "finallyDirectCleanupAttempted",
                "guestInternetUnavailableAtStart", "guestInternetUnavailableAtEnd", "physicalAudibilityVerified", "secureLockVerified",
                "demonstrationVideoCreated", "playGeneratedApkRuntimeVerified", "productionAdsVerified", "productionBillingVerified",
                "productionReleaseApproved", "loginActionPerformed", "termsAcceptanceActionPerformed", "engineSelectionActionPerformed",
                "languageInstallActionPerformed", "recordingMediaVolumeVerified", "guestMusicVolumeAlteredByTest"}) report.put(flag, false);
        Throwable failure = null;
        try {
            require(!context.getSharedPreferences(PlayAds.AGE_PREFS, Context.MODE_PRIVATE).contains(PlayAds.AGE_KEY), "Fresh debug app data required: saved age exists");
            for (String name : new String[]{READY, ACK, END, REPORT}) require(!file(name).exists(), "Stale demo file: " + name);
            require(!servicePresent() && notice() == null, "Fresh app must have no playlist service/notification");
            automation = instrumentation.getUiAutomation(); require(automation != null, "UiAutomation unavailable");
            JSONObject initialScreen = screen(); report.put("initialScreen", initialScreen);
            require(initialScreen.optBoolean("powerAvailable") && initialScreen.optBoolean("keyguardAvailable")
                    && initialScreen.optBoolean("interactive") && !initialScreen.optBoolean("keyguardLocked")
                    && !initialScreen.optBoolean("deviceLocked"), "An awake, unlocked disposable guest is required");
            Bitmap size = automation.takeScreenshot(); require(size != null, "Display dimensions unavailable");
            try { displayWidth = size.getWidth(); displayHeight = size.getHeight(); } finally { size.recycle(); }
            report.put("displayWidth", displayWidth).put("displayHeight", displayHeight);
            report.put("guestInternetUnavailableAtStart", noInternet()); require(noInternet(), "Guest has an Internet-capable network");
            homePackage = resolveHome(); report.put("homePackage", homePackage); require(!homePackage.isEmpty(), "System Home package unresolved");
            scenario = ActivityScenario.launch(MainActivity.class);
            stage = "tutorial";
            untilDom("document.readyState==='complete' && document.fonts.status==='loaded' && document.querySelector('.tutorial')?.dataset.step==='0'", 18000);
            until(() -> nativeAdsScreen().equals("tutorial"), 5000, "Native controller did not observe tutorial");
            verifyAds(true); report.put("freshDataVerified", true).put("tutorialUnknownAgeNoSdkVerified", true);
            for (int step = 0; step < 5; step++) {
                untilDom("document.querySelector('.tutorial')?.dataset.step==='" + step + "'", 5000);
                tapDom(step == 4 ? "[data-action=tutorial-finish]" : "[data-action=tutorial-next]", false);
            }
            untilDom("!document.querySelector('.tutorial') && (location.hash==='' || location.hash==='#home')", 8000);
            report.put("tutorialCompletedByTouch", true);
            stage = "native_age_choice";
            tapNative(new String[]{"만 14세 미만"}, false);
            tapNative(new String[]{"저장"}, false);
            verifyAds(false); report.put("nativeUnderFourteenChoiceVerified", true);
            stableHome();
            stage = "recorder_sync";
            atomic(READY, new JSONObject().put("schemaVersion", 1).put("phase", "READY_TO_RECORD").put("nonce", nonce)
                    .put("packageName", PACKAGE).put("reportFile", REPORT).put("elapsedMs", elapsed())
                    .put("setup", "actual tutorial and native under-14 touch; stable home; feature navigation not started").toString());
            awaitRecorder();
            stage = "word_selection";
            tapDom(".bottom-nav a[href='#words']", false);
            untilDom("location.hash==='#words' && document.querySelectorAll('[data-action=select-word]').length>=2", 8000);
            JSONArray chosen = dom("JSON.stringify(Array.from(document.querySelectorAll('[data-action=select-word]')).slice(0,2).map(e=>({"
                    + "id:e.dataset.id,label:e.getAttribute('aria-label')||'',word:e.closest('.wordbook-item')?.querySelector('.japanese strong')?.textContent?.trim()||''})))", true);
            require(chosen.length() == 2, "Two real word controls unavailable");
            JSONArray ids = new JSONArray();
            for (int i = 0; i < chosen.length(); i++) {
                JSONObject word = chosen.getJSONObject(i); String id = word.optString("id"), title = word.optString("word");
                require(id.matches("N[1-5]-[a-z0-9]+") && !title.isEmpty(), "Selected word identity unavailable");
                String selector = "[data-action=select-word][data-id='" + id + "']";
                tapDom(selector, true);
                untilDom("document.querySelector(" + JSONObject.quote(selector) + ")?.getAttribute('aria-pressed')==='true'", 4000);
                ids.put(id); selectedWords.add(title);
            }
            report.put("selectedWordIds", ids).put("selectedWordTitles", new JSONArray(selectedWords)).put("wordSelectionByTouchVerified", true);
            stage = "playlist_setup";
            tapDom("[data-action=hub-open][data-tab=folders]", true);
            untilDom("location.hash==='#study-hub'", 5000);
            tapDom("[data-action=hub-tab][data-tab=commute]", true);
            untilDom("!!document.querySelector('#play-repeat') && !document.querySelector('[data-action=playlist-selected]')?.disabled", 5000);
            for (String option : new String[]{"play-meaning", "play-example", "play-repeat"}) {
                if (!"true".equals(js("document.querySelector('#" + option + "')?.checked===true"))) tapDom("#" + option, true);
                untilDom("document.querySelector('#" + option + "')?.checked===true", 4000);
            }
            report.put("includeMeaning", true).put("includeExample", true).put("repeat", true);
            stage = "actual_start_button";
            require(!servicePresent() && notice() == null, "Service unexpectedly exists before actual start tap");
            report.put("mediaVolumeBeforeStart", mediaVolume());
            tapDom("[data-action=playlist-selected]", true);
            untilDom("location.hash==='#commute' && !!document.querySelector('#playlist-word')", 6000);
            awaitPlaying(15000);
            report.put("actualStartButtonTapVerified", true).put("mediaPlaybackForegroundServiceObserved", true);
            stage = "recording_media_volume";
            prepareRecordingMediaVolume();
            stage = "foreground_progress";
            observeProgress("automatic", 10000, false, false);
            report.put("automaticProgressObserved", true);
            stage = "home";
            require(key(KeyEvent.KEYCODE_HOME, "go_home"), "HOME key injection rejected");
            until(() -> homePackage.equals(activePackage()) && scenario.getState() != Lifecycle.State.RESUMED, 7000, "Home did not become foreground");
            observeProgress("home", 10000, true, false); report.put("homeProgressObserved", true);
            stage = "screen_off";
            require(key(KeyEvent.KEYCODE_SLEEP, "screen_off"), "SLEEP key injection rejected");
            until(() -> !screen().optBoolean("interactive"), 4000, "Screen did not turn off"); report.put("screenOffObserved", true);
            observeProgress("screenOff", 10000, true, true); report.put("screenOffProgressObserved", true);
            require(key(KeyEvent.KEYCODE_WAKEUP, "screen_on"), "WAKEUP key injection rejected");
            until(() -> screen().optBoolean("interactive"), 5000, "Screen did not wake");
            require(!screen().optBoolean("keyguardLocked") && !screen().optBoolean("deviceLocked"), "Locked guest: no unlock bypass permitted");
            stage = "system_ui_controls";
            openShade();
            tapMedia("pause", new String[]{"Pause", "Pause playback", "일시정지", "일시중지"}, PlaybackState.STATE_PLAYING);
            until(() -> !state("pause").optBoolean("playing") && mediaMatches(PlaybackState.STATE_PAUSED), 7000, "Pause touch did not pause own media");
            JSONObject paused = state("paused_stable"); SystemClock.sleep(1000);
            require(progressKey(paused).equals(progressKey(state("paused_stable"))) && mediaMatches(PlaybackState.STATE_PAUSED), "Paused progress changed");
            report.put("systemUiPauseTapVerified", true);
            tapMedia("resume", new String[]{"Play", "Play playback", "Resume", "재생", "다시 재생"}, PlaybackState.STATE_PAUSED);
            awaitPlaying(7000); observeProgress("resume", 10000, false, false); report.put("systemUiResumeTapVerified", true);
            tapMedia("stop", new String[]{"Stop", "Stop playback", "정지", "재생 종료"}, PlaybackState.STATE_PLAYING);
            until(() -> !servicePresent() && notice() == null, 7000, "Stop touch did not remove own service and notification");
            report.put("systemUiStopTapVerified", true).put("serviceRemovedAfterStop", !servicePresent())
                    .put("notificationRemovedAfterStop", notice() == null).put("uiGestureVerified", true);
            stage = "completed";
        } catch (Throwable error) {
            failure = error; report.put("failureStage", stage).put("failure", bounded(error.toString(), 1200));
            if (automation != null) try { saveTree("failure_" + stage, tree()); } catch (Throwable diagnostic) { report.put("diagnosticError", bounded(diagnostic.toString(), 400)); }
        } finally {
            stage = "cleanup";
            try {
                if (automation != null && !screen().optBoolean("interactive")) key(KeyEvent.KEYCODE_WAKEUP, "cleanup_wake_only");
                if (servicePresent() && automation != null && scenario != null) cleanupWithUi();
            } catch (Throwable error) { report.put("cleanupUiError", bounded(error.toString(), 500)); }
            try {
                if (servicePresent()) {
                    report.put("finallyDirectCleanupAttempted", true).put("finallyDirectCleanupPurpose", "cleanup_only_never_UI_evidence");
                    context.stopService(new Intent(context, PlaylistService.class));
                }
                long until = SystemClock.elapsedRealtime() + 5000;
                while ((servicePresent() || notice() != null) && SystemClock.elapsedRealtime() < until) SystemClock.sleep(100);
                report.put("finallyCleanupComplete", !servicePresent() && notice() == null);
            } catch (Throwable error) { report.put("finallyCleanupError", bounded(error.toString(), 500)); }
            try { if (scenario != null) scenario.close(); } catch (Throwable error) { report.put("activityCloseError", bounded(error.toString(), 400)); }
            report.put("guestInternetUnavailableAtEnd", noInternet()).put("elapsedMs", elapsed());
            if (failure == null && (!report.optBoolean("finallyCleanupComplete") || !report.optBoolean("guestInternetUnavailableAtEnd")))
                failure = new AssertionError("Final cleanup/offline observation failed");
            if (failure == null) report.put("status", "UI_CHECKS_PASSED");
            else { report.put("status", "INCOMPLETE"); if (!report.has("failure")) report.put("failure", bounded(failure.toString(), 1200)); }
            try { compactReport(); atomic(REPORT, report.toString()); }
            finally { atomic(END, new JSONObject().put("schemaVersion", 1).put("phase", "END_RECORDING").put("nonce", nonce)
                    .put("status", report.optString("status")).put("reportFile", REPORT).put("elapsedMs", elapsed()).toString()); }
            Bundle output = new Bundle(); output.putString("stream", "\n" + MARKER + report.toString() + "\n"); instrumentation.sendStatus(0, output);
        }
        if (failure != null) throw new AssertionError("Actual UI demo incomplete: " + report.optString("failure"), failure);
    }

    private interface Check { boolean ok() throws Exception; }
    private void until(Check check, long millis, String message) throws Exception {
        long until = limit(millis); do { if (check.ok()) return; SystemClock.sleep(100); } while (SystemClock.elapsedRealtime() < until);
        throw new AssertionError(message);
    }
    private void untilDom(String predicate, long millis) throws Exception { until(() -> "true".equals(js(predicate)), millis, "DOM condition failed: " + predicate); }
    private long elapsed() { return SystemClock.elapsedRealtime() - started; }
    private long limit(long millis) { require(SystemClock.elapsedRealtime() < workDeadline, "UI demo work deadline expired"); return Math.min(workDeadline, SystemClock.elapsedRealtime() + millis); }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private static String bounded(String value, int length) { return value == null ? "" : value.substring(0, Math.min(value.length(), length)); }
    private File file(String name) { return new File(context.getFilesDir(), name); }
    private void atomic(String name, String value) throws Exception {
        byte[] data = value.getBytes(StandardCharsets.UTF_8); require(data.length <= MAX_FILE_BYTES, "Bounded file size exceeded");
        File temporary = file(name + "." + nonce + ".tmp"); Files.write(temporary.toPath(), data);
        Files.move(temporary.toPath(), file(name).toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    }
    private void awaitRecorder() throws Exception {
        long until = limit(30000);
        while (SystemClock.elapsedRealtime() < until) {
            File ack = file(ACK);
            if (ack.exists()) {
                require(ack.length() <= 128, "Recorder acknowledgement too large");
                String actual = new String(Files.readAllBytes(ack.toPath()), StandardCharsets.UTF_8).trim();
                require(nonce.equals(actual), "Recorder acknowledgement nonce mismatch");
                report.put("recordingStartAcknowledged", true).put("recordingAcknowledgementElapsedMs", elapsed()); return;
            }
            SystemClock.sleep(100);
        }
        throw new AssertionError("Recorder startup acknowledgement absent after bounded 30s");
    }

    private static WebView web(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) { WebView found = web(((ViewGroup) view).getChildAt(i)); if (found != null) return found; }
        return null;
    }
    /** All callers supply inspection expressions only; user-facing actions use injected input. */
    private String js(String expression) throws Exception {
        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> { WebView view = web(activity.getWindow().getDecorView()); require(view != null, "WebView unavailable");
            view.evaluateJavascript(expression, value -> { result.set(value); done.countDown(); }); });
        require(done.await(3, TimeUnit.SECONDS), "Read-only DOM callback timed out"); return result.get();
    }
    private JSONObject domObject(String expression) throws Exception {
        Object value = new JSONTokener(js(expression)).nextValue(); require(value instanceof String, "DOM JSON unavailable"); return new JSONObject((String) value);
    }
    private JSONArray dom(String expression, boolean array) throws Exception {
        Object value = new JSONTokener(js(expression)).nextValue(); require(array && value instanceof String, "DOM array unavailable"); return new JSONArray((String) value);
    }
    private void stableHome() throws Exception {
        String predicate = "document.readyState==='complete' && document.fonts.status==='loaded' && (location.hash===''||location.hash==='#home')"
                + " && !document.querySelector('.tutorial,.modal-backdrop,.fatal,.loading') && !document.querySelector('#app')?.inert"
                + " && !document.querySelector('#toast')?.classList.contains('show')";
        untilDom(predicate, 10000); String previous = ""; long stableSince = 0, until = limit(8000);
        while (SystemClock.elapsedRealtime() < until) {
            String current = js("JSON.stringify({route:location.hash,text:document.querySelector('#main')?.innerText,width:innerWidth,height:innerHeight,scroll:scrollY})");
            if ("true".equals(js(predicate)) && current.equals(previous)) {
                if (SystemClock.elapsedRealtime() - stableSince >= 500) { verifyAds(false); require(PACKAGE.equals(activePackage()), "Home is covered by another app"); return; }
            } else { previous = current; stableSince = SystemClock.elapsedRealtime(); }
            SystemClock.sleep(100);
        }
        throw new AssertionError("App home did not stabilize");
    }
    private JSONObject domTarget(String selector) throws Exception {
        long began = SystemClock.elapsedRealtime();
        JSONObject target = domObject("JSON.stringify((()=>{const all=document.querySelectorAll(" + JSONObject.quote(selector) + ");"
                + "if(all.length!==1)return {count:all.length};const e=all[0],r=e.getBoundingClientRect(),v=visualViewport,s=getComputedStyle(e);"
                + "const x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);return {count:1,label:(e.getAttribute('aria-label')||e.textContent||e.id).trim().slice(0,160),"
                + "left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,cx:x,cy:y,"
                + "viewportWidth:v?.width||innerWidth,viewportHeight:v?.height||innerHeight,offsetLeft:v?.offsetLeft||0,offsetTop:v?.offsetTop||0,scale:v?.scale||1,"
                + "enabled:!e.disabled&&!e.closest('[inert]'),visible:s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)>0&&r.width>0&&r.height>0,"
                + "hit:h===e||e.contains(h),route:location.hash||'#home'};})())");
        return target.put("readBeganElapsedMs", began).put("readCompletedElapsedMs", SystemClock.elapsedRealtime());
    }
    private JSONObject webFrame() throws Exception {
        AtomicReference<JSONObject> value = new AtomicReference<>(); AtomicReference<Exception> error = new AtomicReference<>();
        scenario.onActivity(activity -> { try { WebView view = web(activity.getWindow().getDecorView()); int[] xy = new int[2]; view.getLocationOnScreen(xy);
            value.set(new JSONObject().put("left", xy[0]).put("top", xy[1]).put("width", view.getWidth()).put("height", view.getHeight())
                    .put("focused", activity.hasWindowFocus()).put("shown", view.isShown() && view.isAttachedToWindow()));
        } catch (Exception e) { error.set(e); } });
        if (error.get() != null) throw error.get(); return value.get();
    }
    private void tapDom(String selector, boolean allowScroll) throws Exception {
        long until = limit(8000); int scrolls = 0;
        while (SystemClock.elapsedRealtime() < until) {
            JSONObject target = domTarget(selector), frame = webFrame();
            require(target.optInt("count") == 1 && target.optBoolean("enabled") && target.optBoolean("visible"), "Unique visible enabled DOM target unavailable: " + selector);
            require(frame.optBoolean("focused") && frame.optBoolean("shown") && PACKAGE.equals(activePackage()), "App touch surface not current: " + selector);
            double vw = target.optDouble("viewportWidth"), vh = target.optDouble("viewportHeight"), ox = target.optDouble("offsetLeft"), oy = target.optDouble("offsetTop");
            require(vw > 0 && vh > 0 && Math.abs(target.optDouble("scale", 0) - 1) < .01, "Unexpected DOM zoom/viewport");
            double x = target.optDouble("cx") - ox, y = target.optDouble("cy") - oy;
            if (x > 2 && x < vw - 2 && y > 2 && y < vh - 2 && target.optBoolean("hit")) {
                JSONObject current = domTarget(selector), currentFrame = webFrame();
                require(current.optInt("count") == 1 && current.optBoolean("visible") && current.optBoolean("hit") && current.optBoolean("enabled")
                        && current.optString("route").equals(target.optString("route")) && current.optString("label").equals(target.optString("label"))
                        && Math.abs(current.optDouble("cx") - target.optDouble("cx")) < 2 && Math.abs(current.optDouble("cy") - target.optDouble("cy")) < 2,
                        "DOM target changed before touch: " + selector);
                require(currentFrame.optBoolean("focused") && currentFrame.optBoolean("shown") && PACKAGE.equals(activePackage()), "Current app frame is covered");
                for (String key : new String[]{"left", "top", "width", "height"}) require(currentFrame.optInt(key) == frame.optInt(key), "WebView frame changed: " + key);
                for (String key : new String[]{"viewportWidth", "viewportHeight", "offsetLeft", "offsetTop", "scale"})
                    require(Math.abs(current.optDouble(key) - target.optDouble(key)) < .01, "DOM viewport changed: " + key);
                long age = SystemClock.elapsedRealtime() - current.optLong("readBeganElapsedMs"); require(age <= 1800, "DOM touch measurement too old");
                double currentX = current.optDouble("cx") - current.optDouble("offsetLeft"), currentY = current.optDouble("cy") - current.optDouble("offsetTop");
                float sx = (float) (currentFrame.optInt("left") + currentX * currentFrame.optInt("width") / current.optDouble("viewportWidth"));
                float sy = (float) (currentFrame.optInt("top") + currentY * currentFrame.optInt("height") / current.optDouble("viewportHeight"));
                require(sx > 1 && sx < displayWidth - 1 && sy > 1 && sy < displayHeight - 1, "DOM touch outside display");
                JSONObject evidence = new JSONObject().put("stage", stage).put("kind", "dom_touch").put("selector", selector).put("target", current).put("webFrame", currentFrame).put("snapshotAgeMs", age);
                require(touch(sx, sy, evidence), "Touch injection rejected: " + selector); SystemClock.sleep(200); return;
            }
            require(allowScroll && scrolls++ < 6, "No trustworthy current DOM touch coordinates: " + selector);
            require(x >= 0 && x <= vw, "Horizontal offscreen target: " + selector);
            boolean scrollDown = y >= vh / 2;
            float left = frame.optInt("left"), top = frame.optInt("top"), width = frame.optInt("width"), height = frame.optInt("height");
            require(swipe(left + width * .55f, top + height * (scrollDown ? .72f : .28f), left + width * .55f,
                    top + height * (scrollDown ? .32f : .68f), "app_scroll_for_target"), "App scroll injection rejected");
            SystemClock.sleep(250);
        }
        throw new AssertionError("DOM target never acquired trustworthy coordinates: " + selector);
    }
    private static Object field(Object object, String name) throws Exception { Field f = object.getClass().getDeclaredField(name); f.setAccessible(true); return f.get(object); }
    private String nativeAdsScreen() throws Exception {
        AtomicReference<String> value = new AtomicReference<>(""); AtomicReference<Exception> failure = new AtomicReference<>();
        scenario.onActivity(activity -> { try { value.set(String.valueOf(field(field(activity, "ads"), "screen"))); } catch (Exception e) { failure.set(e); } });
        if (failure.get() != null) throw failure.get(); return value.get();
    }
    private void verifyAds(boolean unknown) throws Exception {
        AtomicReference<Throwable> failure = new AtomicReference<>();
        scenario.onActivity(activity -> { try {
            PlayAds ads = (PlayAds) field(activity, "ads");
            require(((AdAgePolicy) field(ads, "age")).band() == (unknown ? AdAgePolicy.UNKNOWN : AdAgePolicy.UNDER_FOURTEEN), "Native age band unexpected");
            require(field(ads, "dialog") == null, "Native dialog still covers app");
            if (unknown) require(!activity.getSharedPreferences(PlayAds.AGE_PREFS, Context.MODE_PRIVATE).contains(PlayAds.AGE_KEY), "Unknown-age tutorial has saved age");
            else require(activity.getSharedPreferences(PlayAds.AGE_PREFS, Context.MODE_PRIVATE).getInt(PlayAds.AGE_KEY, AdAgePolicy.UNKNOWN) == AdAgePolicy.UNDER_FOURTEEN, "Under-14 touch not saved");
            require(field(ads, "consent") == null && field(ads, "banner") == null && field(ads, "full") == null, "Unexpected ad SDK/consent object");
            for (String flag : new String[]{"initialized", "initializing", "consentBusy", "loadingFull", "showing"}) require(Boolean.FALSE.equals(field(ads, flag)), "Unexpected ad work: " + flag);
        } catch (Throwable error) { failure.set(error); } });
        if (failure.get() != null) throw new AssertionError("Read-only age/ad observation failed", failure.get());
    }

    private static final class Row {
        int parent, depth; final Rect bounds = new Rect(); String pkg, text, description, id, cls;
        boolean visible, enabled, clickable;
        JSONObject json(int index) throws Exception { return new JSONObject().put("index", index).put("parent", parent).put("depth", depth).put("package", pkg)
                .put("text", text).put("description", description).put("id", id).put("class", cls).put("visible", visible).put("enabled", enabled).put("clickable", clickable)
                .put("bounds", new JSONArray().put(bounds.left).put(bounds.top).put(bounds.right).put(bounds.bottom)); }
    }
    private static final class Tree {
        final List<Row> rows = new ArrayList<>(); String rootPackage = ""; long capturedAt; boolean truncated;
    }
    private Tree tree() {
        Tree tree = new Tree(); tree.capturedAt = SystemClock.elapsedRealtime(); AccessibilityNodeInfo root = automation.getRootInActiveWindow();
        if (root == null) return tree;
        try { tree.rootPackage = String.valueOf(root.getPackageName());
            // Only the isolated app/SystemUI surfaces are exported; do not inspect account or other app windows.
            if (PACKAGE.equals(tree.rootPackage) || SYSTEM_UI.equals(tree.rootPackage)) scan(root, tree, -1, 0, tree.capturedAt + 1200);
        } finally { root.recycle(); }
        return tree;
    }
    private void scan(AccessibilityNodeInfo node, Tree tree, int parent, int depth, long deadline) {
        if (depth > 28 || tree.rows.size() >= MAX_SCAN || SystemClock.elapsedRealtime() >= deadline) { tree.truncated = true; return; }
        Row row = new Row(); row.parent = parent; row.depth = depth;
        row.pkg = bounded(String.valueOf(node.getPackageName()), 80); row.text = bounded(node.getText() == null ? "" : node.getText().toString(), 140);
        row.description = bounded(node.getContentDescription() == null ? "" : node.getContentDescription().toString(), 140);
        row.id = bounded(node.getViewIdResourceName(), 100); row.cls = bounded(String.valueOf(node.getClassName()), 100);
        row.visible = node.isVisibleToUser(); row.enabled = node.isEnabled(); row.clickable = node.isClickable(); node.getBoundsInScreen(row.bounds);
        int index = tree.rows.size(); tree.rows.add(row);
        for (int i = 0; i < node.getChildCount(); i++) {
            if (tree.rows.size() >= MAX_SCAN || SystemClock.elapsedRealtime() >= deadline) { tree.truncated = true; break; }
            AccessibilityNodeInfo child = node.getChild(i); if (child != null) try { scan(child, tree, index, depth + 1, deadline); } finally { child.recycle(); }
        }
    }
    private void saveTree(String label, Tree tree) throws Exception {
        boolean complete = !tree.truncated && !tree.rows.isEmpty() && (PACKAGE.equals(tree.rootPackage) || SYSTEM_UI.equals(tree.rootPackage));
        JSONArray full = new JSONArray(), inline = new JSONArray();
        for (int i = 0; i < tree.rows.size(); i++) full.put(compactRow(tree.rows.get(i), i));
        String name = "voice-ui-demo-ui-" + nonce + "-" + (++treeSequence) + ".json";
        JSONObject saved = new JSONObject().put("schemaVersion", 1).put("nonce", nonce).put("stage", label).put("elapsedMs", tree.capturedAt - started)
                .put("rootPackage", tree.rootPackage).put("nodesScanned", tree.rows.size()).put("scanComplete", complete).put("scanTruncated", tree.truncated)
                .put("rowsTruncated", full.length() < tree.rows.size())
                .put("columns", new JSONArray().put("index").put("parent").put("depth").put("text").put("description").put("id").put("class")
                        .put("visible").put("enabled").put("clickable").put("left").put("top").put("right").put("bottom"))
                .put("nodes", full);
        if (saved.toString().getBytes(StandardCharsets.UTF_8).length <= MAX_FILE_BYTES) { atomic(name, saved.toString()); saved.put("localSnapshotFileCreated", true); }
        else saved.put("localSnapshotFileCreated", false).put("localSnapshotFileTruncated", true).put("localSnapshotFileSkipped", "512KiB local file budget; full bounded rows retained in log chunks");
        // CI log chunks preserve the bounded tree even when the disposable guest is removed.
        List<JSONArray> nodeParts = new ArrayList<>(); JSONArray pending = new JSONArray(); int pendingChars = 0;
        for (int i = 0; i < full.length(); i++) {
            JSONArray row = full.getJSONArray(i); int size = row.toString().length() + 1;
            if (pending.length() > 0 && (pending.length() >= 20 || pendingChars + size > 15000)) { nodeParts.add(pending); pending = new JSONArray(); pendingChars = 0; }
            pending.put(row); pendingChars += size;
        }
        if (pending.length() > 0 || nodeParts.isEmpty()) nodeParts.add(pending);
        int parts = nodeParts.size();
        for (int part = 0; part < parts; part++) {
            JSONArray nodes = nodeParts.get(part);
            JSONObject chunk = new JSONObject().put("schemaVersion", 1).put("nonce", nonce).put("snapshotIndex", treeSequence)
                    .put("partIndex", part).put("partCount", parts).put("stage", label).put("rootPackage", tree.rootPackage)
                    .put("nodesScanned", tree.rows.size()).put("rowsRetained", full.length()).put("scanComplete", complete).put("scanTruncated", tree.truncated)
                    .put("rowsTruncated", full.length() < tree.rows.size()).put("columns", saved.getJSONArray("columns")).put("nodes", nodes);
            require(chunk.toString().length() <= 18000, "Snapshot chunk line budget exceeded");
            Bundle stream = new Bundle(); stream.putString("stream", "\nKOTOBA_UI_DEMO_UI_SNAPSHOT_CHUNK_JSON=" + chunk.toString() + "\n"); instrumentation.sendStatus(0, stream);
        }
        // Keep bounded current visible semantics inline; the fuller tree remains a separate guest artifact.
        for (int i = 0; i < tree.rows.size(); i++) {
            Row row = tree.rows.get(i); if (i > 5 && (!row.visible || (row.text.isEmpty() && row.description.isEmpty() && !row.clickable))) continue;
            JSONArray next = compactRow(row, i); int chars = next.toString().length();
            if (inline.length() >= 32 || inline.toString().length() + chars > 4300 || inlineTreeChars + chars > 18000) break;
            inline.put(next); inlineTreeChars += chars;
        }
        saved.remove("nodes"); saved.put("snapshotIndex", treeSequence).put("snapshotFile", saved.optBoolean("localSnapshotFileCreated") ? name : "").put("snapshotPartCount", parts)
                .put("snapshotRowsRetained", full.length()).put("inlineRowsTruncated", inline.length() < tree.rows.size()).put("nodes", inline);
        if (trees.length() < 8) trees.put(saved);
        else { report.put("uiSnapshotsTruncated", true); trees.put(7, saved); }
    }
    private JSONArray compactRow(Row row, int index) {
        return new JSONArray().put(index).put(row.parent).put(row.depth).put(row.text).put(row.description).put(row.id).put(row.cls)
                .put(row.visible).put(row.enabled).put(row.clickable).put(row.bounds.left).put(row.bounds.top).put(row.bounds.right).put(row.bounds.bottom);
    }
    private void compactReport() throws Exception {
        // Older inline trees can be shortened; independently persisted snapshot files preserve their evidence.
        for (int i = 0; report.toString().length() > MAX_REPORT_CHARS - 1000 && i < trees.length(); i++) {
            trees.getJSONObject(i).put("nodes", new JSONArray()).put("inlineRowsTruncated", true); report.put("inlineReportCompacted", true);
        }
        require(report.toString().length() <= MAX_REPORT_CHARS, "Native report character budget exceeded");
    }
    private boolean label(Row row, String[] labels) {
        for (String label : labels) if (label.equalsIgnoreCase(row.text.trim()) || label.equalsIgnoreCase(row.description.trim())) return true;
        return false;
    }
    private boolean validBounds(Row row) { return row.visible && row.enabled && row.clickable && row.bounds.width() > 4 && row.bounds.height() > 4
            && row.bounds.left >= 0 && row.bounds.top >= 0 && row.bounds.right <= displayWidth && row.bounds.bottom <= displayHeight; }
    private int nativeTarget(Tree tree, String[] labels) {
        if (!PACKAGE.equals(tree.rootPackage) || tree.truncated) return -1;
        int found = -1;
        for (int i = 0; i < tree.rows.size(); i++) if (PACKAGE.equals(tree.rows.get(i).pkg) && label(tree.rows.get(i), labels) && validBounds(tree.rows.get(i))) {
            if (found != -1) return -1; found = i;
        }
        return found;
    }
    private void tapNative(String[] labels, boolean cleanup) throws Exception {
        long until = cleanup ? SystemClock.elapsedRealtime() + 3000 : limit(8000);
        while (SystemClock.elapsedRealtime() < until) {
            Tree tree = tree(); int index = nativeTarget(tree, labels);
            if (index >= 0) {
                Row target = tree.rows.get(index); Tree fresh = tree(); int next = nativeTarget(fresh, labels);
                require(next >= 0 && fresh.rows.get(next).bounds.equals(target.bounds), "Native target changed before touch");
                long age = SystemClock.elapsedRealtime() - fresh.capturedAt; require(age <= 1800, "Native target snapshot too old");
                require(touch(target.bounds.exactCenterX(), target.bounds.exactCenterY(), new JSONObject().put("stage", stage).put("kind", "native_accessibility_touch")
                        .put("target", fresh.rows.get(next).json(next)).put("snapshotAgeMs", age).put("cleanupOnly", cleanup)), "Native touch rejected"); SystemClock.sleep(250); return;
            }
            SystemClock.sleep(100);
        }
        saveTree("native_target_absent_" + labels[0], tree()); throw new AssertionError("Native touch target absent/ambiguous: " + Arrays.toString(labels));
    }
    private boolean descendant(Tree tree, int index, int ancestor) {
        for (int cursor = index, steps = 0; cursor >= 0 && steps < 30; cursor = tree.rows.get(cursor).parent, steps++) if (cursor == ancestor) return true;
        return false;
    }
    private int ownCard(Tree tree, int action) {
        for (int card = tree.rows.get(action).parent, levels = 0; card >= 0 && levels < 8; card = tree.rows.get(card).parent, levels++) {
            Row container = tree.rows.get(card); boolean artist = false, title = false;
            if (container.bounds.width() < displayWidth * .5 || container.bounds.height() > displayHeight * .65) continue;
            for (int i = 0; i < tree.rows.size(); i++) if (descendant(tree, i, card)) {
                Row row = tree.rows.get(i); if (!row.visible) continue;
                if ("코토바 연속 듣기".equals(row.text.trim()) || "코토바 연속 듣기".equals(row.description.trim())) artist = true;
                for (String word : selectedWords) if (word.equals(row.text.trim()) || word.equals(row.description.trim())) title = true;
            }
            if (artist && title) return card;
        }
        return -1;
    }
    private int mediaTarget(Tree tree, String[] labels) {
        if (!SYSTEM_UI.equals(tree.rootPackage) || tree.truncated) return -1;
        int found = -1;
        for (int i = 0; i < tree.rows.size(); i++) { Row row = tree.rows.get(i);
            if (SYSTEM_UI.equals(row.pkg) && label(row, labels) && validBounds(row) && ownCard(tree, i) >= 0) { if (found != -1) return -1; found = i; }
        }
        return found;
    }
    private boolean ownMediaCardPresent(Tree tree) {
        if (!SYSTEM_UI.equals(tree.rootPackage) || tree.truncated) return false;
        for (int i = 0; i < tree.rows.size(); i++) {
            Row row = tree.rows.get(i);
            if (row.visible && ("코토바 연속 듣기".equals(row.text.trim()) || "코토바 연속 듣기".equals(row.description.trim()))
                    && ownCard(tree, i) >= 0) return true;
        }
        return false;
    }
    private void openShade() throws Exception {
        require(screen().optBoolean("interactive") && !screen().optBoolean("keyguardLocked"), "Notification shade requires unlocked current display");
        require(swipe(displayWidth * .5f, 2, displayWidth * .5f, displayHeight * .72f, "open_notification_shade"), "Shade swipe rejected");
        until(() -> SYSTEM_UI.equals(activePackage()), 5000, "SystemUI shade did not open"); SystemClock.sleep(500);
    }
    private void tapMedia(String action, String[] labels, int expected) throws Exception {
        require(mediaMatches(expected), "Own media state wrong before " + action + " touch");
        Tree last = null; long until = limit(8000); boolean expanded = false, reopened = false;
        while (SystemClock.elapsedRealtime() < until) {
            last = tree(); int index = mediaTarget(last, labels);
            if (index >= 0) {
                Row target = last.rows.get(index); Tree fresh = tree(); int next = mediaTarget(fresh, labels);
                require(next >= 0 && fresh.rows.get(next).bounds.equals(target.bounds) && mediaMatches(expected), "SystemUI media target/state changed before touch");
                saveTree("system_ui_before_" + action, fresh);
                JSONObject proof = new JSONObject().put("stage", stage).put("kind", "system_ui_media_touch").put("action", action)
                        .put("target", fresh.rows.get(next).json(next)).put("ownCardIndex", ownCard(fresh, next)).put("snapshotAgeMs", SystemClock.elapsedRealtime() - fresh.capturedAt);
                require(proof.optLong("snapshotAgeMs") <= 1800, "SystemUI target snapshot too old");
                require(touch(target.bounds.exactCenterX(), target.bounds.exactCenterY(), proof), "SystemUI " + action + " touch rejected"); return;
            }
            if (!expanded && ownMediaCardPresent(last)) {
                saveTree("system_ui_" + action + "_before_expansion", last);
                require(swipe(displayWidth * .5f, 3, displayWidth * .5f, displayHeight * .78f, "expand_system_ui_controls"), "SystemUI expansion swipe rejected"); expanded = true;
                SystemClock.sleep(700);
            } else if (expanded && !reopened && SYSTEM_UI.equals(last.rootPackage) && !last.truncated && !ownMediaCardPresent(last)) {
                // Expanding QS can replace the observed media-card context. Preserve that loss;
                // return by a real Back key and reopen the shade once, without invoking playback.
                saveTree("system_ui_" + action + "_own_card_context_lost", last);
                require(key(KeyEvent.KEYCODE_BACK, "return_from_expanded_quick_settings"), "QS Back key rejected");
                until(() -> homePackage.equals(activePackage()), 2500, "Back did not return to observed Home");
                openShade(); reopened = true;
            }
            SystemClock.sleep(250);
        }
        if (last != null) saveTree("system_ui_" + action + "_absent_or_ambiguous", last);
        boolean treeComplete = last != null && !last.truncated && SYSTEM_UI.equals(last.rootPackage) && !last.rows.isEmpty();
        boolean ownCardObserved = treeComplete && ownMediaCardPresent(last);
        boolean complete = treeComplete && ownCardObserved;
        report.put("unverifiedSystemUiControl", action).put("systemUiControlScanComplete", complete)
                .put("systemUiOwnMediaCardObserved", ownCardObserved)
                .put("systemUiControlObservation", complete ? "ABSENT_OR_AMBIGUOUS" : treeComplete ? "OWN_MEDIA_CARD_UNAVAILABLE" : "SCAN_OR_SCREEN_CONTEXT_INCOMPLETE");
        throw new AssertionError("Own SystemUI " + action + (complete ? " control absent/ambiguous" : " control unverified due incomplete scan/context") + "; no substitute action was executed");
    }

    private boolean touch(float x, float y, JSONObject evidence) throws Exception {
        long now = SystemClock.uptimeMillis(); MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent up = MotionEvent.obtain(now, now + 80, MotionEvent.ACTION_UP, x, y, 0); down.setSource(InputDevice.SOURCE_TOUCHSCREEN); up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        boolean acceptedDown = false, acceptedUp = false;
        try { acceptedDown = automation.injectInputEvent(down, true); SystemClock.sleep(80); acceptedUp = automation.injectInputEvent(up, true); }
        finally { down.recycle(); up.recycle(); recordGesture(evidence.put("x", x).put("y", y).put("downAccepted", acceptedDown).put("upAccepted", acceptedUp)); }
        return acceptedDown && acceptedUp;
    }
    private boolean swipe(float x1, float y1, float x2, float y2, String purpose) throws Exception {
        require(x1 > 0 && x1 < displayWidth && x2 > 0 && x2 < displayWidth && y1 >= 0 && y1 < displayHeight && y2 >= 0 && y2 < displayHeight, "Swipe outside observed display");
        long now = SystemClock.uptimeMillis(); boolean accepted = true;
        for (int step = 0; step <= 12; step++) {
            float fraction = step / 12f; int action = step == 0 ? MotionEvent.ACTION_DOWN : step == 12 ? MotionEvent.ACTION_UP : MotionEvent.ACTION_MOVE;
            MotionEvent event = MotionEvent.obtain(now, SystemClock.uptimeMillis(), action, x1 + (x2 - x1) * fraction, y1 + (y2 - y1) * fraction, 0);
            event.setSource(InputDevice.SOURCE_TOUCHSCREEN); try { accepted &= automation.injectInputEvent(event, true); } finally { event.recycle(); }
            if (step < 12) SystemClock.sleep(25);
        }
        recordGesture(new JSONObject().put("stage", stage).put("kind", "swipe").put("purpose", purpose).put("from", new JSONArray().put(x1).put(y1))
                .put("to", new JSONArray().put(x2).put(y2)).put("allEventsAccepted", accepted)); return accepted;
    }
    private boolean key(int code, String purpose) throws Exception {
        long now = SystemClock.uptimeMillis(); boolean down = automation.injectInputEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0), true);
        boolean up = automation.injectInputEvent(new KeyEvent(now, SystemClock.uptimeMillis(), KeyEvent.ACTION_UP, code, 0), true);
        recordGesture(new JSONObject().put("stage", stage).put("kind", "key").put("keyCode", code).put("purpose", purpose).put("downAccepted", down).put("upAccepted", up)); return down && up;
    }
    private void recordGesture(JSONObject evidence) throws Exception { if (gestures.length() < 80) gestures.put(evidence.put("elapsedMs", elapsed())); else report.put("gesturesTruncated", true); }
    private JSONObject mediaVolume() throws Exception {
        AudioManager manager = context.getSystemService(AudioManager.class);
        JSONObject result = new JSONObject().put("managerPresent", manager != null).put("stream", AudioManager.STREAM_MUSIC).put("elapsedMs", elapsed());
        if (manager != null) result.put("volume", manager.getStreamVolume(AudioManager.STREAM_MUSIC))
                .put("minimum", manager.getStreamMinVolume(AudioManager.STREAM_MUSIC)).put("maximum", manager.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
                .put("muted", manager.isStreamMute(AudioManager.STREAM_MUSIC)).put("fixedVolume", manager.isVolumeFixed()).put("musicActive", manager.isMusicActive());
        return result;
    }
    private void prepareRecordingMediaVolume() throws Exception {
        // The method runs only after the explicit debug/isolated-guest guards and real Start tap.
        // Hardware keys set a reproducible recording condition; production never changes volume.
        JSONObject before = mediaVolume(), current = before;
        int maximum = before.optInt("maximum", -1), keyCount = 0;
        JSONObject evidence = new JSONObject().put("before", before).put("after", current).put("hardwareKeyCount", keyCount)
                .put("scope", "disposable_debug_emulator_only").put("directVolumeSetterUsed", false);
        report.put("recordingMediaVolume", evidence);
        require(before.optBoolean("managerPresent") && maximum > 0 && maximum <= 30, "Guest media volume range unavailable");
        if (!before.optBoolean("fixedVolume")) {
            while ((current.optInt("volume", -1) < maximum || current.optBoolean("muted")) && keyCount < maximum + 1) {
                require(mediaMatches(PlaybackState.STATE_PLAYING), "Own playback changed during recording-volume keys");
                require(key(KeyEvent.KEYCODE_VOLUME_UP, "isolated_guest_recording_media_volume_up"), "Recording-volume key rejected");
                keyCount++; evidence.put("hardwareKeyCount", keyCount); SystemClock.sleep(150); current = mediaVolume(); evidence.put("after", current);
                report.put("guestMusicVolumeAlteredByTest", before.optInt("volume", -1) != current.optInt("volume", -1)
                        || before.optBoolean("muted") != current.optBoolean("muted"));
            }
            require(current.optInt("volume", -1) == maximum && !current.optBoolean("muted"), "Hardware keys did not establish unmuted maximum media volume");
        } else require(current.optInt("volume", -1) > 0 && !current.optBoolean("muted"), "Fixed-volume guest has no unmuted media output");
        report.put("recordingMediaVolumeVerified", true);
    }
    private String activePackage() { AccessibilityNodeInfo root = automation.getRootInActiveWindow(); if (root == null) return ""; try { return String.valueOf(root.getPackageName()); } finally { root.recycle(); } }
    private JSONObject screen() throws Exception {
        PowerManager power = context.getSystemService(PowerManager.class); KeyguardManager keyguard = context.getSystemService(KeyguardManager.class);
        return new JSONObject().put("powerAvailable", power != null).put("keyguardAvailable", keyguard != null).put("interactive", power != null && power.isInteractive())
                .put("keyguardLocked", keyguard != null && keyguard.isKeyguardLocked()).put("deviceLocked", keyguard != null && keyguard.isDeviceLocked());
    }
    private String resolveHome() throws Exception {
        // Bounded read-only system resolver avoids app package-visibility filtering and does not open Home.
        String command = "cmd package resolve-activity --components --user current -a android.intent.action.MAIN -c android.intent.category.HOME";
        ByteArrayOutputStream output = new ByteArrayOutputStream(); long until = limit(3000);
        try (ParcelFileDescriptor descriptor = automation.executeShellCommand(command)) {
            require(descriptor != null, "Home resolution descriptor unavailable"); java.io.FileDescriptor fd = descriptor.getFileDescriptor();
            Os.fcntlInt(fd, OsConstants.F_SETFL, Os.fcntlInt(fd, OsConstants.F_GETFL, 0) | OsConstants.O_NONBLOCK);
            StructPollfd watched = new StructPollfd(); watched.fd = fd; watched.events = (short) (OsConstants.POLLIN | OsConstants.POLLHUP);
            byte[] buffer = new byte[128]; boolean eof = false;
            while (SystemClock.elapsedRealtime() < until) {
                try {
                    if (Os.poll(new StructPollfd[]{watched}, 100) == 0) continue;
                    require((watched.revents & (OsConstants.POLLERR | OsConstants.POLLNVAL)) == 0, "Home resolver pipe error");
                    int n = Os.read(fd, buffer, 0, buffer.length); if (n == 0) { eof = true; break; }
                    if (n > 0) { output.write(buffer, 0, n); require(output.size() <= 2048, "Home resolver output too large"); }
                } catch (ErrnoException error) { if (error.errno != OsConstants.EAGAIN && error.errno != OsConstants.EINTR) throw error; }
            }
            require(eof, "Home resolver read deadline expired");
        }
        String[] lines = new String(output.toByteArray(), StandardCharsets.UTF_8).trim().split("\\s+");
        for (String line : lines) if (line.matches("[a-zA-Z0-9_.]+/[a-zA-Z0-9_.$]+")) return line.substring(0, line.indexOf('/'));
        return "";
    }
    private boolean noInternet() {
        ConnectivityManager manager = context.getSystemService(ConnectivityManager.class); if (manager == null) return false;
        for (Network network : manager.getAllNetworks()) { NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
            if (capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false; }
        return true;
    }
    private boolean servicePresent() {
        ActivityManager manager = context.getSystemService(ActivityManager.class); if (manager == null) return false;
        for (ActivityManager.RunningServiceInfo info : manager.getRunningServices(100)) if (PACKAGE.equals(info.service.getPackageName()) && PlaylistService.class.getName().equals(info.service.getClassName())) return true;
        return false;
    }
    private boolean foreground() {
        ActivityManager manager = context.getSystemService(ActivityManager.class); if (manager == null) return false;
        for (ActivityManager.RunningServiceInfo info : manager.getRunningServices(100)) if (PACKAGE.equals(info.service.getPackageName()) && PlaylistService.class.getName().equals(info.service.getClassName())) return info.foreground;
        return false;
    }
    private int actualType() throws Exception {
        AtomicInteger type = new AtomicInteger(-1); AtomicReference<Exception> failure = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> { try { Object active = fieldClass(PlaylistService.class, "active");
            if (active instanceof PlaylistService && PACKAGE.equals(((Service) active).getPackageName()) && ((Service) active).getApplicationInfo().uid == context.getApplicationInfo().uid) type.set(((Service) active).getForegroundServiceType());
        } catch (Exception error) { failure.set(error); } }); if (failure.get() != null) throw failure.get(); return type.get();
    }
    private static Object fieldClass(Class<?> cls, String name) throws Exception { Field f = cls.getDeclaredField(name); f.setAccessible(true); return f.get(null); }
    private StatusBarNotification notice() {
        NotificationManager manager = context.getSystemService(NotificationManager.class); if (manager == null) return null; StatusBarNotification found = null;
        for (StatusBarNotification n : manager.getActiveNotifications()) if (PACKAGE.equals(n.getPackageName()) && n.getUid() == context.getApplicationInfo().uid
                && n.getId() == 410 && "kotoba-listening".equals(n.getNotification().getChannelId())) { if (found != null) return null; found = n; }
        return found;
    }
    private MediaController controller(StatusBarNotification n) {
        if (n == null) return null; MediaSession.Token token = n.getNotification().extras.getParcelable(Notification.EXTRA_MEDIA_SESSION, MediaSession.Token.class);
        if (token == null) return null; MediaController controller = new MediaController(context, token);
        return PACKAGE.equals(controller.getPackageName()) && "KotobaPlaylist".equals(controller.getTag()) ? controller : null;
    }
    private boolean mediaMatches(int expected) throws Exception {
        StatusBarNotification n = notice(); MediaController controller = controller(n); PlaybackState playback = controller == null ? null : controller.getPlaybackState();
        return foreground() && actualType() == ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK && n != null
                && (n.getNotification().flags & Notification.FLAG_FOREGROUND_SERVICE) != 0 && playback != null && playback.getState() == expected;
    }
    private JSONObject state(String label) throws Exception {
        AtomicReference<JSONObject> value = new AtomicReference<>(); instrumentation.runOnMainSync(() -> { try { value.set(new JSONObject(PlaylistService.status().toString())); }
            catch (Exception error) { value.set(new JSONObject()); } });
        JSONObject raw = value.get(); JSONObject current = new JSONObject().put("playing", raw.optBoolean("playing")).put("index", raw.optInt("index", -1))
                .put("part", raw.optInt("part", -1)).put("total", raw.optInt("total", -1)).put("word", bounded(raw.optString("word"), 140)).put("error", bounded(raw.optString("error"), 300));
        String fingerprint = current.toString(); if (!fingerprint.equals(lastState)) { lastState = fingerprint;
            if (events.length() < 64) events.put(new JSONObject(fingerprint).put("stage", label).put("elapsedMs", elapsed())); else report.put("statusEventsTruncated", true); }
        return current;
    }
    private static String progressKey(JSONObject state) { return state.optInt("index", -1) + ":" + state.optInt("part", -1); }
    private void awaitPlaying(long millis) throws Exception { until(() -> {
        JSONObject current = state(stage); require(current.optString("error").isEmpty(), "Native playback error: " + current.optString("error"));
        return current.optBoolean("playing") && current.optInt("total") == 2 && mediaMatches(PlaybackState.STATE_PLAYING);
    }, millis, "Own media playback/foreground service did not start"); }
    private void observeProgress(String name, long duration, boolean background, boolean off) throws Exception {
        long begin = SystemClock.elapsedRealtime(), until = begin + duration; require(until < workDeadline, "Progress observation budget exhausted");
        JSONObject first = state(name); String previous = progressKey(first); int transitions = 0;
        JSONObject observation = new JSONObject().put("stage", name).put("startState", first).put("startScreen", screen()).put("startActivityState", scenario.getState().name()); stages.put(observation);
        while (SystemClock.elapsedRealtime() < until) {
            JSONObject current = state(name); JSONObject screen = screen();
            require(current.optBoolean("playing") && current.optInt("total") == 2 && current.optString("error").isEmpty(), "Playback state lost in " + name);
            require(current.optInt("index", -1) >= 0 && current.optInt("index", -1) < 2 && current.optInt("part", -1) >= 0 && current.optInt("part", -1) <= 2, "Invalid native progression");
            require(mediaMatches(PlaybackState.STATE_PLAYING) && noInternet(), "Own media/FGS/offline condition lost in " + name);
            if (background) require(scenario.getState() != Lifecycle.State.RESUMED, "Activity foreground during " + name);
            if (off) require(!screen.optBoolean("interactive"), "Screen interactive during screen-off observation");
            else if ("home".equals(name)) require(screen.optBoolean("interactive") && homePackage.equals(activePackage()), "System Home context lost");
            String next = progressKey(current); if (!previous.equals(next)) { transitions++; previous = next; }
            SystemClock.sleep(100);
        }
        StatusBarNotification n = notice(); MediaController controller = controller(n); JSONObject end = state(name);
        observation.put("elapsedMs", SystemClock.elapsedRealtime() - begin).put("transitions", transitions).put("endState", end).put("endScreen", screen())
                .put("endActivityState", scenario.getState().name()).put("runtimeForegroundServiceType", actualType())
                .put("mediaTitle", controller == null || controller.getMetadata() == null ? "" : bounded(controller.getMetadata().getString(MediaMetadata.METADATA_KEY_TITLE), 140));
        report.put("automatic".equals(name) ? "automaticTransitionCount" : name + "AutomaticTransitionCount", transitions)
                .put("automatic".equals(name) ? "automaticObservationMillis" : name + "ObservationMillis", SystemClock.elapsedRealtime() - begin);
        require(transitions > 0 && mediaMatches(PlaybackState.STATE_PLAYING), "No automatic native progress observed during " + name);
    }
    private void cleanupWithUi() throws Exception {
        // Return via a real notification-card title touch, then touch the app's real stop button.
        // These actions are cleanup evidence only, never a substitute for an absent SystemUI Stop.
        if (screen().optBoolean("keyguardLocked") || screen().optBoolean("deviceLocked")) return;
        if (!SYSTEM_UI.equals(activePackage()) && !PACKAGE.equals(activePackage())) openShade();
        if (SYSTEM_UI.equals(activePackage())) {
            Tree current = tree(); int title = cleanupTitle(current);
            if (title < 0) return;
            Row target = current.rows.get(title); Tree fresh = tree(); int next = cleanupTitle(fresh);
            if (next < 0 || !fresh.rows.get(next).bounds.equals(target.bounds) || !fresh.rows.get(next).text.equals(target.text)
                    || SystemClock.elapsedRealtime() - fresh.capturedAt > 1800) return;
            // Touch the observed title itself, inside an observed clickable media-card ancestor.
            // The ancestor center could instead hit a playback control and is deliberately avoided.
            if (!touch(target.bounds.exactCenterX(), target.bounds.exactCenterY(), new JSONObject().put("stage", "cleanup").put("kind", "notification_card_touch")
                    .put("cleanupOnly", true).put("target", fresh.rows.get(next).json(next)).put("snapshotAgeMs", SystemClock.elapsedRealtime() - fresh.capturedAt))) return;
            long until = SystemClock.elapsedRealtime() + 4000;
            while (!PACKAGE.equals(activePackage()) && SystemClock.elapsedRealtime() < until) SystemClock.sleep(100);
        }
        if (!PACKAGE.equals(activePackage()) || scenario.getState() != Lifecycle.State.RESUMED) return;
        if (!"true".equals(js("location.hash==='#commute' && !!document.querySelector('[data-action=playlist-stop]')"))) return;
        tapDom("[data-action=playlist-stop]", true);
        long until = SystemClock.elapsedRealtime() + 3000; while (servicePresent() && SystemClock.elapsedRealtime() < until) SystemClock.sleep(100);
        report.put("cleanupUiStopTapVerified", !servicePresent() && notice() == null);
    }
    private int cleanupTitle(Tree tree) {
        if (!SYSTEM_UI.equals(tree.rootPackage) || tree.truncated) return -1; int found = -1;
        for (int i = 0; i < tree.rows.size(); i++) {
            Row row = tree.rows.get(i); int card = ownCard(tree, i);
            if (!SYSTEM_UI.equals(row.pkg) || !selectedWords.contains(row.text.trim()) || !row.visible || !row.enabled || card < 0
                    || row.bounds.width() <= 4 || row.bounds.height() <= 4 || row.bounds.left < 0 || row.bounds.top < 0
                    || row.bounds.right > displayWidth || row.bounds.bottom > displayHeight) continue;
            boolean clickableAncestor = false;
            for (int parent = i, levels = 0; parent >= 0 && levels < 7; parent = tree.rows.get(parent).parent, levels++) {
                Row container = tree.rows.get(parent);
                if (validBounds(container) && container.bounds.contains(row.bounds)) { clickableAncestor = true; break; }
                if (parent == card) break;
            }
            if (clickableAncestor) { if (found >= 0) return -1; found = i; }
        }
        return found;
    }
}
