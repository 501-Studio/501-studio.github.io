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
import android.speech.tts.Voice;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Disposable CI Google language-pack preparation only; the separate offline preflight decides readiness. */
@RunWith(AndroidJUnit4.class)
public final class NativeVoiceOfflinePreparationTest {
    private static final String GOOGLE = "com.google.android.tts";
    private static final String LIST_ID = GOOGLE + ":id/locales_list";
    private static final String ROW_ID = GOOGLE + ":id/voice_locale_name";
    private static final String CONTAINER_ID = GOOGLE + ":id/voice_list_container";
    private static final String DOWNLOAD_ID = GOOGLE + ":id/voice_entry_download_button";
    private static final String STATUS_ID = GOOGLE + ":id/voice_entry_status";
    private static final String DELETE_ID = GOOGLE + ":id/voice_entry_delete_button";
    private static final String VOICE_ENTITY_ID = GOOGLE + ":id/morphed_voice_entity";
    private static final String VOICE_NAME_ID = GOOGLE + ":id/morphed_voice_entity_name";
    private static final String SNAPSHOT = "KOTOBA_NATIVE_VOICE_PREPARATION_SNAPSHOT_JSON=";
    private static final String REPORT = "KOTOBA_NATIVE_VOICE_PREPARATION_JSON=";
    private UiAutomation automation;
    private JSONObject report;
    private long deadline;
    private String engineLabel;
    private volatile TextToSpeech tts;

