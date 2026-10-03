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
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeoutException;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Isolated offline CI guest UI inspection. Opening system settings may itself perform system checks/writes. */
@RunWith(AndroidJUnit4.class)
public final class NativeVoiceSetupInspectionTest {
    private static final String SETTINGS_ACTION = "com.android.settings.TTS_SETTINGS";
    private static final String GOOGLE_ENGINE = "com.google.android.tts";
    private static final String SNAPSHOT_MARKER = "KOTOBA_NATIVE_VOICE_SETUP_SNAPSHOT_JSON=";
    private static final String REPORT_MARKER = "KOTOBA_NATIVE_VOICE_SETUP_INSPECTION_JSON=";
    private static final int MAX_VISITED = 200;

    @Test(timeout = 45000) public void observeSettingsAndVoiceDataNavigationOnly() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Explicit setup inspection opt-in required",
                "true".equals(args.getString("nativeVoiceSetupInspection")));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("true", args.getString("ciIsolatedEmulator"));
        assertEquals("internal_debug", BuildConfig.BUILD_STAGE);
        assertFalse(BuildConfig.SELLING_ENABLED);
        assertEquals("com.studio501.kotoba.debug", context.getPackageName());
        assertTrue("Isolated emulator only", "ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE));
        assertTrue("Keep the guest offline before settings can initialize", noInternetNetwork(context));
        JSONObject report = new JSONObject().put("schemaVersion", 1).put("status", "INSPECTION_INCOMPLETE")
                .put("inspectionComplete", false).put("snapshotCount", 0).put("navigationClickCount", 0)
                .put("ttsSettingsGoogleContextObserved", false).put("googleEngineSettingsObserved", false)
                .put("googleVoiceDataScreenObserved", false)
                .put("languageInstallActionPerformed", false).put("loginActionPerformed", false)
                .put("termsAcceptanceActionPerformed", false).put("engineSelectionActionPerformed", false)
                .put("speakerPlaybackPerformed", false).put("foregroundServiceVerified", false)
                .put("demonstrationVideoCreated", false).put("productionReleaseApproved", false)
                .put("accountRequirementVerified", false).put("voiceDataNavigationClicked", false)
                .put("scope", "Isolated offline guest system-check UI; automatic OS/engine state writes are possible");
        UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        try {
            if (automation == null) { report.put("status", "INSPECTION_UNAVAILABLE").put("stopReason", "UiAutomation unavailable"); return; }
            AccessibilityServiceInfo accessibility = automation.getServiceInfo();
            if (accessibility == null) { report.put("status", "INSPECTION_UNAVAILABLE").put("stopReason", "Accessibility service info unavailable"); return; }
            accessibility.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
            automation.setServiceInfo(accessibility);
            PackageManager manager = context.getPackageManager();
            Intent settings = new Intent(SETTINGS_ACTION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ResolveInfo resolved = manager.resolveActivity(settings, PackageManager.MATCH_DEFAULT_ONLY);
            if (resolved == null || resolved.activityInfo == null || !resolved.activityInfo.exported
                    || !systemApplication(resolved.activityInfo.applicationInfo)) {
                report.put("status", "INSPECTION_UNAVAILABLE").put("stopReason", "No exported system settings activity resolves"); return;
            }
            String settingsPackage = resolved.activityInfo.packageName;
            report.put("resolvedSettingsPackage", settingsPackage).put("resolvedSettingsClass", bounded(resolved.activityInfo.name));
            ResolveInfo service = manager.resolveService(new Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE).setPackage(GOOGLE_ENGINE), 0);
            if (service == null || service.serviceInfo == null || !systemApplication(service.serviceInfo.applicationInfo)) {
                report.put("status", "INSPECTION_UNAVAILABLE").put("stopReason", "Existing Google system TTS service not resolved"); return;
            }
            String engineLabel = service.loadLabel(manager).toString();
            report.put("enginePackage", service.serviceInfo.packageName).put("engineLabel", bounded(engineLabel));
            settings.setClassName(settingsPackage, resolved.activityInfo.name);
            context.startActivity(settings); // Cross-process activity: do not use startActivitySync.
            settle(automation);
            List<AccessibilityNodeInfo> page = snapshot(automation, "tts_settings", report);
            boolean contextVerified = hasText(page, settingsPackage, "Text-to-speech output")
                    && hasText(page, settingsPackage, engineLabel);
            report.put("ttsSettingsGoogleContextObserved", contextVerified);
            if (!contextVerified) { report.put("stopReason", "Current UI did not establish TTS settings and the Google engine context"); return; }
            AccessibilityNodeInfo gear = uniqueGear(page, settingsPackage);
            if (gear == null) { report.put("stopReason", "No unambiguous visible TTS engine settings navigation node"); return; }
            if (!gear.performAction(AccessibilityNodeInfo.ACTION_CLICK)) { report.put("stopReason", "TTS settings navigation click rejected"); return; }
            report.put("navigationClickCount", 1).put("gearNavigationViewId", bounded(gear.getViewIdResourceName()));
            settle(automation);
            page = snapshot(automation, "google_engine_settings", report);
            boolean engineSettingsObserved = hasText(page, GOOGLE_ENGINE, "Install voice data");
            report.put("googleEngineSettingsObserved", engineSettingsObserved);
            if (!engineSettingsObserved) { report.put("stopReason", "Current UI did not establish Google engine voice-data navigation"); return; }
            AccessibilityNodeInfo installPage = uniqueNavigation(page, GOOGLE_ENGINE, "Install voice data", true);
            if (installPage == null) { report.put("stopReason", "No unambiguous visible Install voice data navigation node"); return; }
            if (!installPage.performAction(AccessibilityNodeInfo.ACTION_CLICK)) { report.put("stopReason", "Voice data navigation click rejected"); return; }
            report.put("navigationClickCount", 2).put("voiceDataNavigationClicked", true);
            settle(automation);
            page = snapshot(automation, "voice_data_after_navigation", report);
            // A title plus actual language-menu content, and no remaining clickable settings row,
            // distinguishes the destination from an unchanged engine-settings screen.
            boolean voiceDataObserved = hasText(page, GOOGLE_ENGINE, "Install voice data")
                    && hasLanguageMenuRow(page, GOOGLE_ENGINE)
                    && uniqueNavigation(page, GOOGLE_ENGINE, "Install voice data", true) == null;
            report.put("googleVoiceDataScreenObserved", voiceDataObserved);
            if (!voiceDataObserved) { report.put("stopReason", "Current UI did not establish the Google voice-data destination screen"); return; }
            report.put("status", "OBSERVATION_COMPLETE").put("inspectionComplete", true);
            report.put("stopReason", "Observation only after entering voice-data navigation; no language or installation action selected");
        } catch (Exception failure) {
            report.put("status", "INSPECTION_ERROR").put("stopReason", bounded(failure.getClass().getSimpleName() + ": " + failure.getMessage()));
            throw failure;
        } finally {
            if (automation != null) automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME);
            report.put("guestInternetUnavailableAfterInspection", noInternetNetwork(context));
            emit(REPORT_MARKER, report);
        }
    }

    private static List<AccessibilityNodeInfo> snapshot(UiAutomation automation, String stage, JSONObject report) throws Exception {
        List<AccessibilityNodeInfo> nodes = new ArrayList<>();
        collect(automation.getRootInActiveWindow(), nodes, 0, new int[]{0});
        JSONArray rows = new JSONArray(), languages = new JSONArray(), loginText = new JSONArray();
        for (AccessibilityNodeInfo node : nodes) {
            if (rows.length() < 32) rows.put(new JSONObject().put("package", bounded(node.getPackageName()))
                    .put("class", bounded(node.getClassName())).put("text", bounded(node.getText()))
                    .put("contentDescription", bounded(node.getContentDescription()))
                    .put("viewId", bounded(node.getViewIdResourceName())).put("clickable", node.isClickable()).put("enabled", node.isEnabled()));
            String label = (bounded(node.getText()) + " " + bounded(node.getContentDescription())).trim();
            String lower = label.toLowerCase(Locale.ROOT);
            if (languages.length() < 12 && (lower.contains("japanese") || lower.contains("korean") || label.contains("日本語") || label.contains("한국어"))) languages.put(label);
            if (loginText.length() < 8 && (lower.contains("sign in") || lower.contains("log in") || lower.contains("google account"))) loginText.put(label);
        }
        JSONObject observation = new JSONObject().put("schemaVersion", 1).put("stage", stage)
                .put("nodes", rows).put("visibleNodesScanned", nodes.size()).put("rowsTruncated", nodes.size() > rows.length())
                .put("languageRelatedTextObserved", languages).put("loginRelatedTextObserved", loginText)
                .put("accountRequirementVerified", false);
        while (rows.length() > 0 && observation.toString().length() > 18000) rows.remove(rows.length() - 1);
        observation.put("rowsTruncated", nodes.size() > rows.length());
        emit(SNAPSHOT_MARKER, observation);
        report.put("snapshotCount", report.optInt("snapshotCount") + 1);
        if (!report.has("observations")) report.put("observations", new JSONArray());
        report.getJSONArray("observations").put(new JSONObject().put("stage", stage)
                .put("languageRelatedTextObserved", languages).put("loginRelatedTextObserved", loginText));
        return nodes;
    }

    private static void collect(AccessibilityNodeInfo node, List<AccessibilityNodeInfo> result, int depth, int[] visited) {
        if (node == null || depth > 16 || visited[0] >= MAX_VISITED) return;
        visited[0]++;
        if (node.isVisibleToUser()) result.add(node);
        for (int i = 0; i < node.getChildCount() && visited[0] < MAX_VISITED; i++) collect(node.getChild(i), result, depth + 1, visited);
    }

    private static boolean hasText(List<AccessibilityNodeInfo> nodes, String packageName, String text) {
        for (AccessibilityNodeInfo node : nodes) if (packageName.contentEquals(safe(node.getPackageName()))
                && text.equalsIgnoreCase(safe(node.getText()).trim())) return true;
        return false;
    }

    private static boolean hasLanguageMenuRow(List<AccessibilityNodeInfo> nodes, String packageName) {
        for (AccessibilityNodeInfo node : nodes) {
            if (!packageName.contentEquals(safe(node.getPackageName()))) continue;
            String text = safe(node.getText()).trim();
            for (String language : new String[]{"English", "Japanese", "Korean", "German", "Spanish", "French"})
                if (text.equals(language) || text.startsWith(language + " (")) return true;
        }
        return false;
    }

    private static AccessibilityNodeInfo uniqueGear(List<AccessibilityNodeInfo> nodes, String packageName) {
        AccessibilityNodeInfo match = null;
        int identifiers = 0;
        for (AccessibilityNodeInfo node : nodes) {
            if (!packageName.contentEquals(safe(node.getPackageName()))
                    || !"com.android.settings:id/settings_button".equals(node.getViewIdResourceName())) continue;
            identifiers++;
            if (node.isVisibleToUser() && node.isEnabled() && node.isClickable() && !node.isCheckable()) match = node;
        }
        return identifiers == 1 ? match : null; // No parent lookup or engine-row/radio selection.
    }

    private static AccessibilityNodeInfo uniqueNavigation(List<AccessibilityNodeInfo> nodes, String packageName, String label, boolean allowParent) {
        AccessibilityNodeInfo match = null;
        for (AccessibilityNodeInfo node : nodes) {
            if (!packageName.contentEquals(safe(node.getPackageName())) || !node.isEnabled()
                    || !(label.equalsIgnoreCase(safe(node.getText()).trim()) || label.equalsIgnoreCase(safe(node.getContentDescription()).trim()))) continue;
            AccessibilityNodeInfo target = node;
            // The engine gear must itself be clickable. Never promote it to the engine-selection row.
            if (allowParent) for (int i = 0; i < 3 && target != null && !target.isClickable(); i++) target = target.getParent();
            if (target == null || !target.isVisibleToUser() || !target.isEnabled() || !target.isClickable()
                    || !packageName.contentEquals(safe(target.getPackageName())) || target.isCheckable()) continue;
            if (match != null && !match.equals(target)) return null;
            match = target;
        }
        return match;
    }

    private static void settle(UiAutomation automation) {
        try { automation.waitForIdle(500, 5000); } catch (TimeoutException ignored) { }
        SystemClock.sleep(500);
    }
    private static boolean systemApplication(ApplicationInfo info) {
        return info != null && (info.flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0;
    }
    private static boolean noInternetNetwork(Context context) {
        ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        for (Network network : manager.getAllNetworks()) {
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
            if (capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false;
        }
        return true;
    }
    private static String safe(CharSequence text) { return text == null ? "" : text.toString(); }
    private static String bounded(CharSequence text) {
        String value = safe(text).replaceAll("[\\p{Cntrl}]", " ");
        return value.substring(0, Math.min(value.length(), 96));
    }
    private static void emit(String marker, JSONObject value) {
        assertTrue("Diagnostic exceeds fixed stream bound", value.toString().length() <= 20000);
        Bundle stream = new Bundle();
        stream.putString("stream", "\n" + marker + value + "\n");
        InstrumentationRegistry.getInstrumentation().sendStatus(0, stream);
    }
}
