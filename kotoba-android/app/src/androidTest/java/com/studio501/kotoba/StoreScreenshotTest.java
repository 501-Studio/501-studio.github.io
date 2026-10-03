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
import android.view.accessibility.AccessibilityNodeInfo;
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
    private void verifyTutorialUnknownAge(ActivityScenario<MainActivity> scenario) {
        long deadline = SystemClock.elapsedRealtime() + 10000; AtomicBoolean tutorialReported = new AtomicBoolean();
        while (!tutorialReported.get() && SystemClock.elapsedRealtime() < deadline) {
            scenario.onActivity(activity -> tutorialReported.set("tutorial".equals(field(field(activity, "ads"), "screen"))));
            if (!tutorialReported.get()) SystemClock.sleep(100);
        }
        assertTrue("Tutorial screen was not reported to the native controller", tutorialReported.get());
        scenario.onActivity(activity -> {
            assertFalse(activity.getSharedPreferences(PlayAds.AGE_PREFS, Context.MODE_PRIVATE).contains(PlayAds.AGE_KEY));
            PlayAds ads = (PlayAds) field(activity, "ads");
            assertEquals(AdAgePolicy.UNKNOWN, ((AdAgePolicy) field(ads, "age")).band());
            assertNull("Age picker must wait for home after tutorial", field(ads, "dialog"));
            assertSdkIdle(ads, "Unknown-age tutorial");
        });
    }
    private static void assertSdkIdle(PlayAds ads, String label) {
        assertNull(label + " must not obtain UMP", field(ads, "consent"));
        for (String flag : new String[]{"initialized", "initializing", "consentBusy", "loadingFull", "showing"})
            assertEquals(label + " ad work: " + flag, false, field(ads, flag));
        assertNull(field(ads, "banner")); assertNull(field(ads, "full"));
    }
    private void assertNoAdSdk(ActivityScenario<MainActivity> scenario) {
        scenario.onActivity(activity -> {
            assertEquals(AdAgePolicy.UNDER_FOURTEEN, activity.getSharedPreferences(PlayAds.AGE_PREFS, Context.MODE_PRIVATE)
                    .getInt(PlayAds.AGE_KEY, AdAgePolicy.UNKNOWN));
            PlayAds ads = (PlayAds) field(activity, "ads");
            assertNull("Age dialog still covers app", field(ads, "dialog"));
            assertSdkIdle(ads, "Under-14");
        });
    }
    private void appendAppAccessibility(AccessibilityNodeInfo node, String packageName, JSONArray nodes, int depth) throws Exception {
        if (node == null || depth > 25 || nodes.length() >= 300) return;
        // Text from other apps or system account surfaces is not exported.
        if (packageName.contentEquals(node.getPackageName() == null ? "" : node.getPackageName())) {
            String text = String.valueOf(node.getText() == null ? "" : node.getText());
            String description = String.valueOf(node.getContentDescription() == null ? "" : node.getContentDescription());
            nodes.put(new JSONObject().put("class", String.valueOf(node.getClassName()))
                    .put("text", text.substring(0, Math.min(text.length(), 200)))
                    .put("description", description.substring(0, Math.min(description.length(), 200)))
                    .put("clickable", node.isClickable()).put("enabled", node.isEnabled()));
        }
        for (int i = 0; i < node.getChildCount() && nodes.length() < 300; i++)
            appendAppAccessibility(node.getChild(i), packageName, nodes, depth + 1);
    }
    private void failureDiagnostics(ActivityScenario<MainActivity> scenario, Throwable failure) throws Exception {
        File diagnostics = new File(directory, "failure-diagnostics"); assertTrue(diagnostics.mkdirs() || diagnostics.isDirectory());
        JSONObject report = new JSONObject().put("status", "failed-diagnostic-only").put("failure", failure.toString())
                .put("capturedAtUnixMillis", System.currentTimeMillis());
        AtomicReference<JSONObject> nativeState = new AtomicReference<>();
        scenario.onActivity(activity -> {
            try {
                PlayAds ads = (PlayAds) field(activity, "ads");
                AlertDialog dialog = (AlertDialog) field(ads, "dialog");
                JSONObject state = new JSONObject().put("screen", field(ads, "screen"))
                        .put("savedAgeBand", activity.getSharedPreferences(PlayAds.AGE_PREFS, Context.MODE_PRIVATE)
                                .getInt(PlayAds.AGE_KEY, AdAgePolicy.UNKNOWN))
                        .put("controllerAgeBand", ((AdAgePolicy) field(ads, "age")).band())
                        .put("dialogShowing", dialog != null && dialog.isShowing())
                        .put("umpObtained", field(ads, "consent") != null).put("windowFocused", activity.hasWindowFocus());
                for (String flag : new String[]{"initialized", "initializing", "consentBusy", "loadingFull", "showing"})
                    state.put(flag, field(ads, flag));
                nativeState.set(state);
            } catch (Exception error) { throw new AssertionError(error); }
        });
        report.put("nativeAds", nativeState.get());
        String dom = (String) new JSONTokener(js(scenario,
                "JSON.stringify({route:location.hash||'#home',tutorialStep:document.querySelector('.tutorial')?.dataset.step||null,"
                + "appInert:document.querySelector('#app')?.inert,heading:document.querySelector('#main h1')?.textContent||null,"
                + "body:document.body.innerText.slice(0,1800)})")).nextValue();
        report.put("appDom", new JSONObject(dom));
        AccessibilityNodeInfo root = InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
        String packageName = InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName();
        JSONArray accessibility = new JSONArray(); appendAppAccessibility(root, packageName, accessibility, 0);
        report.put("appAccessibility", accessibility);
        if (root != null && packageName.contentEquals(root.getPackageName() == null ? "" : root.getPackageName())) {
            Bitmap screen = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            if (screen != null) try {
                try (FileOutputStream output = new FileOutputStream(new File(diagnostics, "failure-ui.jpg"))) {
                    assertTrue(screen.compress(Bitmap.CompressFormat.JPEG, 95, output));
                }
                report.put("diagnosticScreenshot", "failure-ui.jpg").put("width", screen.getWidth()).put("height", screen.getHeight());
            } finally { screen.recycle(); }
        } else report.put("diagnosticScreenshotSkipped", "Foreground accessibility window is outside the isolated target app");
        try (FileOutputStream output = new FileOutputStream(new File(diagnostics, "failure-state.json"))) {
            output.write(report.toString(2).getBytes(StandardCharsets.UTF_8));
        }
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
    private static String searchResultFrame(String selector) {
        return "(()=>{const button=document.querySelector(" + JSONObject.quote(selector) + ");"
                + "const card=button?.closest('.wordbook-item');if(!card)return null;"
                + "const v=visualViewport,viewport={left:v?.offsetLeft||0,top:v?.offsetTop||0,"
                + "right:(v?.offsetLeft||0)+(v?.width||innerWidth),bottom:(v?.offsetTop||0)+(v?.height||innerHeight)};"
                + "const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};"
                + "const nav=document.querySelector('.bottom-nav'),bar=document.querySelector('.appbar');"
                + "const content={...viewport};if(nav&&nav.getBoundingClientRect().height>0)content.bottom=Math.min(content.bottom,rect(nav).top);"
                + "if(bar&&['sticky','fixed'].includes(getComputedStyle(bar).position))content.top=Math.max(content.top,rect(bar).bottom);"
                + "const describe=e=>{if(!e)return null;const bounds=rect(e),style=getComputedStyle(e);"
                + "return {text:e.textContent.trim(),bounds,visible:bounds.width>0&&bounds.height>0&&style.visibility!=='hidden'"
                + "&&Number(style.opacity)>0&&bounds.left>=content.left&&bounds.right<=content.right"
                + "&&bounds.top>=content.top&&bounds.bottom<=content.bottom};};"
                + "return {coordinateSpace:'CSS pixels in the WebView visual viewport',scroll:{x:scrollX,y:scrollY},"
                + "viewport,contentViewport:content,bottomNavigation:nav?rect(nav):null,card:describe(card),"
                + "headword:describe(button.querySelector('.japanese strong')),reading:describe(button.querySelector('.reading')),"
                + "meaning:describe(button.querySelector('.word-detail p')),search:describe(document.querySelector('.word-search')),"
                + "filters:describe(document.querySelector('.filter-chips')),resultCount:describe(document.querySelector('#word-results-status'))};})()";
    }
    private void frameSearchResult(ActivityScenario<MainActivity> scenario, String selector) throws Exception {
        until(scenario, "document.fonts.status==='loaded' && !!document.querySelector(" + JSONObject.quote(selector) + ")");
        assertEquals("Search result could not be framed by scrolling", "true", js(scenario,
                "(()=>{const f=" + searchResultFrame(selector) + ";if(!f)return false;"
                + "const top=Math.min(f.card.bounds.top,f.search.bounds.top,f.filters.bounds.top,f.resultCount.bounds.top),"
                + "bottom=Math.max(f.card.bounds.bottom,f.search.bounds.bottom,f.filters.bounds.bottom,f.resultCount.bounds.bottom);"
                + "const down=bottom-f.contentViewport.bottom+12,up=top-f.contentViewport.top-12;"
                + "if(down>0)scrollBy({top:down,left:0,behavior:'instant'});else if(up<0)scrollBy({top:up,left:0,behavior:'instant'});return true;})()"));
    }
    private void capture(ActivityScenario<MainActivity> scenario, String fileName, String label,
                         String predicate, String navigation) throws Exception {
        capture(scenario, fileName, label, predicate, navigation, null);
    }
    private void capture(ActivityScenario<MainActivity> scenario, String fileName, String label,
                         String predicate, String navigation, String searchResultSelector) throws Exception {
        long waitingAt = SystemClock.elapsedRealtime();
        js(scenario, "document.activeElement?.blur();true");
        if (searchResultSelector == null) js(scenario, "scrollTo(0,0);true");
        else frameSearchResult(scenario, searchResultSelector);
        stable(scenario, predicate); drawn(scenario); assertNoAdSdk(scenario);
        assertEquals("Capture semantic state changed", "true", js(scenario, "(" + CLEAN + ") && (" + predicate + ")"));
        String description = (String) new JSONTokener(js(scenario,
                "JSON.stringify({route:location.hash||'#home',heading:document.querySelector('#main h1')?.textContent,"
                + "viewport:{width:innerWidth,height:innerHeight},scroll:{x:scrollX,y:scrollY},"
                + "searchResultFrame:" + (searchResultSelector == null ? "null" : searchResultFrame(searchResultSelector)) + ","
                + "search:document.querySelector('#search')?.value||null,"
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
                .put("plannedAgePath", "Finish tutorial while age is unknown; then select native under-14 band for a 13-year-old demo")
                .put("ageSelectionCompleted", false).put("tutorialUnknownAgeNoSdkVerified", false).put("observedAgePath", "not-yet-observed")
                .put("salesEnabled", false).put("releaseStatus", "Internal test build; production release and approval not asserted")
                .put("speechValidation", "Japanese voice installation and physical audio audibility are not established by screenshots")
                .put("screens", screens);
        writeManifest(manifest);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            try {
            scenario.onActivity(activity -> activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
            until(scenario, "!!document.querySelector('.level-progress-grid') && !!document.querySelector('.tutorial')");
            verifyTutorialUnknownAge(scenario);
            manifest.put("tutorialUnknownAgeNoSdkVerified", true).put("observedAgePath", "UNKNOWN during tutorial; no ad SDK obtained or initialized");
            for (int step = 0; step < 4; step++) {
                until(scenario, "document.querySelector('.tutorial')?.dataset.step==='" + step + "'");
                click(scenario, "[data-action=\"tutorial-next\"]");
            }
            until(scenario, "document.querySelector('.tutorial')?.dataset.step==='4'");
            click(scenario, "[data-action=\"tutorial-finish\"]");
            until(scenario, "!document.querySelector('.tutorial') && !document.querySelector('#app').inert");
            // The shipped app reports tutorial while onboarding is open. Only completion reports home and offers age selection.
            selectUnderFourteen(scenario);
            manifest.put("ageSelectionCompleted", true).put("observedAgePath", "UNDER_FOURTEEN selected through native picker on home; no ad SDK obtained or initialized");
            capture(scenario, "01-home.jpg", "home", "!!document.querySelector('.home-dashboard .level-progress-grid')",
                    "Fresh install; verify unknown age/no ad SDK during tutorial; complete all five steps; select native under-14 band on home");

            click(scenario, ".bottom-nav a[href=\"#words\"]"); until(scenario, "!!document.querySelector('#search')");
            js(scenario, "document.querySelector('#search').value='学校';document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}));true");
            String schoolResult = "#word-results .word-button[data-id=\"" + SCHOOL + "\"]";
            String schoolVisible = "(()=>{const f=" + searchResultFrame(schoolResult) + ";return !!f && f.scroll.y>0"
                    + " && f.headword?.text==='学校' && f.headword.visible && f.reading?.text==='がっこう' && f.reading.visible"
                    + " && f.meaning?.text.includes('학교') && f.meaning.visible && f.card.visible"
                    + " && f.search.visible && f.filters.visible && f.resultCount.visible;})()";
            capture(scenario, "02-vocabulary-search.jpg", "vocabulary-search",
                    "location.hash==='#words' && document.querySelector('#search').value==='学校'"
                    + " && !!document.querySelector('#word-results .word-button[data-id=\"" + SCHOOL + "\"]')"
                    + " && document.querySelector('#word-results-status').textContent.includes('검색 결과') && " + schoolVisible,
                    "Use bottom vocabulary tab; enter 学校 in the real search input; scroll the live app so 学校, がっこう, 학교 and its full card are visible above bottom navigation, retaining search/filter/result-count context",
                    schoolResult);

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
                try { failureDiagnostics(scenario, failure); } catch (Throwable diagnosticsFailure) { failure.addSuppressed(diagnosticsFailure); }
                throw failure;
            }
        } catch (Throwable failure) {
            manifest.put("status", "failed").put("failure", failure.toString()); throw failure;
        } finally {
            manifest.put("elapsedMs", SystemClock.elapsedRealtime() - started).put("finishedAtUnixMillis", System.currentTimeMillis());
            writeManifest(manifest);
        }
    }
}