    @Test(timeout = 270000) public void prepareGoogleVoiceDataForSeparateOfflinePreflight() throws Exception {
        deadline = SystemClock.elapsedRealtime() + 240000;
        Bundle args = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Explicit voice preparation opt-in required", "true".equals(args.getString("nativeVoiceOfflinePreparation")));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("true", args.getString("ciIsolatedEmulator"));
        assertEquals("internal_debug", BuildConfig.BUILD_STAGE);
        assertFalse(BuildConfig.SELLING_ENABLED);
        assertEquals("com.studio501.kotoba.debug", context.getPackageName());
        assertTrue("Isolated emulator only", "ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE));
        report = new JSONObject().put("schemaVersion", 1).put("status", "PREPARATION_INCOMPLETE").put("preparationComplete", false)
                .put("japanesePrepared", false).put("koreanPrepared", false).put("freshInventoryComplete", false)
                .put("freshOfflineJapaneseVoiceCount", 0).put("freshOfflineKoreanVoiceCount", 0)
                .put("downloadAttemptCount", 0).put("downloadAcceptedCount", 0)
                .put("japaneseDownloadAttemptCount", 0).put("japaneseDownloadAcceptedCount", 0)
                .put("koreanDownloadAttemptCount", 0).put("koreanDownloadAcceptedCount", 0)
                .put("navigationClickCount", 0).put("languageSelectionClickCount", 0).put("backNavigationCount", 0)
                .put("scrollActionAttemptCount", 0).put("scrollActionAcceptedCount", 0)
                .put("japaneseScrollCount", 0).put("koreanScrollCount", 0).put("snapshotCount", 0)
                .put("languageInstallActionPerformed", false).put("voiceSampleActionPerformed", false)
                .put("loginActionPerformed", false).put("termsAcceptanceActionPerformed", false).put("engineSelectionActionPerformed", false)
                .put("speakerPlaybackPerformed", false).put("physicalAudibilityVerified", false).put("foregroundServiceVerified", false)
                .put("demonstrationVideoCreated", false).put("productionReleaseApproved", false).put("accountRequirementVerified", false)
                .put("actualActiveEnginePackageVerified", false)
                .put("networkAvailableAtStart", networkAvailable(context))
                .put("networkObservationMeaning", "Internet-capable Android network observed; connectivity is not tested")
                .put("scope", "At most one actual Google pack-download attempt per language; metadata preparation only, separate offline preflight required");
        automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        try {
            if (automation == null || automation.getServiceInfo() == null) { stop("UiAutomation unavailable"); return; }
            AccessibilityServiceInfo accessibility = automation.getServiceInfo();
            accessibility.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
            automation.setServiceInfo(accessibility);
            if (!initializeTts(context, "initial")) return;
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
            if (!prepareLanguage(page, "Japanese", "japanese", "ja")) return;
            if (!timeLeft() || !automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)) { stop("Back to language list rejected"); return; }
            increment("backNavigationCount");
            page = awaitPage("voice_data_list_after_back", GOOGLE, "LIST", null, null, null);
            if (!page.ready) { stop("Google language-list context not restored after Back"); return; }
            if (!prepareLanguage(page, "Korean", "korean", "ko")) return;
            shutdownTts();
            if (!initializeTts(context, "fresh") || !confirmFreshInventory()) return;
            if (!timeLeft()) { stop("Global observation budget expired"); return; }
            report.put("status", "VOICE_DATA_PREPARED_FOR_OFFLINE_PREFLIGHT").put("preparationComplete", true)
                    .put("stopReason", "Installed offline ja/ko metadata observed on a fresh default client; separate offline PCM gate still required");
        } catch (Exception failure) {
            report.put("status", "PREPARATION_ERROR").put("preparationComplete", false)
                    .put("stopReason", bounded(failure.getClass().getSimpleName() + ": " + failure.getMessage()));
            throw failure;
        } finally {
            // Preserve the actual end-of-inspection network observation before Home/guest teardown.
            report.put("networkAvailableAtEnd", networkAvailable(context));
            try { shutdownTts(); }
            catch (RuntimeException cleanupFailure) {
                report.put("status", "PREPARATION_ERROR").put("preparationComplete", false)
                        .put("cleanupError", bounded(cleanupFailure.getClass().getSimpleName()));
            }
            if (automation != null) try { report.put("homeNavigationReturned", automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)); }
            catch (RuntimeException unavailable) { report.put("homeNavigationError", bounded(unavailable.getClass().getSimpleName())); }
            emit(REPORT, report);
        }
    }

    private boolean prepareLanguage(Page page, String language, String key, String locale) throws Exception {
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
                return prepareDetail(detail, selected, key, locale);
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

    private boolean initializeTts(Context context, String phase) throws Exception {
        if (!timeLeft()) { stop("Global preparation budget expired before TTS initialization"); return false; }
        long started = SystemClock.elapsedRealtime();
        long limit = Math.min(deadline, started + 8000);
        CountDownLatch initialized = new CountDownLatch(1);
        AtomicInteger status = new AtomicInteger(TextToSpeech.ERROR);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> tts = new TextToSpeech(context, result -> {
            status.set(result); initialized.countDown();
        }));
        long remaining = limit - SystemClock.elapsedRealtime();
        boolean callback = remaining > 0 && initialized.await(remaining, TimeUnit.MILLISECONDS);
        String configured = tts == null ? "" : safe(tts.getDefaultEngine());
        report.put(phase + "InitCallbackReceived", callback).put(phase + "InitStatus", status.get())
                .put(phase + "InitWaitMillis", SystemClock.elapsedRealtime() - started)
                .put(phase + "ConfiguredDefaultEngine", bounded(configured)).put("configuredDefaultEngine", bounded(configured));
        if (!callback || status.get() != TextToSpeech.SUCCESS || !GOOGLE.equals(configured) || SystemClock.elapsedRealtime() >= limit) {
            stop("Default TTS did not initialize with Google configured within eight seconds"); return false;
        }
        return true;
    }

    private boolean prepareDetail(Page page, String selected, String key, String locale) throws Exception {
        Inventory initial = inventory(deadline);
        report.put(key + "InitialInventoryComplete", initial.complete).put(key + "InitialOfflineVoiceCount", initial.count(locale))
                .put(key + "InitialVoiceCount", initial.total).put(key + "InitialVoicesScanned", initial.scanned);
        if (!initial.complete || !timeLeft()) { stop("Initial voice inventory incomplete or budget expired"); return false; }
        boolean alreadyInstalled = initial.count(locale) > 0;
        report.put(key + "AlreadyInstalledAtFirstInventory", alreadyInstalled).put(key + "DownloadSkippedAlreadyInstalled", alreadyInstalled);
        // Re-read actual root/title/container after the engine call; never reuse a stale button.
        page = readDetail(selected, deadline);
        snapshot(key + "_before_download", page, new JSONObject().put("screenContextReady", page.ready));
        if (!page.ready || !timeLeft()) { stop("Selected language context changed before download decision"); return false; }
        if (!alreadyInstalled) {
            AccessibilityNodeInfo button = uniqueId(page.nodes, GOOGLE, DOWNLOAD_ID);
            AccessibilityNodeInfo status = uniqueId(page.nodes, GOOGLE, STATUS_ID);
            if (!downloadButton(button, deadline) || !button.refresh() || !downloadButton(button, deadline)
                    || status == null || !"android.widget.TextView".contentEquals(safe(status.getClassName()))
                    || safe(status.getText()).trim().isEmpty() || !inContainer(status, CONTAINER_ID, deadline) || !timeLeft()) {
                stop("Exact actual language-pack download button/status unavailable"); return false;
            }
            report.put(key + "DownloadButton", describe(button)).put(key + "BeforeDownloadStatus", bounded(status.getText()));
            if (report.optInt(key + "DownloadAttemptCount") != 0 || report.optInt("downloadAttemptCount") >= 2 || !timeLeft()) {
                stop("Download attempt bound or global budget reached"); return false;
            }
            // Record before dispatch, including a rejected/uncertain action. There is no retry path.
            increment(key + "DownloadAttemptCount"); increment("downloadAttemptCount");
            report.put("languageInstallActionPerformed", true);
            if (!button.performAction(AccessibilityNodeInfo.ACTION_CLICK)) { stop("Download action rejected; no retry permitted"); return false; }
            increment(key + "DownloadAcceptedCount"); increment("downloadAcceptedCount");
        }
        return awaitInstalledLanguage(selected, key, locale);
    }

    private boolean awaitInstalledLanguage(String selected, String key, String locale) throws Exception {
        long started = SystemClock.elapsedRealtime(), limit = Math.min(deadline, started + 60000);
        int polls = 0, consecutive = 0, snapshots = 0;
        String lastStatus = null;
        JSONArray history = new JSONArray();
        report.put(key + "StatusHistory", history);
        while (SystemClock.elapsedRealtime() < limit && polls < 60) {
            polls++;
            Page page = readDetail(selected, limit);
            if (!page.ready) {
                snapshot(key + "_installation_context_lost", page, new JSONObject().put("screenContextReady", false).put("poll", polls));
                stop("Unknown root, account/terms prompt, or changed language detail during preparation"); return false;
            }
            Inventory current = inventory(limit);
            page = readDetail(selected, limit);
            if (!page.ready) {
                snapshot(key + "_installation_context_changed_after_inventory", page, new JSONObject().put("screenContextReady", false));
                stop("Language detail changed during the voice metadata call"); return false;
            }
            String currentStatus = statusText(page.nodes);
            boolean installed = current.complete && current.count(locale) > 0 && SystemClock.elapsedRealtime() < limit;
            consecutive = installed ? consecutive + 1 : 0;
            boolean changed = !currentStatus.equals(lastStatus);
            if (changed && history.length() < 8) history.put(new JSONObject().put("poll", polls).put("statusText", bounded(currentStatus))
                    .put("inventoryComplete", current.complete).put("installedOfflineVoiceCount", current.count(locale)));
            if ((changed && snapshots < 8) || consecutive >= 3) {
                snapshot(key + "_installation_poll_" + polls, page, new JSONObject().put("screenContextReady", true)
                        .put("poll", polls).put("metadataConsecutivePolls", consecutive));
                snapshots++;
            }
            lastStatus = currentStatus;
            report.put(key + "MetadataPollCount", polls).put(key + "MetadataConsecutivePolls", consecutive)
                    .put(key + "LastStatusText", bounded(currentStatus)).put(key + "InventoryComplete", current.complete)
                    .put(key + "VoiceCount", current.total).put(key + "VoicesScanned", current.scanned)
                    .put(key + "OfflineVoiceCount", current.count(locale)).put(key + "PreparationWaitMillis", SystemClock.elapsedRealtime() - started)
                    .put(key + "UiStatusMeaning", "Observed raw UI status only; it is not an installation approval");
            if (consecutive >= 3 && SystemClock.elapsedRealtime() < limit) {
                report.put(key + "Prepared", true); return true;
            }
            long remaining = limit - SystemClock.elapsedRealtime();
            if (remaining > 0) SystemClock.sleep(Math.min(1000, remaining));
        }
        stop("Installed offline " + locale + " metadata not stable within sixty seconds"); return false;
    }

    private boolean confirmFreshInventory() throws Exception {
        long started = SystemClock.elapsedRealtime(), limit = Math.min(deadline, started + 30000);
        int consecutive = 0, polls = 0;
        String selected = report.optString("koreanSelectedLabel");
        while (SystemClock.elapsedRealtime() < limit && polls < 30) {
            polls++;
            Page page = readDetail(selected, limit);
            if (!page.ready) {
                snapshot("fresh_inventory_context_lost", page, new JSONObject().put("screenContextReady", false));
                stop("Actual Google language context lost during fresh inventory confirmation"); return false;
            }
            Inventory current = inventory(limit);
            page = readDetail(selected, limit);
            if (!page.ready) {
                snapshot("fresh_inventory_context_changed_after_call", page, new JSONObject().put("screenContextReady", false));
                stop("Google language context changed during fresh metadata call"); return false;
            }
            boolean installed = current.complete && current.japanese > 0 && current.korean > 0 && SystemClock.elapsedRealtime() < limit;
            consecutive = installed ? consecutive + 1 : 0;
            report.put("freshInventoryComplete", current.complete).put("freshVoiceCount", current.total).put("freshVoicesScanned", current.scanned)
                    .put("freshOfflineJapaneseVoiceCount", current.japanese).put("freshOfflineKoreanVoiceCount", current.korean)
                    .put("freshInventoryPollCount", polls).put("freshInventoryConsecutivePolls", consecutive);
            if (consecutive >= 3 && SystemClock.elapsedRealtime() < limit) return true;
            long remaining = limit - SystemClock.elapsedRealtime();
            if (remaining > 0) SystemClock.sleep(Math.min(1000, remaining));
        }
        stop("Fresh default-client installed offline ja/ko inventory not stable within thirty seconds"); return false;
    }

    private Inventory inventory(long limit) {
        Inventory result = new Inventory();
        if (tts == null || SystemClock.elapsedRealtime() >= limit) return result;
        Set<Voice> voices = tts.getVoices();
        if (voices == null) return result;
        result.total = voices.size();
        for (Voice voice : voices) {
            if (result.scanned >= 1024 || SystemClock.elapsedRealtime() >= limit) break;
            if (voice == null || voice.getLocale() == null) return result;
            result.scanned++;
            Set<String> features = voice.getFeatures();
            if (features == null) return result;
            boolean offline = !voice.isNetworkConnectionRequired()
                    && !features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED);
            if (offline && "ja".equals(voice.getLocale().getLanguage())) result.japanese++;
            if (offline && "ko".equals(voice.getLocale().getLanguage())) result.korean++;
        }
        result.complete = result.scanned == result.total && result.total <= 1024 && SystemClock.elapsedRealtime() < limit;
        return result;
    }

    private void shutdownTts() { TextToSpeech current = tts; tts = null; if (current != null) current.shutdown(); }
    private Page readDetail(String selected, long limit) {
        Page page = new Page();
        page.selected = selected == null ? "" : selected;
        AccessibilityNodeInfo root = activeRoot(limit);
        page.rootPackage = root == null ? "" : safe(root.getPackageName());
        collect(root, page.nodes, 0, new int[]{0}, limit);
        page.ready = GOOGLE.equals(page.rootPackage) && detailContext(page.nodes, selected, limit) && SystemClock.elapsedRealtime() < limit;
        return page;
    }

    private Page awaitPage(String stage, String expectedPackage, String kind, String language, String selected, String previous) throws Exception {
        long started = SystemClock.elapsedRealtime(), waitDeadline = Math.min(deadline, started + 8000);
        Page page = new Page();
        int polls = 0;
        String error = "";
        boolean requireStableList = "LIST".equals(kind) && previous != null;
        String stableFingerprint = "";
        int stablePolls = 0;
        while (SystemClock.elapsedRealtime() < waitDeadline && polls < 40) {
            polls++; page = new Page();
            page.selected = selected == null ? "" : selected;
            try {
                AccessibilityNodeInfo root = activeRoot(waitDeadline);
                page.rootPackage = root == null ? "" : safe(root.getPackageName());
                collect(root, page.nodes, 0, new int[]{0}, waitDeadline);
                boolean content = "SETTINGS".equals(kind) ? settingsTitle(page.nodes, expectedPackage) && exact(page.nodes, expectedPackage, engineLabel)
                        : "ENGINE".equals(kind) ? exact(page.nodes, GOOGLE, "Install voice data")
                        : "LIST".equals(kind) ? listContext(page.nodes, waitDeadline)
                        : detailContext(page.nodes, selected, waitDeadline);
                content = content && !blockedPrompt(page.nodes);
                if (requireStableList) {
                    String current = expectedPackage.equals(page.rootPackage) && content ? fingerprint(page.nodes, waitDeadline) : "";
                    boolean changed = !current.isEmpty() && !previous.equals(current);
                    if (changed) {
                        stablePolls = current.equals(stableFingerprint) ? stablePolls + 1 : 1;
                        stableFingerprint = current;
                    } else { stableFingerprint = ""; stablePolls = 0; }
                    content = changed && stablePolls >= 3 && SystemClock.elapsedRealtime() - started >= 700;
                }
                page.ready = expectedPackage.equals(page.rootPackage) && !page.nodes.isEmpty() && content && SystemClock.elapsedRealtime() < waitDeadline;
                if (page.ready) break;
            } catch (RuntimeException unavailable) {
                stableFingerprint = ""; stablePolls = 0;
                error = bounded(unavailable.getClass().getSimpleName() + ": " + unavailable.getMessage());
            }
            long remaining = waitDeadline - SystemClock.elapsedRealtime();
            if (remaining > 0) SystemClock.sleep(Math.min(200, remaining));
        }
        JSONObject readiness = new JSONObject().put("stage", stage).put("rootPackage", bounded(page.rootPackage)).put("screenContextReady", page.ready)
                .put("polls", polls).put("waitMillis", SystemClock.elapsedRealtime() - started)
                .put("deadlineExpired", SystemClock.elapsedRealtime() >= waitDeadline).put("lastPollingError", error);
        if (requireStableList) readiness.put("stableFingerprintPolls", stablePolls).put("stablePollsRequired", 3).put("minimumSettleMillis", 700);
        snapshot(stage, page, readiness);
        if (!report.has("observations")) report.put("observations", new JSONArray());
        report.getJSONArray("observations").put(readiness);
        if (!timeLeft()) page.ready = false;
        return page;
    }

    private void snapshot(String stage, Page page, JSONObject readiness) throws Exception {
        readiness.put("rootPackage", bounded(page.rootPackage));
        if (!page.selected.isEmpty()) readiness.put("exactSelectedTitleObserved", selectedVoiceTitle(page.nodes, page.selected))
                .put("localeRowIdsObserved", containsId(page.nodes, GOOGLE, ROW_ID))
                .put("localeRowsObserved", hasLocaleRows(page.nodes, deadline))
                .put("voiceChooserObserved", voiceChooser(page.nodes, deadline));
        JSONArray rows = new JSONArray();
        for (AccessibilityNodeInfo node : page.nodes) {
            if (rows.length() >= 40) break;
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
    private static boolean selectedVoiceTitle(List<AccessibilityNodeInfo> nodes, String selected) {
        if (selected == null || selected.isEmpty()) return false;
        String title = selected + " voices";
        for (AccessibilityNodeInfo node : nodes) if (node.isVisibleToUser() && GOOGLE.contentEquals(safe(node.getPackageName()))
                && "android.widget.TextView".contentEquals(safe(node.getClassName())) && !node.isClickable() && !node.isCheckable()
                && title.equals(safe(node.getText()).trim())) return true;
        return false;
    }

    private static boolean detailContext(List<AccessibilityNodeInfo> nodes, String selected, long limit) {
        if (nodes.isEmpty() || !selectedVoiceTitle(nodes, selected) || uniqueId(nodes, GOOGLE, CONTAINER_ID) == null
                || blockedPrompt(nodes) || containsId(nodes, GOOGLE, ROW_ID) || hasLocaleRows(nodes, limit)) return false;
        // Google reuses locales_list for installed voice choices. An ID alone does not identify a language list.
        return (!containsId(nodes, GOOGLE, LIST_ID) || voiceChooser(nodes, limit)) && SystemClock.elapsedRealtime() < limit;
    }
    private static boolean hasLocaleRows(List<AccessibilityNodeInfo> nodes, long limit) {
        for (AccessibilityNodeInfo node : nodes) {
            if (SystemClock.elapsedRealtime() >= limit) return false;
            if (localeRow(node, limit)) return true;
        }
        return false;
    }
    private static boolean voiceChooser(List<AccessibilityNodeInfo> nodes, long limit) {
        AccessibilityNodeInfo list = uniqueId(nodes, GOOGLE, LIST_ID);
        AccessibilityNodeInfo delete = uniqueId(nodes, GOOGLE, DELETE_ID);
        if (list == null || list.isClickable() || !"android.support.v7.widget.RecyclerView".contentEquals(safe(list.getClassName()))
                || !inContainer(list, CONTAINER_ID, limit) || !clickable(delete, GOOGLE)
                || !"android.widget.ImageView".contentEquals(safe(delete.getClassName()))
                || !"Delete voice pack".equals(safe(delete.getContentDescription()).trim())
                || !inContainer(delete, CONTAINER_ID, limit)) return false;
        for (AccessibilityNodeInfo node : nodes) {
            if (SystemClock.elapsedRealtime() >= limit) return false;
            if (usable(node, GOOGLE) && !node.isClickable() && VOICE_NAME_ID.equals(node.getViewIdResourceName())
                    && "android.widget.TextView".contentEquals(safe(node.getClassName()))
                    && safe(node.getText()).trim().matches("Voice (I|II|III|IV)")
                    && inContainer(node, VOICE_ENTITY_ID, limit) && inContainer(node, LIST_ID, limit))
                return SystemClock.elapsedRealtime() < limit;
        }
        return false;
    }
    private static boolean downloadButton(AccessibilityNodeInfo node, long limit) {
        return clickable(node, GOOGLE) && DOWNLOAD_ID.equals(node.getViewIdResourceName())
                && "android.widget.ImageView".contentEquals(safe(node.getClassName()))
                && "Download voice pack".equals(safe(node.getContentDescription()).trim())
                && supports(node, AccessibilityNodeInfo.ACTION_CLICK) && inContainer(node, CONTAINER_ID, limit);
    }
    private static boolean inContainer(AccessibilityNodeInfo node, String id, long limit) {
        for (int depth = 0; node != null && depth < 16 && SystemClock.elapsedRealtime() < limit; depth++) {
            if (!GOOGLE.contentEquals(safe(node.getPackageName()))) return false;
            if (id.equals(node.getViewIdResourceName())) return usable(node, GOOGLE) && SystemClock.elapsedRealtime() < limit;
            node = node.getParent();
        }
        return false;
    }
    private static boolean blockedPrompt(List<AccessibilityNodeInfo> nodes) {
        for (AccessibilityNodeInfo node : nodes) {
            String text = (safe(node.getText()) + " " + safe(node.getContentDescription())).toLowerCase(Locale.ROOT);
            if (text.contains("sign in") || text.contains("sign-in") || text.contains("log in") || text.contains("login")
                    || text.contains("terms") || text.contains("agree") || text.contains("accept")
                    || text.contains("privacy policy") || "android:id/button1".equals(node.getViewIdResourceName())
                    || "android:id/button2".equals(node.getViewIdResourceName()) || "android:id/button3".equals(node.getViewIdResourceName())) return true;
        }
        return false;
    }
    private static String statusText(List<AccessibilityNodeInfo> nodes) {
        StringBuilder result = new StringBuilder();
        int count = 0;
        for (AccessibilityNodeInfo node : nodes) if (GOOGLE.contentEquals(safe(node.getPackageName()))
                && STATUS_ID.equals(node.getViewIdResourceName()) && count++ < 4) {
            if (result.length() > 0) result.append(" | ");
            result.append(bounded(node.getText()));
        }
        return bounded(result);
    }
    private static JSONObject describe(AccessibilityNodeInfo node) throws Exception {
        return new JSONObject().put("package", bounded(node.getPackageName())).put("class", bounded(node.getClassName()))
                .put("viewId", bounded(node.getViewIdResourceName())).put("text", bounded(node.getText()))
                .put("contentDescription", bounded(node.getContentDescription())).put("clickable", node.isClickable())
                .put("enabled", node.isEnabled()).put("checkable", node.isCheckable());
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
        List<String> labels = new ArrayList<>();
        for (AccessibilityNodeInfo node : nodes) {
            if (SystemClock.elapsedRealtime() >= limit) return "";
            if (localeRow(node, limit)) labels.add(safe(node.getText()).trim());
        }
        Collections.sort(labels);
        if (SystemClock.elapsedRealtime() >= limit) return "";
        return String.join("\n", labels);
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
    private void stop(String reason) throws Exception { report.put("status", "PREPARATION_INCOMPLETE").put("preparationComplete", false).put("stopReason", bounded(reason)); }
    private static String safe(CharSequence value) { return value == null ? "" : value.toString(); }
    private static String bounded(CharSequence value) { String text = safe(value).replaceAll("[\\p{Cntrl}]", " "); return text.substring(0, Math.min(text.length(), 96)); }
    private static void emit(String marker, JSONObject value) {
        if (REPORT.equals(marker) && value.has("observations")) {
            JSONArray observations = value.optJSONArray("observations");
            while (observations != null && observations.length() > 0 && value.toString().length() > 18000) {
                observations.remove(0);
                try { value.put("readinessHistoryTruncated", true); } catch (Exception invalid) { throw new IllegalStateException(invalid); }
            }
        }
        assertTrue("Bounded diagnostic only", value.toString().length() <= 20000);
        Bundle stream = new Bundle(); stream.putString("stream", "\n" + marker + value + "\n");
        InstrumentationRegistry.getInstrumentation().sendStatus(0, stream);
    }
    private static final class Page { final List<AccessibilityNodeInfo> nodes = new ArrayList<>(); String rootPackage = "", selected = ""; boolean ready; }
    private static final class Inventory {
        int total, scanned, japanese, korean; boolean complete;
        int count(String locale) { return "ja".equals(locale) ? japanese : "ko".equals(locale) ? korean : 0; }
    }
}
