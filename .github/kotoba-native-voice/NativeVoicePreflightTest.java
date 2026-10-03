package com.studio501.kotoba;

import static org.junit.Assert.*;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.util.List;
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

/** CI-only real system TTS diagnostic. File synthesis does not prove speaker playback or FGS. */
@RunWith(AndroidJUnit4.class)
public final class NativeVoicePreflightTest {
    private static final String MARKER = "KOTOBA_NATIVE_VOICE_PREFLIGHT_JSON=";
    private static final int MAX_FILE_BYTES = 2 * 1024 * 1024;

    @Test public void inventoryAndOfflineJapaneseFileSynthesis() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Explicit native voice opt-in required",
                "true".equals(args.getString("nativeVoicePreflight")));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("CI isolated guest opt-in required", "true", args.getString("ciIsolatedEmulator"));
        assertEquals("internal_debug", BuildConfig.BUILD_STAGE);
        assertFalse("Sales must stay disabled", BuildConfig.SELLING_ENABLED);
        assertEquals("com.studio501.kotoba.debug", context.getPackageName());
        assertTrue("Never run this probe on a physical device",
                "ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE));

        JSONObject report = new JSONObject().put("schemaVersion", 1)
                .put("status", "NOT_READY").put("inventoryComplete", false)
                .put("playbackReady", false).put("synthesisAttempted", false)
                .put("speakerPlaybackPerformed", false).put("physicalAudibilityVerified", false)
                .put("foregroundServiceVerified", false).put("demonstrationVideoCreated", false)
                .put("productionReleaseApproved", false).put("actualActiveEnginePackageVerified", false)
                .put("packageName", context.getPackageName()).put("sdk", Build.VERSION.SDK_INT)
                .put("readinessMeaning", "Offline voice prerequisites and Japanese file synthesis only; further runtime QA required");
        AtomicReference<TextToSpeech> engine = new AtomicReference<>();
        File output = null;
        try {
            CountDownLatch initialized = new CountDownLatch(1);
            AtomicInteger initStatus = new AtomicInteger(TextToSpeech.ERROR);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                    engine.set(new TextToSpeech(context, status -> {
                        initStatus.set(status);
                        initialized.countDown();
                    })));
            boolean initCallback = initialized.await(15, TimeUnit.SECONDS);
            report.put("initCallbackReceived", initCallback).put("initStatus", initStatus.get());
            TextToSpeech tts = engine.get();
            // This is the configured default, not proof of the engine selected after any system fallback.
            report.put("configuredDefaultEngine", bounded(tts.getDefaultEngine()));
            List<TextToSpeech.EngineInfo> engines = tts.getEngines();
            JSONArray engineRows = new JSONArray();
            if (engines != null) for (int i = 0; i < Math.min(engines.size(), 10); i++) {
                TextToSpeech.EngineInfo item = engines.get(i);
                engineRows.put(new JSONObject().put("packageName", bounded(item.name))
                        .put("label", bounded(item.label)));
            }
            report.put("engineCount", engines == null ? 0 : engines.size()).put("engines", engineRows);
            if (!initCallback || initStatus.get() != TextToSpeech.SUCCESS) {
                report.put("reason", "Default system TTS did not initialize successfully");
                return;
            }
            Set<Voice> voices = tts.getVoices();
            JSONArray voiceRows = new JSONArray();
            Voice japanese = null;
            int scanned = 0, jaCount = 0, koCount = 0;
            if (voices != null) for (Voice voice : voices) {
                if (scanned >= 512) break;
                scanned++;
                String language = voice.getLocale().getLanguage();
                Set<String> features = voice.getFeatures();
                boolean notInstalled = features != null && features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED);
                boolean offline = !voice.isNetworkConnectionRequired() && !notInstalled;
                if (offline && "ja".equals(language)) {
                    jaCount++;
                    if (japanese == null || voice.getQuality() > japanese.getQuality()) japanese = voice;
                }
                if (offline && "ko".equals(language)) koCount++;
                if (voiceRows.length() < 32) voiceRows.put(new JSONObject()
                        .put("name", bounded(voice.getName())).put("locale", bounded(voice.getLocale().toLanguageTag()))
                        .put("quality", voice.getQuality()).put("networkRequired", voice.isNetworkConnectionRequired())
                        .put("notInstalled", notInstalled));
            }
            boolean complete = voices != null && scanned == voices.size();
            report.put("inventoryComplete", complete).put("voiceCount", voices == null ? 0 : voices.size())
                    .put("voicesScanned", scanned).put("voiceRowsTruncated", voices != null && voices.size() > voiceRows.length())
                    .put("voices", voiceRows).put("offlineJapaneseVoiceCount", jaCount).put("offlineKoreanVoiceCount", koCount)
                    .put("offlineJapaneseAvailable", jaCount > 0).put("offlineKoreanAvailable", koCount > 0);
            // Uses the app's existing ACCESS_NETWORK_STATE permission. Never add a permission or contact an endpoint.
            long networkDeadline = SystemClock.elapsedRealtime() + 3000;
            boolean offline;
            do {
                offline = noInternetNetwork(context);
                if (offline) break;
                SystemClock.sleep(100);
            } while (SystemClock.elapsedRealtime() < networkDeadline);
            report.put("guestInternetUnavailable", offline);
            if (!complete || japanese == null || !offline) {
                report.put("reason", !complete ? "Voice inventory unavailable or scan limit reached"
                        : japanese == null ? "No installed offline Japanese voice" : "Guest still has an Internet-capable network");
                return;
            }
            report.put("selectedJapaneseVoice", bounded(japanese.getName()));
            int setVoiceStatus = tts.setVoice(japanese);
            report.put("setVoiceStatus", setVoiceStatus);
            if (setVoiceStatus != TextToSpeech.SUCCESS) {
                report.put("reason", "System TTS rejected the installed offline Japanese voice");
                return;
            }
            CountDownLatch completed = new CountDownLatch(1);
            AtomicReference<String> synthesisStatus = new AtomicReference<>("TIMEOUT");
            String utterance = "kotoba-native-voice-preflight";
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { finish(id, "DONE"); }
                @Override public void onError(String id) { finish(id, "ERROR"); }
                @Override public void onError(String id, int code) { finish(id, "ERROR_" + code); }
                @Override public void onStop(String id, boolean interrupted) { finish(id, "STOPPED"); }
                private void finish(String id, String status) {
                    if (utterance.equals(id)) { synthesisStatus.set(status); completed.countDown(); }
                }
            });
            output = File.createTempFile("kotoba-native-voice-", ".wav", context.getCacheDir());
            report.put("synthesisAttempted", true);
            int accepted = tts.synthesizeToFile("こんにちは。山へ行きます。", new Bundle(), output, utterance);
            report.put("synthesisRequestStatus", accepted);
            boolean done = accepted == TextToSpeech.SUCCESS && completed.await(30, TimeUnit.SECONDS);
            report.put("synthesisCallback", synthesisStatus.get()).put("synthesisCallbackReceived", done);
            boolean pcmReady = false;
            if (done && "DONE".equals(synthesisStatus.get())) {
                JSONObject pcm = inspectPcm(output);
                report.put("japanesePcm", pcm);
                pcmReady = pcm.optBoolean("pcmDataNonempty") && pcm.optBoolean("signalNonSilent");
            }
            boolean ready = pcmReady && koCount > 0 && noInternetNetwork(context);
            report.put("playbackReady", ready).put("status", ready ? "READY_FOR_FURTHER_RUNTIME_QA" : "NOT_READY")
                    .put("reason", ready ? "Installed offline ja/ko voices and non-silent Japanese PCM file confirmed"
                            : "Japanese PCM synthesis, offline Korean voice, or continued network isolation not ready");
        } catch (Exception failure) {
            report.put("status", "PROBE_ERROR").put("playbackReady", false)
                    .put("reason", bounded(failure.getClass().getSimpleName() + ": " + failure.getMessage()));
            throw failure;
        } finally {
            try {
                TextToSpeech tts = engine.get();
                if (tts != null) { tts.stop(); tts.shutdown(); }
                if (output != null && output.exists() && !output.delete()) {
                    report.put("status", "PROBE_ERROR").put("playbackReady", false).put("reason", "Temporary PCM cleanup failed");
                }
            } finally {
                // Max 32 fixed-size voice rows, ten engine rows, and fixed scalar fields: no device/app data export.
                assertTrue("Diagnostic exceeds stream bound", report.toString().length() <= 20000);
                Bundle stream = new Bundle();
                stream.putString("stream", "\n" + MARKER + report + "\n");
                InstrumentationRegistry.getInstrumentation().sendStatus(0, stream);
            }
        }
    }

    private static String bounded(String value) {
        return value == null ? "" : value.substring(0, Math.min(value.length(), 96));
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

    /** Strict bounded RIFF/WAVE integer PCM inspection; unsupported formats remain NOT_READY. */
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
            } else if (fourcc(bytes, offset, "data") && dataStart < 0) {
                dataStart = offset + 8; dataSize = (int) length;
            }
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
