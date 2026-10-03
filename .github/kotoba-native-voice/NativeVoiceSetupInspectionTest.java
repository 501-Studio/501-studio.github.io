package com.studio501.kotoba;

import static org.junit.Assert.*;
import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.UiAutomation;
import android.app.KeyguardManager;
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
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
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
        long observationDeadline = SystemClock.elapsedRealtime() + 35000;
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
                .put("targetActivityLaunchAttempted", false).put("startActivityCallReturned", false)
                .put("scope", "Isolated offline guest system-check UI; automatic OS/engine state writes are possible");
        UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        try {
            if (automation == null) { report.put("status", "INSPECTION_UNAVAILABLE").put("stopReason", "UiAutomation unavailable"); return; }
            AccessibilityServiceInfo accessibility = automation.getServiceInfo();
            if (accessibility == null) { report.put("status", "INSPECTION_UNAVAILABLE").put("stopReason", "Accessibility service info unavailable"); return; }
            // Official UiAutomation.getWindows() requires this opt-in; preserve existing flags.
            accessibility.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                    | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
            automation.setServiceInfo(accessibility);
            report.put("requestedAccessibilityFlags", accessibility.flags).put("accessibilityCapabilities", accessibility.getCapabilities());
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
            report.put("targetActivityLaunchAttempted", true);
            context.startActivity(settings); // Cross-process activity: do not use startActivitySync.
            report.put("startActivityCallReturned", true); // Does not prove BAL acceptance or foreground launch.
            List<AccessibilityNodeInfo> page = snapshot(context, automation, "tts_settings", settingsPackage, engineLabel, report, observationDeadline);
            boolean contextVerified = report.optBoolean("lastScreenContextReady") && report.optBoolean("lastExpectedRootPackageObserved")
                    && hasTtsToolbarTitle(page, settingsPackage)
                    && hasText(page, settingsPackage, engineLabel);
            report.put("ttsSettingsGoogleContextObserved", contextVerified);
            if (!contextVerified) { report.put("stopReason", "Current UI did not establish TTS settings and the Google engine context"); return; }
            AccessibilityNodeInfo gear = uniqueGear(page, settingsPackage);
            if (gear == null) { report.put("stopReason", "No unambiguous visible TTS engine settings navigation node"); return; }
            if (SystemClock.elapsedRealtime() >= observationDeadline) { report.put("stopReason", "Observation budget expired before engine settings navigation"); return; }
            if (!gear.performAction(AccessibilityNodeInfo.ACTION_CLICK)) { report.put("stopReason", "TTS settings navigation click rejected"); return; }
            report.put("navigationClickCount", 1).put("gearNavigationViewId", bounded(gear.getViewIdResourceName()));
            page = snapshot(context, automation, "google_engine_settings", GOOGLE_ENGINE, engineLabel, report, observationDeadline);
            boolean engineSettingsObserved = report.optBoolean("lastScreenContextReady") && report.optBoolean("lastExpectedRootPackageObserved")
                    && hasText(page, GOOGLE_ENGINE, "Install voice data");
            report.put("googleEngineSettingsObserved", engineSettingsObserved);
            if (!engineSettingsObserved) { report.put("stopReason", "Current UI did not establish Google engine voice-data navigation"); return; }
            AccessibilityNodeInfo installPage = uniqueNavigation(page, GOOGLE_ENGINE, "Install voice data", true);
            if (installPage == null) { report.put("stopReason", "No unambiguous visible Install voice data navigation node"); return; }
            if (SystemClock.elapsedRealtime() >= observationDeadline) { report.put("stopReason", "Observation budget expired before voice-data navigation"); return; }
            if (!installPage.performAction(AccessibilityNodeInfo.ACTION_CLICK)) { report.put("stopReason", "Voice data navigation click rejected"); return; }
            report.put("navigationClickCount", 2).put("voiceDataNavigationClicked", true);
            page = snapshot(context, automation, "voice_data_after_navigation", GOOGLE_ENGINE, engineLabel, report, observationDeadline);
            // Confirm the observed Google voice-data title/list/item IDs, without selecting a language.
            boolean voiceDataObserved = report.optBoolean("lastScreenContextReady") && report.optBoolean("lastExpectedRootPackageObserved")
                    && hasGoogleVoiceDataScreen(page, observationDeadline)
                    && uniqueNavigation(page, GOOGLE_ENGINE, "Install voice data", true) == null;
            report.put("googleVoiceDataScreenObserved", voiceDataObserved);
            if (!voiceDataObserved) { report.put("stopReason", "Current UI did not establish the Google voice-data destination screen"); return; }
            if (SystemClock.elapsedRealtime() >= observationDeadline) { report.put("stopReason", "Observation budget expired before completion"); return; }
            report.put("status", "OBSERVATION_COMPLETE").put("inspectionComplete", true);
            report.put("stopReason", "Observation only after entering voice-data navigation; no language or installation action selected");
        } catch (Exception failure) {
            report.put("status", "INSPECTION_ERROR").put("stopReason", bounded(failure.getClass().getSimpleName() + ": " + failure.getMessage()));
            throw failure;
        } finally {
            if (automation != null) try {
                report.put("homeNavigationReturned", automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME));
            } catch (RuntimeException unavailable) { report.put("homeNavigationError", bounded(unavailable.getClass().getSimpleName())); }
            report.put("guestInternetUnavailableAfterInspection", noInternetNetwork(context));
            emit(REPORT_MARKER, report);
        }
    }

    private static List<AccessibilityNodeInfo> snapshot(Context context, UiAutomation automation, String stage,
            String expectedPackage, String engineLabel, JSONObject report, long observationDeadline) throws Exception {
        List<AccessibilityNodeInfo> nodes = new ArrayList<>();
        AccessibilityNodeInfo root = null;
        long started = SystemClock.elapsedRealtime();
        long waitDeadline = Math.min(observationDeadline, started + 8000);
        int polls = 0;
        String error = "";
        String[] source = {"NONE"};
        boolean packageObserved = false, contextReady = false;
        while (SystemClock.elapsedRealtime() < waitDeadline && polls < 40) {
            polls++;
            nodes = new ArrayList<>();
            root = null;
            source[0] = "NONE";
            try {
                root = activeRoot(automation, source, waitDeadline);
                collect(root, nodes, 0, new int[]{0}, waitDeadline);
                packageObserved = root != null && expectedPackage.contentEquals(safe(root.getPackageName())) && !nodes.isEmpty();
                contextReady = packageObserved && ("tts_settings".equals(stage)
                        ? hasTtsToolbarTitle(nodes, expectedPackage) && hasText(nodes, expectedPackage, engineLabel)
                        : "google_engine_settings".equals(stage) ? hasText(nodes, expectedPackage, "Install voice data")
                        : hasGoogleVoiceDataScreen(nodes, waitDeadline)
                          && uniqueNavigation(nodes, expectedPackage, "Install voice data", true) == null);
                if (SystemClock.elapsedRealtime() >= waitDeadline) contextReady = false;
                if (contextReady) break;
            } catch (RuntimeException unavailable) {
                packageObserved = false; contextReady = false;
                error = bounded(unavailable.getClass().getSimpleName() + ": " + unavailable.getMessage());
            }
            long remaining = waitDeadline - SystemClock.elapsedRealtime();
            if (remaining > 0) SystemClock.sleep(Math.min(200, remaining));
        }
        JSONObject readiness = new JSONObject().put("stage", stage).put("polls", polls)
                .put("waitMillis", SystemClock.elapsedRealtime() - started).put("rootPresent", root != null)
                .put("rootPackage", bounded(root == null ? null : root.getPackageName())).put("rootSource", source[0])
                .put("expectedRootPackageObserved", packageObserved).put("screenContextReady", contextReady)
                .put("deadlineExpired", SystemClock.elapsedRealtime() >= waitDeadline)
                .put("lastPollingError", error);
        report.put("lastExpectedRootPackageObserved", packageObserved).put("lastScreenContextReady", contextReady);
        if (!report.has("uiReadiness")) report.put("uiReadiness", new JSONArray());
        report.getJSONArray("uiReadiness").put(readiness);
        if (!contextReady) report.put("failureUiDiagnostic", uiDiagnostic(context, automation, root, report, observationDeadline));
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
                .put("uiReadiness", readiness)
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

    private static AccessibilityNodeInfo activeRoot(UiAutomation automation, String[] source, long deadline) {
        if (SystemClock.elapsedRealtime() >= deadline) return null;
        AccessibilityNodeInfo root = automation.getRootInActiveWindow();
        if (root != null) { source[0] = "getRootInActiveWindow"; return root; }
        if (SystemClock.elapsedRealtime() >= deadline) return null;
        // Only a currently active AND focused interactive window can provide a fallback root.
        List<AccessibilityWindowInfo> windows = automation.getWindows();
        if (windows != null) for (int i = 0; i < Math.min(windows.size(), 4) && SystemClock.elapsedRealtime() < deadline; i++) {
            AccessibilityWindowInfo window = windows.get(i);
            if (!window.isActive() || !window.isFocused()) continue;
            root = window.getRoot();
            if (root != null) { source[0] = "getWindows.activeFocused"; return root; }
        }
        return null;
    }

    private static JSONObject uiDiagnostic(Context context, UiAutomation automation, AccessibilityNodeInfo root,
            JSONObject report, long observationDeadline) throws Exception {
        JSONObject diagnostic = new JSONObject().put("causeConfirmed", false)
                .put("targetActivityLaunchAttempted", report.optBoolean("targetActivityLaunchAttempted"))
                .put("startActivityCallReturned", report.optBoolean("startActivityCallReturned"))
                .put("activeRootPresent", root != null).put("activeRootPackage", bounded(root == null ? null : root.getPackageName()));
        KeyguardManager keyguard = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (keyguard != null) diagnostic.put("keyguardLocked", keyguard.isKeyguardLocked()).put("deviceLocked", keyguard.isDeviceLocked());
        if (power != null) diagnostic.put("screenInteractive", power.isInteractive());
        JSONArray rows = new JSONArray();
        try {
            List<AccessibilityWindowInfo> windows = SystemClock.elapsedRealtime() < observationDeadline ? automation.getWindows() : null;
            if (windows == null) diagnostic.put("windowQueryUnavailable", true);
            else diagnostic.put("windowCount", windows.size());
            if (windows != null) for (int i = 0; i < Math.min(windows.size(), 4); i++) {
                AccessibilityWindowInfo window = windows.get(i);
                JSONObject row = new JSONObject().put("id", window.getId()).put("type", window.getType())
                        .put("active", window.isActive()).put("focused", window.isFocused());
                if ((window.isActive() || window.isFocused()) && SystemClock.elapsedRealtime() + 2000 < observationDeadline) {
                    AccessibilityNodeInfo windowRoot = window.getRoot();
                    row.put("rootPresent", windowRoot != null).put("package", bounded(windowRoot == null ? null : windowRoot.getPackageName()));
                }
                rows.put(row);
            }
        } catch (RuntimeException unavailable) { diagnostic.put("windowQueryError", bounded(unavailable.getClass().getSimpleName())); }
        return diagnostic.put("windows", rows);
    }

    private static void collect(AccessibilityNodeInfo node, List<AccessibilityNodeInfo> result, int depth, int[] visited, long deadline) {
        if (node == null || depth > 16 || visited[0] >= MAX_VISITED || SystemClock.elapsedRealtime() >= deadline) return;
        visited[0]++;
        if (node.isVisibleToUser()) result.add(node);
        for (int i = 0; i < node.getChildCount() && visited[0] < MAX_VISITED && SystemClock.elapsedRealtime() < deadline; i++)
            collect(node.getChild(i), result, depth + 1, visited, deadline);
    }

    private static boolean hasTtsToolbarTitle(List<AccessibilityNodeInfo> nodes, String packageName) {
        for (AccessibilityNodeInfo node : nodes) {
            if (!node.isVisibleToUser() || !packageName.contentEquals(safe(node.getPackageName()))
                    || !"com.android.settings:id/collapsing_toolbar".equals(node.getViewIdResourceName())) continue;
            if ("Text-to-speech output".equals(safe(node.getText()).trim())
                    || "Text-to-speech output".equals(safe(node.getContentDescription()).trim())) return true;
        }
        return false;
    }

    private static boolean hasText(List<AccessibilityNodeInfo> nodes, String packageName, String text) {
        for (AccessibilityNodeInfo node : nodes) if (packageName.contentEquals(safe(node.getPackageName()))
                && text.equalsIgnoreCase(safe(node.getText()).trim())) return true;
        return false;
    }

    private static boolean hasGoogleVoiceDataScreen(List<AccessibilityNodeInfo> nodes, long deadline) {
        boolean title = false, list = false, localeItem = false;
        for (AccessibilityNodeInfo node : nodes) {
            if (SystemClock.elapsedRealtime() >= deadline) return false;
            if (!node.isVisibleToUser() || !GOOGLE_ENGINE.contentEquals(safe(node.getPackageName()))) continue;
            String text = safe(node.getText()).trim();
            if ("Google TTS voice data".equals(text)) title = true;
            if ("com.google.android.tts:id/locales_list".equals(node.getViewIdResourceName()) && node.isEnabled()) list = true;
            if ("com.google.android.tts:id/voice_locale_name".equals(node.getViewIdResourceName())
                    && "android.widget.TextView".contentEquals(safe(node.getClassName()))
                    && node.isEnabled() && node.isClickable() && !text.isEmpty() && insideLocalesList(node, deadline)) localeItem = true;
        }
        return title && list && localeItem && SystemClock.elapsedRealtime() < deadline;
    }

    private static boolean insideLocalesList(AccessibilityNodeInfo node, long deadline) {
        AccessibilityNodeInfo parent = node;
        for (int depth = 0; depth < 16 && SystemClock.elapsedRealtime() < deadline; depth++) {
            parent = parent.getParent();
            if (parent == null || !GOOGLE_ENGINE.contentEquals(safe(parent.getPackageName()))) return false;
            if ("com.google.android.tts:id/locales_list".equals(parent.getViewIdResourceName()))
                return parent.isVisibleToUser() && parent.isEnabled() && SystemClock.elapsedRealtime() < deadline;
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
