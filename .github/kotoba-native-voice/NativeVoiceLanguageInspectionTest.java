package com.studio501.kotoba;

import static org.junit.Assert.*;
import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.UiAutomation;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Disposable CI UI observation only. System/engine checks can perform automatic state/network activity. */
@RunWith(AndroidJUnit4.class)
public final class NativeVoiceLanguageInspectionTest {
    private static final String GOOGLE = "com.google.android.tts";
    private static final String LIST_ID = GOOGLE + ":id/locales_list";
    private static final String ROW_ID = GOOGLE + ":id/voice_locale_name";
    private static final String SNAPSHOT = "KOTOBA_NATIVE_VOICE_LANGUAGE_SNAPSHOT_JSON=";
    private static final String REPORT = "KOTOBA_NATIVE_VOICE_LANGUAGE_INSPECTION_JSON=";
    private UiAutomation automation;
    private JSONObject report;
    private long deadline;
    private String engineLabel;

    @Test(timeout = 100000) public void observeJapaneseAndKoreanDetailsWithoutInstallingOrPlaying() throws Exception {
        deadline = SystemClock.elapsedRealtime() + 80000;
        Bundle args = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Explicit language inspection opt-in required", "true".equals(args.getString("nativeVoiceLanguageInspection")));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("true", args.getString("ciIsolatedEmulator"));
        assertEquals("internal_debug", BuildConfig.BUILD_STAGE);
        assertFalse(BuildConfig.SELLING_ENABLED);
        assertEquals("com.studio501.kotoba.debug", context.getPackageName());
        assertTrue("Isolated emulator only", "ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE));
        report = new JSONObject().put("schemaVersion", 1).put("status", "INSPECTION_INCOMPLETE").put("inspectionComplete", false)
                .put("japaneseDetailObserved", false).put("koreanDetailObserved", false)
                .put("navigationClickCount", 0).put("languageSelectionClickCount", 0).put("backNavigationCount", 0)
                .put("scrollActionAttemptCount", 0).put("scrollActionAcceptedCount", 0)
                .put("japaneseScrollCount", 0).put("koreanScrollCount", 0).put("snapshotCount", 0)
                .put("languageInstallActionPerformed", false).put("voiceSampleActionPerformed", false)
                .put("loginActionPerformed", false).put("termsAcceptanceActionPerformed", false).put("engineSelectionActionPerformed", false)
                .put("speakerPlaybackPerformed", false).put("foregroundServiceVerified", false)
                .put("demonstrationVideoCreated", false).put("productionReleaseApproved", false).put("accountRequirementVerified", false)
                .put("networkAvailableAtStart", networkAvailable(context))
                .put("networkObservationMeaning", "Internet-capable Android network observed; connectivity is not tested")
                .put("scope", "Language-row navigation only; no install, sample, account, terms or engine-selection action");
        automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        try {
            if (automation == null || automation.getServiceInfo() == null) { stop("UiAutomation unavailable"); return; }
            AccessibilityServiceInfo accessibility = automation.getServiceInfo();
            accessibility.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
            automation.setServiceInfo(accessibility);
            PackageManager manager = context.getPackageManager();
            Intent settings = new Intent("com.android.settings.TTS_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ResolveInfo activity = manager.resolveActivity(settings, PackageManager.MATCH_DEFAULT_ONLY);
            ResolveInfo engine = manager.resolveService(new Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE).setPackage(GOOGLE), 0);
            if (activity == null || activity.activityInfo == null || !activity.activityInfo.exported || !systemApp(activity.activityInfo.applicationInfo)
                    || engine == null || engine.serviceInfo == null || !systemApp(engine.serviceInfo.applicationInfo)) {
                stop("Exported system TTS settings or existing Google engine unavailable"); return;
            }
            engineLabel = engine.loadLabel(manager).toString();
            String settingsPackage = activity.activityInfo.packageName;
            report.put("resolvedSettingsPackage", settingsPackage).put("resolvedSettingsClass", bounded(activity.activityInfo.name))
                    .put("engineLabel", bounded(engineLabel)).put("targetActivityLaunchAttempted", true);
            settings.setClassName(settingsPackage, activity.activityInfo.name);
            context.startActivity(settings);
            report.put("startActivityCallReturned", true);
            Page page = awaitPage("tts_settings", settingsPackage, "SETTINGS", null, null, null);
            if (!page.ready) { stop("TTS settings/Google engine context not confirmed"); return; }
            AccessibilityNodeInfo gear = uniqueId(page.nodes, settingsPackage, "com.android.settings:id/settings_button");
            if (!clickable(gear, settingsPackage) || !gear.refresh() || !clickable(gear, settingsPackage)
                    || !"com.android.settings:id/settings_button".equals(gear.getViewIdResourceName()) || !timeLeft()) {
                stop("Exact direct gear node unavailable or budget expired"); return;
            }
            if (!gear.performAction(AccessibilityNodeInfo.ACTION_CLICK)) { stop("Gear action rejected"); return; }
            increment("navigationClickCount");
            page = awaitPage("google_engine_settings", GOOGLE, "ENGINE", null, null, null);
            if (!page.ready) { stop("Google engine voice-data navigation not confirmed"); return; }
            AccessibilityNodeInfo install = installNavigation(page.nodes);
            if (install == null || !timeLeft() || !install.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                stop("Install voice data navigation unavailable/rejected"); return;
            }
            increment("navigationClickCount");
            page = awaitPage("voice_data_list", GOOGLE, "LIST", null, null, null);
            if (!page.ready) { stop("Actual Google voice-data list not confirmed"); return; }
            if (!observeLanguage(page, "Japanese", "japanese")) return;
            if (!timeLeft() || !automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)) { stop("Back to language list rejected"); return; }
            increment("backNavigationCount");
            page = awaitPage("voice_data_list_after_back", GOOGLE, "LIST", null, null, null);
            if (!page.ready) { stop("Google language-list context not restored after Back"); return; }
            if (!observeLanguage(page, "Korean", "korean")) return;
            if (!timeLeft()) { stop("Global observation budget expired"); return; }
            report.put("status", "LANGUAGE_SCREENS_OBSERVED").put("inspectionComplete", true)
                    .put("stopReason", "Both selected language contexts observed; no install or sample action selected");
        } catch (Exception failure) {
            report.put("status", "INSPECTION_ERROR").put("stopReason", bounded(failure.getClass().getSimpleName() + ": " + failure.getMessage()));
            throw failure;
        } finally {
            // Preserve the actual end-of-inspection network observation before Home/guest teardown.
            report.put("networkAvailableAtEnd", networkAvailable(context));
            if (automation != null) try { report.put("homeNavigationReturned", automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)); }
            catch (RuntimeException unavailable) { report.put("homeNavigationError", bounded(unavailable.getClass().getSimpleName())); }
            emit(REPORT, report);
        }
    }

    private boolean observeLanguage(Page page, String language, String key) throws Exception {
        for (int attempts = 0; attempts <= 10 && timeLeft(); attempts++) {
            if (!page.ready) { stop("Language-list context changed while finding " + language); return false; }
            List<AccessibilityNodeInfo> matches = new ArrayList<>();
            for (AccessibilityNodeInfo node : page.nodes) if (localeRow(node, deadline) && languageLabel(safe(node.getText()).trim(), language)) matches.add(node);
            if (matches.size() > 1) { stop("Ambiguous visible " + language + " locale rows"); return false; }
            if (matches.size() == 1) {
                AccessibilityNodeInfo row = matches.get(0);
                if (!row.refresh() || !localeRow(row, deadline) || !languageLabel(safe(row.getText()).trim(), language) || !timeLeft()) {
                    stop("Selected locale row changed or budget expired"); return false;
                }
                String selected = safe(row.getText()).trim();
                if (!row.performAction(AccessibilityNodeInfo.ACTION_CLICK)) { stop("Locale-row navigation rejected"); return false; }
                increment("languageSelectionClickCount");
                report.put(key + "SelectedLabel", selected);
                Page detail = awaitPage(key + "_detail", GOOGLE, "DETAIL", language, selected, null);
                report.put(key + "DetailObserved", detail.ready);
                if (!detail.ready) { stop("Selected " + language + " detail context not confirmed; inspect actual snapshot"); return false; }
                return true;
            }
            if (attempts == 10) { stop("Ten-scroll limit reached without visible " + language + " row"); return false; }
            AccessibilityNodeInfo list = uniqueId(page.nodes, GOOGLE, LIST_ID);
            if (list == null || !list.refresh() || !usable(list, GOOGLE) || !LIST_ID.equals(list.getViewIdResourceName())
                    || !list.isScrollable() || !supports(list, AccessibilityNodeInfo.ACTION_SCROLL_FORWARD) || !timeLeft()) {
                stop("Observed locale list has no permitted forward-scroll action"); return false;
            }
            String before = fingerprint(page.nodes, deadline);
            if (!timeLeft()) { stop("Global observation budget expired before scrolling"); return false; }
            increment("scrollActionAttemptCount");
            if (!list.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) { stop("Forward-scroll action rejected"); return false; }
            increment("scrollActionAcceptedCount"); increment(key + "ScrollCount");
            page = awaitPage(key + "_scroll_" + (attempts + 1), GOOGLE, "LIST", null, null, before);
            if (!page.ready) { stop("Locale viewport did not change into a confirmed list after scrolling"); return false; }
        }
        stop("Global observation budget expired while finding " + language); return false;
    }

    private Page awaitPage(String stage, String expectedPackage, String kind, String language, String selected, String previous) throws Exception {
        long started = SystemClock.elapsedRealtime(), waitDeadline = Math.min(deadline, started + 8000);
        Page page = new Page();
        int polls = 0;
        String error = "";
        while (SystemClock.elapsedRealtime() < waitDeadline && polls < 40) {
            polls++; page = new Page();
            try {
                AccessibilityNodeInfo root = activeRoot(waitDeadline);
                page.rootPackage = root == null ? "" : safe(root.getPackageName());
                collect(root, page.nodes, 0, new int[]{0}, waitDeadline);
                boolean content = "SETTINGS".equals(kind) ? settingsTitle(page.nodes, expectedPackage) && exact(page.nodes, expectedPackage, engineLabel)
                        : "ENGINE".equals(kind) ? exact(page.nodes, GOOGLE, "Install voice data")
                        : "LIST".equals(kind) ? listContext(page.nodes, waitDeadline) && (previous == null || !previous.equals(fingerprint(page.nodes, waitDeadline)))
                        : !containsId(page.nodes, GOOGLE, LIST_ID) && (exact(page.nodes, GOOGLE, selected) || exact(page.nodes, GOOGLE, language));
                page.ready = expectedPackage.equals(page.rootPackage) && !page.nodes.isEmpty() && content && SystemClock.elapsedRealtime() < waitDeadline;
                if (page.ready) break;
            } catch (RuntimeException unavailable) { error = bounded(unavailable.getClass().getSimpleName() + ": " + unavailable.getMessage()); }
            long remaining = waitDeadline - SystemClock.elapsedRealtime();
            if (remaining > 0) SystemClock.sleep(Math.min(200, remaining));
        }
        JSONObject readiness = new JSONObject().put("stage", stage).put("rootPackage", bounded(page.rootPackage)).put("screenContextReady", page.ready)
                .put("polls", polls).put("waitMillis", SystemClock.elapsedRealtime() - started)
                .put("deadlineExpired", SystemClock.elapsedRealtime() >= waitDeadline).put("lastPollingError", error);
        JSONArray rows = new JSONArray();
        for (AccessibilityNodeInfo node : page.nodes) {
            if (rows.length() >= 32) break;
            JSONArray actions = new JSONArray();
            List<AccessibilityNodeInfo.AccessibilityAction> available = node.getActionList();
            for (int i = 0; available != null && i < Math.min(available.size(), 12); i++) actions.put(available.get(i).getId());
            rows.put(new JSONObject().put("package", bounded(node.getPackageName())).put("class", bounded(node.getClassName()))
                    .put("text", bounded(node.getText())).put("contentDescription", bounded(node.getContentDescription()))
                    .put("viewId", bounded(node.getViewIdResourceName())).put("clickable", node.isClickable()).put("enabled", node.isEnabled())
                    .put("checkable", node.isCheckable()).put("scrollable", node.isScrollable()).put("actions", actions));
        }
        JSONObject snapshot = new JSONObject().put("schemaVersion", 1).put("stage", stage).put("uiReadiness", readiness)
                .put("nodes", rows).put("visibleNodesScanned", page.nodes.size());
        while (rows.length() > 0 && snapshot.toString().length() > 18000) rows.remove(rows.length() - 1);
        snapshot.put("rowsTruncated", page.nodes.size() > rows.length());
        emit(SNAPSHOT, snapshot); increment("snapshotCount");
        if (!report.has("observations")) report.put("observations", new JSONArray());
        report.getJSONArray("observations").put(readiness);
        if (!timeLeft()) page.ready = false;
        return page;
    }

    private AccessibilityNodeInfo activeRoot(long limit) {
        if (SystemClock.elapsedRealtime() >= limit) return null;
        AccessibilityNodeInfo root = automation.getRootInActiveWindow();
        if (root != null || SystemClock.elapsedRealtime() >= limit) return root;
        List<AccessibilityWindowInfo> windows = automation.getWindows();
        for (int i = 0; windows != null && i < Math.min(windows.size(), 4) && SystemClock.elapsedRealtime() < limit; i++) {
            AccessibilityWindowInfo window = windows.get(i);
            if (window.isActive() && window.isFocused()) { root = window.getRoot(); if (root != null) return root; }
        }
        return null;
    }
    private static void collect(AccessibilityNodeInfo node, List<AccessibilityNodeInfo> nodes, int depth, int[] count, long limit) {
        if (node == null || depth > 16 || count[0] >= 200 || SystemClock.elapsedRealtime() >= limit) return;
        count[0]++; if (node.isVisibleToUser()) nodes.add(node);
        for (int i = 0; i < node.getChildCount() && count[0] < 200 && SystemClock.elapsedRealtime() < limit; i++) collect(node.getChild(i), nodes, depth + 1, count, limit);
    }
    private boolean listContext(List<AccessibilityNodeInfo> nodes, long limit) {
        if (!exact(nodes, GOOGLE, "Google TTS voice data") || uniqueId(nodes, GOOGLE, LIST_ID) == null) return false;
        for (AccessibilityNodeInfo node : nodes) if (localeRow(node, limit)) return SystemClock.elapsedRealtime() < limit;
        return false;
    }
    private static boolean localeRow(AccessibilityNodeInfo node, long limit) {
        if (!clickable(node, GOOGLE) || !ROW_ID.equals(node.getViewIdResourceName()) || !"android.widget.TextView".contentEquals(safe(node.getClassName()))
                || safe(node.getText()).trim().isEmpty() || safe(node.getText()).length() > 96) return false;
        AccessibilityNodeInfo parent = node;
        for (int depth = 0; depth < 16 && SystemClock.elapsedRealtime() < limit; depth++) {
            parent = parent.getParent();
            if (parent == null || !GOOGLE.contentEquals(safe(parent.getPackageName()))) return false;
            if (LIST_ID.equals(parent.getViewIdResourceName())) return usable(parent, GOOGLE) && SystemClock.elapsedRealtime() < limit;
        }
        return false;
    }
    private static boolean languageLabel(String label, String language) {
        return label.length() <= 96 && (label.equals(language)
                || label.startsWith(language + " (") && label.endsWith(")") && label.length() > language.length() + 3);
    }
    private static AccessibilityNodeInfo uniqueId(List<AccessibilityNodeInfo> nodes, String pkg, String id) {
        AccessibilityNodeInfo match = null; int count = 0;
        for (AccessibilityNodeInfo node : nodes) if (pkg.contentEquals(safe(node.getPackageName())) && id.equals(node.getViewIdResourceName())) {
            count++; if (usable(node, pkg)) match = node;
        }
        return count == 1 ? match : null;
    }
    private static boolean containsId(List<AccessibilityNodeInfo> nodes, String pkg, String id) {
        for (AccessibilityNodeInfo node : nodes) if (pkg.contentEquals(safe(node.getPackageName())) && id.equals(node.getViewIdResourceName())) return true;
        return false;
    }
    private static boolean settingsTitle(List<AccessibilityNodeInfo> nodes, String pkg) {
        AccessibilityNodeInfo toolbar = uniqueId(nodes, pkg, "com.android.settings:id/collapsing_toolbar");
        return toolbar != null && ("Text-to-speech output".equals(safe(toolbar.getText()).trim()) || "Text-to-speech output".equals(safe(toolbar.getContentDescription()).trim()));
    }
    private static boolean exact(List<AccessibilityNodeInfo> nodes, String pkg, String label) {
        if (label == null) return false;
        for (AccessibilityNodeInfo node : nodes) if (node.isVisibleToUser() && pkg.contentEquals(safe(node.getPackageName()))
                && (label.equals(safe(node.getText()).trim()) || label.equals(safe(node.getContentDescription()).trim()))) return true;
        return false;
    }
    private AccessibilityNodeInfo installNavigation(List<AccessibilityNodeInfo> nodes) {
        AccessibilityNodeInfo match = null;
        for (AccessibilityNodeInfo node : nodes) {
            if (!usable(node, GOOGLE) || !("Install voice data".equals(safe(node.getText()).trim()) || "Install voice data".equals(safe(node.getContentDescription()).trim()))) continue;
            AccessibilityNodeInfo target = node;
            for (int i = 0; i < 3 && target != null && !target.isClickable() && timeLeft(); i++) target = target.getParent();
            if (!clickable(target, GOOGLE)) continue;
            if (match != null && !match.equals(target)) return null;
            match = target;
        }
        return match;
    }
    private static String fingerprint(List<AccessibilityNodeInfo> nodes, long limit) {
        StringBuilder labels = new StringBuilder();
        for (AccessibilityNodeInfo node : nodes) {
            if (SystemClock.elapsedRealtime() >= limit) break;
            if (localeRow(node, limit)) labels.append(safe(node.getText()).trim()).append('\n');
        }
        return labels.toString();
    }
    private static boolean supports(AccessibilityNodeInfo node, int action) {
        List<AccessibilityNodeInfo.AccessibilityAction> actions = node.getActionList();
        if (actions == null) return false;
        for (AccessibilityNodeInfo.AccessibilityAction item : actions) if (item.getId() == action) return true;
        return false;
    }
    private static boolean usable(AccessibilityNodeInfo node, String pkg) {
        return node != null && node.isVisibleToUser() && node.isEnabled() && !node.isCheckable() && pkg.contentEquals(safe(node.getPackageName()));
    }
    private static boolean clickable(AccessibilityNodeInfo node, String pkg) { return usable(node, pkg) && node.isClickable(); }
    private static boolean systemApp(ApplicationInfo info) { return info != null && (info.flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0; }
    private static boolean networkAvailable(Context context) {
        ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        for (Network network : manager.getAllNetworks()) {
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
            if (capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return true;
        }
        return false;
    }
    private boolean timeLeft() { return SystemClock.elapsedRealtime() < deadline; }
    private void increment(String key) throws Exception { report.put(key, report.optInt(key) + 1); }
    private void stop(String reason) throws Exception { report.put("status", "INSPECTION_INCOMPLETE").put("inspectionComplete", false).put("stopReason", reason); }
    private static String safe(CharSequence value) { return value == null ? "" : value.toString(); }
    private static String bounded(CharSequence value) { String text = safe(value).replaceAll("[\\p{Cntrl}]", " "); return text.substring(0, Math.min(text.length(), 96)); }
    private static void emit(String marker, JSONObject value) {
        assertTrue("Bounded diagnostic only", value.toString().length() <= 20000);
        Bundle stream = new Bundle(); stream.putString("stream", "\n" + marker + value + "\n");
        InstrumentationRegistry.getInstrumentation().sendStatus(0, stream);
    }
    private static final class Page { final List<AccessibilityNodeInfo> nodes = new ArrayList<>(); String rootPackage = ""; boolean ready; }
}
