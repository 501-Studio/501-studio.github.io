package com.studio501.kotoba;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

import android.app.AlertDialog;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.RadioButton;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Raw Android screen captures. Run explicitly on a freshly cleared emulator debug package. */
@RunWith(AndroidJUnit4.class)
public final class StoreScreenshotTest {
    private static final String SCHOOL = "N5-mibmyg", MOUNTAIN = "N5-1ok9x3q";
    private static final String CLEAN = "document.readyState==='complete' && document.fonts.status==='loaded'"
            + " && !document.querySelector('.fatal,.store-warning,.loading,.tutorial,.modal-backdrop')"
            + " && !document.querySelector('#app').inert"
            + " && !document.querySelector('#toast').classList.contains('show')"
            + " && Number(getComputedStyle(document.querySelector('#toast')).opacity)===0";
    private final JSONArray screens = new JSONArray();
    private long started;
    private File directory;

    private static Object field(Object value, String name) {
        try {
            Field field = value.getClass().getDeclaredField(name); field.setAccessible(true);
            return field.get(value);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    private static WebView web(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
            WebView found = web(((ViewGroup) view).getChildAt(i)); if (found != null) return found;
        }
        return null;
    }
    private static RadioButton radio(View view, String label) {
        if (view instanceof RadioButton && label.contentEquals(((RadioButton) view).getText())) return (RadioButton) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
            RadioButton found = radio(((ViewGroup) view).getChildAt(i), label); if (found != null) return found;
        }
        return null;
    }
    private String js(ActivityScenario<MainActivity> scenario, String code) throws Exception {
        AtomicReference<String> value = new AtomicReference<>(); CountDownLatch done = new CountDownLatch(1);
        scenario.onActivity(activity -> {
            WebView view = web(activity.getWindow().getDecorView()); assertNotNull("App WebView missing", view);
            view.evaluateJavascript(code, result -> { value.set(result); done.countDown(); });
        });
        assertTrue("JavaScript callback timed out", done.await(10, TimeUnit.SECONDS));
        return value.get();
    }
    private void until(ActivityScenario<MainActivity> scenario, String predicate) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 25000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(js(scenario, predicate))) return;
            SystemClock.sleep(100);
        }
        fail("Screen condition failed: " + predicate + " page=" + js(scenario, "document.body.innerText.slice(0,1800)"));
    }
    private void click(ActivityScenario<MainActivity> scenario, String selector) throws Exception {
        assertEquals("UI control unavailable: " + selector, "true", js(scenario,
                "(()=>{const e=document.querySelector(" + JSONObject.quote(selector) + ");"
                + "if(!e||e.disabled||!e.getBoundingClientRect().width)return false;e.click();return true;})()"));
    }
    private void selectUnderFourteen(ActivityScenario<MainActivity> scenario) {
        long deadline = SystemClock.elapsedRealtime() + 15000; AtomicBoolean selected = new AtomicBoolean();
        while (!selected.get() && SystemClock.elapsedRealtime() < deadline) {
            scenario.onActivity(activity -> {
                PlayAds ads = (PlayAds) field(activity, "ads");
                AlertDialog picker = (AlertDialog) field(ads, "dialog");
                if (picker == null || !picker.isShowing()) return;
                RadioButton option = radio(picker.getWindow().getDecorView(), "만 14세 미만");
                assertNotNull("Native age choice missing", option); option.performClick();
                assertTrue(picker.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled());
                picker.getButton(AlertDialog.BUTTON_POSITIVE).performClick(); selected.set(true);
            });
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            if (!selected.get()) SystemClock.sleep(100);
        }
        assertTrue("Fresh-launch native age picker was not shown", selected.get());
        assertNoAdSdk(scenario);
    }
    private void assertNoAdSdk(ActivityScenario<MainActivity> scenario) {
        scenario.onActivity(activity -> {
            assertEquals(AdAgePolicy.UNDER_FOURTEEN, activity.getSharedPreferences(PlayAds.AGE_PREFS, Context.MODE_PRIVATE)
                    .getInt(PlayAds.AGE_KEY, AdAgePolicy.UNKNOWN));
            PlayAds ads = (PlayAds) field(activity, "ads");
            assertNull("Age dialog still covers app", field(ads, "dialog"));
            assertNull("Under-14 must not obtain UMP", field(ads, "consent"));
            for (String flag : new String[]{"initialized", "initializing", "consentBusy", "loadingFull", "showing"})
                assertEquals("Under-14 ad work: " + flag, false, field(ads, flag));
            assertNull(field(ads, "banner")); assertNull(field(ads, "full"));
        });
    }
    private void stable(ActivityScenario<MainActivity> scenario, String predicate) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 25000, unchangedSince = 0; String previous = "";
        while (SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(js(scenario, "(" + CLEAN + ") && (" + predicate + ")"))) {
                String current = js(scenario, "JSON.stringify({route:location.hash,text:document.querySelector('#main')?.innerText,"
                        + "width:innerWidth,height:innerHeight,scroll:scrollY})");
                if (!current.equals(previous)) { previous = current; unchangedSince = SystemClock.elapsedRealtime(); }
                else if (SystemClock.elapsedRealtime() - unchangedSince >= 500) return;
            } else { previous = ""; unchangedSince = 0; }
            SystemClock.sleep(100);
        }
        fail("Rendered screen did not stabilize: " + predicate);
    }
    private void drawn(ActivityScenario<MainActivity> scenario) throws Exception {
        CountDownLatch drawn = new CountDownLatch(1);
        scenario.onActivity(activity -> {
            WebView view = web(activity.getWindow().getDecorView());
            assertTrue("WebView must be attached and visible", view.isAttachedToWindow() && view.isShown());
            // The next draw reflects the DOM/canvas covered by this callback. Wait two display frames as well.
            view.postVisualStateCallback(SystemClock.elapsedRealtime(), new WebView.VisualStateCallback() {
                @Override public void onComplete(long requestId) {
                    view.invalidate(); view.postOnAnimation(() -> view.postOnAnimation(drawn::countDown));
                }
            });
        });
        assertTrue("WebView visual state did not reach the display", drawn.await(10, TimeUnit.SECONDS));
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
    }
    private void capture(ActivityScenario<MainActivity> scenario, String fileName, String label,
                         String predicate, String navigation) throws Exception {
        long waitingAt = SystemClock.elapsedRealtime();
        js(scenario, "document.activeElement?.blur();scrollTo(0,0);true");
        stable(scenario, predicate); drawn(scenario); assertNoAdSdk(scenario);
        assertEquals("Capture semantic state changed", "true", js(scenario, "(" + CLEAN + ") && (" + predicate + ")"));
        String description = (String) new JSONTokener(js(scenario,
                "JSON.stringify({route:location.hash||'#home',heading:document.querySelector('#main h1')?.textContent,"
                + "viewport:{width:innerWidth,height:innerHeight},search:document.querySelector('#search')?.value||null,"
                + "lesson:document.querySelector('.session-label')?.textContent||null,"
                + "writing:document.querySelector('#practice-canvas')?{status:document.querySelector('#practice-status')?.textContent,"
                + "word:document.querySelector('#practice-word-progress')?.textContent,"
                + "guide:document.querySelector('[data-action=\"practice-guide\"]')?.getAttribute('aria-pressed'),"
                + "acceptedStrokes:Number(document.querySelector('#practice-canvas').dataset.accepted),"
                + "totalStrokes:Number(document.querySelector('#practice-canvas').dataset.total)}:null})")).nextValue();
        long captureAt = System.currentTimeMillis();
        Bitmap screen = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull("Android display capture failed", screen);
        try {
            assertEquals("Set emulator display before launching the app; do not resize screenshots", 1080, screen.getWidth());
            assertEquals("Set emulator display before launching the app; do not resize screenshots", 1920, screen.getHeight());
            File output = new File(directory, fileName);
            // JPEG encodes the actual capture without alpha, cropping, compositing or rescaling.
            try (FileOutputStream stream = new FileOutputStream(output)) {
                assertTrue("JPEG encoding failed", screen.compress(Bitmap.CompressFormat.JPEG, 95, stream));
            }
            assertTrue("Empty screen image", output.length() > 10000);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (java.io.FileInputStream input = new java.io.FileInputStream(output)) {
                byte[] buffer = new byte[8192]; int length;
                while ((length = input.read(buffer)) != -1) digest.update(buffer, 0, length);
            }
            StringBuilder hash = new StringBuilder(); for (byte value : digest.digest()) hash.append(String.format("%02x", value & 255));
            screens.put(new JSONObject().put("file", fileName).put("screen", label).put("width", screen.getWidth())
                    .put("height", screen.getHeight()).put("format", "JPEG").put("quality", 95).put("bytes", output.length())
                    .put("sha256", hash.toString()).put("capturedAtUnixMillis", captureAt)
                    .put("elapsedSinceRunStartMs", SystemClock.elapsedRealtime() - started)
                    .put("readinessWaitMs", SystemClock.elapsedRealtime() - waitingAt)
                    .put("semanticPredicate", predicate).put("navigation", navigation).put("renderedState", new JSONObject(description)));
        } finally { screen.recycle(); }
    }
    private void writeManifest(JSONObject manifest) throws Exception {
        try (FileOutputStream output = new FileOutputStream(new File(directory, "capture-manifest.json"))) {
            output.write(manifest.toString(2).getBytes(StandardCharsets.UTF_8));
        }
    }
    @Test public void captureFourActualAndroidScreens() throws Exception {
        assumeTrue("Explicit fresh-emulator screenshot run only", "true".equals(
                InstrumentationRegistry.getArguments().getString("captureStoreScreenshots")));
        assertEquals("Capture is disclosed as the internal debug variant", "internal_debug", BuildConfig.BUILD_STAGE);
        assertFalse("Store screenshot run must not activate sales", BuildConfig.SELLING_ENABLED);
        assertTrue("Use the real native age-picker path", BuildConfig.ADS_ENABLED);
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getPackageName().endsWith(".debug"));
        assertFalse("CI must clear the isolated debug package before this run", context
                .getSharedPreferences(PlayAds.AGE_PREFS, Context.MODE_PRIVATE).contains(PlayAds.AGE_KEY));
        directory = new File(context.getFilesDir(), "store-screenshots"); assertTrue(directory.mkdirs() || directory.isDirectory());
        assertEquals("Old captures must not be reused", 0, directory.list().length);
        started = SystemClock.elapsedRealtime(); PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
        JSONObject manifest = new JSONObject().put("status", "running").put("captureMethod", "UiAutomation.takeScreenshot")
                .put("imageEditing", false).put("encoding", "Bitmap.compress JPEG quality 95; no pixel transforms")
                .put("variant", BuildConfig.BUILD_STAGE).put("packageName", context.getPackageName()).put("versionName", info.versionName)
                .put("versionCode", Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode)
                .put("apiLevel", Build.VERSION.SDK_INT).put("model", Build.MODEL).put("supportedAbis", new JSONArray(Build.SUPPORTED_ABIS))
                .put("hardware", Build.HARDWARE).put("densityDpi", context.getResources().getDisplayMetrics().densityDpi)
                .put("startedAtUnixMillis", System.currentTimeMillis())
                .put("agePath", "Native under-14 selection, representing a 13-year-old demo; neither ad SDK starts")
                .put("salesEnabled", false).put("releaseStatus", "Internal test build; production release and approval not asserted")
                .put("speechValidation", "Japanese voice installation and physical audio audibility are not established by screenshots")
                .put("screens", screens);
        writeManifest(manifest);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
            until(scenario, "!!document.querySelector('.level-progress-grid') && !!document.querySelector('.tutorial')");
            selectUnderFourteen(scenario);
            for (int step = 0; step < 4; step++) {
                until(scenario, "document.querySelector('.tutorial')?.dataset.step==='" + step + "'");
                click(scenario, "[data-action=\"tutorial-next\"]");
            }
            until(scenario, "document.querySelector('.tutorial')?.dataset.step==='4'");
            click(scenario, "[data-action=\"tutorial-finish\"]");
            capture(scenario, "01-home.jpg", "home", "!!document.querySelector('.home-dashboard .level-progress-grid')",
                    "Fresh install; select native under-14 band; complete all five tutorial steps");

            click(scenario, ".bottom-nav a[href=\"#words\"]"); until(scenario, "!!document.querySelector('#search')");
            js(scenario, "document.querySelector('#search').value='学校';document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}));true");
            capture(scenario, "02-vocabulary-search.jpg", "vocabulary-search",
                    "location.hash==='#words' && document.querySelector('#search').value==='学校'"
                    + " && !!document.querySelector('#word-results .word-button[data-id=\"" + SCHOOL + "\"]')"
                    + " && document.querySelector('#word-results-status').textContent.includes('검색 결과')",
                    "Use bottom vocabulary tab; enter 学校 in the real search input");

            click(scenario, ".bottom-nav a[href=\"#home\"]"); until(scenario, "!!document.querySelector('.home-dashboard')");
            click(scenario, "[data-action=\"start-course\"][data-id=\"N5-chapter-1\"]"); int unknown = 0;
            for (int index = 1; index <= 30; index++) {
                until(scenario, "!!document.querySelector('.survey-card') && document.querySelector('.session-label>span:last-child').textContent==='" + index + "/30'");
                boolean mountain = "true".equals(js(scenario, "document.querySelector('.survey-headword strong').textContent.trim()==='山'"));
                if (mountain) unknown++;
                click(scenario, "[data-action=\"" + (mountain ? "unknown-word" : "known-word") + "\"]");
            }
            assertEquals("Demo must classify exactly one real chapter word for study", 1, unknown);
            manifest.put("demoSurvey", new JSONObject().put("course", "N5-chapter-1").put("encountered", 30)
                    .put("markedKnownViaUi", 29).put("markedUnknownViaUi", "山").put("examsCompleted", false));
            until(scenario, "!!document.querySelector('.intro-card') && !!document.querySelector('[data-action=\"studied\"]')");
            click(scenario, "[data-action=\"examples\"][data-id=\"" + MOUNTAIN + "\"]");
            String exampleReady = "location.hash==='#lesson' && !!document.querySelector('.question .example-pane')"
                    + " && !!document.querySelector('.example-ja')?.textContent.trim() && !!document.querySelector('.example-ko')?.textContent.trim()"
                    + " && !!document.querySelector('[data-action=\"hide-examples\"]')";
            // Wait for the rendered example to settle, then use the app's real stop control.
            stable(scenario, exampleReady); click(scenario, "[data-action=\"example-stop\"]");
            capture(scenario, "03-study-example.jpg", "study-example", exampleReady,
                    "Start N5 chapter 1; classify 山 unknown and other 29 words known; open 山 example in first study task; stop speech");

            click(scenario, ".focus-top [data-action=\"pause\"]");
            until(scenario, "document.querySelector('#sheet-title')?.textContent==='수업 중단' && !!document.querySelector('[data-action=\"save-exit\"]')");
            click(scenario, "[data-action=\"save-exit\"]"); until(scenario, "!!document.querySelector('.home-dashboard') && !document.querySelector('.modal-backdrop')");
            click(scenario, ".bottom-nav a[href=\"#words\"]");
            until(scenario, "!!document.querySelector('[data-action=\"practice-options\"][data-id=\"" + SCHOOL + "\"]')");
            click(scenario, "[data-action=\"practice-options\"][data-id=\"" + SCHOOL + "\"]");
            until(scenario, "!!document.querySelector('.practice-options') && !!document.querySelector('[data-action=\"practice-start\"]')");
            click(scenario, "[data-action=\"practice-start\"]");
            capture(scenario, "04-handwriting.jpg", "handwriting",
                    "location.hash==='#word-practice' && !!document.querySelector('.practice-focus')"
                    + " && document.querySelector('#practice-word-progress')?.textContent==='学校'"
                    + " && document.querySelector('[data-action=\"practice-guide\"]')?.getAttribute('aria-pressed')==='true'"
                    + " && document.querySelector('#practice-canvas')?.dataset.accepted==='0'"
                    + " && Number(document.querySelector('#practice-canvas')?.dataset.total)>0"
                    + " && document.querySelector('#practice-canvas').width>0 && document.querySelector('#practice-canvas').height>0"
                    + " && document.querySelector('#practice-canvas').getBoundingClientRect().width>0",
                    "Save and exit lesson via pause menu; open school word's independent writing options; start default three-repeat guided practice (no strokes or exam success fabricated)");
            assertEquals(4, screens.length()); manifest.put("status", "complete");
        } catch (Throwable failure) {
            manifest.put("status", "failed").put("failure", failure.toString()); throw failure;
        } finally {
            manifest.put("elapsedMs", SystemClock.elapsedRealtime() - started).put("finishedAtUnixMillis", System.currentTimeMillis());
            writeManifest(manifest);
        }
    }
}
