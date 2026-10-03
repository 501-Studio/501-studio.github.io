package com.studio501.kotoba;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.annotation.NonNull;
import com.google.android.gms.ads.*;
import com.google.android.gms.ads.interstitial.*;
import com.google.ads.mediation.admob.AdMobAdapter;
import com.google.android.ump.*;
import java.util.HashSet;
import java.util.Set;
import java.util.function.BooleanSupplier;

/** Age treatment and consent first; ads never interrupt active lessons. */
public final class PlayAds {
    static final String AGE_PREFS = "kotoba-ad-age";
    static final String AGE_KEY = "age-band-v1";
    private final Activity activity;
    private final LinearLayout slot;
    private final BooleanSupplier eligible;
    private final SharedPreferences agePrefs;
    private final AdAgePolicy age;
    private ConsentInformation consent;
    private boolean initialized, initializing, dead, consentBusy, agePickerOpen, prompted;
    private boolean explicitConsent;
    private int consentInfoRevision = -1, adRevision;
    private AlertDialog dialog;
    private String screen = "";
    private AdView banner;
    private InterstitialAd full;
    private boolean loadingFull, showing;
    private long lastShown;
    private int completedSinceAd;
    private final Set<String> counted = new HashSet<>();

    public PlayAds(Activity a, LinearLayout s, BooleanSupplier canShow) {
        activity = a; slot = s; eligible = canShow;
        agePrefs = a.getSharedPreferences(AGE_PREFS, Context.MODE_PRIVATE);
        int saved = AdAgePolicy.UNKNOWN;
        try { saved = agePrefs.getInt(AGE_KEY, AdAgePolicy.UNKNOWN); }
        catch (ClassCastException ignored) { /* Invalid local data stays unknown. */ }
        age = new AdAgePolicy(saved);
        lastShown = SystemClock.elapsedRealtime();
        slot.setVisibility(View.GONE);
        // Unknown and under-14 selections do not obtain UMP or initialize GMA.
    }

    public void screen(String value, String completionId) {
        screen = value;
        if ("completed".equals(value) && !completionId.isEmpty() && counted.add(completionId)) {
            completedSinceAd++;
            if (counted.size() > 500) { counted.clear(); counted.add(completionId); }
        }
        update();
    }
    private boolean online() {
        ConnectivityManager cm = (ConnectivityManager) activity.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        NetworkCapabilities n = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return n != null && n.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && n.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
    private boolean available() {
        return !dead && !activity.isFinishing() && !activity.isDestroyed();
    }
    private boolean canRequest() {
        return available() && age.allowsAdvertising() && !agePickerOpen && !consentBusy && consent != null
                && age.canRequest(BuildConfig.ADS_ENABLED, eligible.getAsBoolean(), online())
                && consent.canRequestAds();
    }
    public void update() {
        if (!available()) return;
        if (!BuildConfig.ADS_ENABLED) { discardAds(); return; }
        if (!age.known()) {
            discardAds();
            if ("home".equals(screen) && !prompted && dialog == null) showAgePicker(false);
            return;
        }
        if (!age.allowsAdvertising()) {
            discardAds(); explicitConsent = false; consentInfoRevision = -1;
            return;
        }
        if (agePickerOpen || !eligible.getAsBoolean() || !online()) { discardAds(); return; }
        boolean safeConsentScreen = "home".equals(screen) || explicitConsent;
        if (!consentBusy && safeConsentScreen && age.needsConsent()) { requestConsent(); return; }
        if (!consentBusy && safeConsentScreen && age.current(consentInfoRevision)) {
            showRequiredConsentForm(); return;
        }
        initializeIfAllowed();
    }
    private void applyAgeConfiguration() {
        if (!age.allowsAdvertising()) return;
        MobileAds.setRequestConfiguration(new RequestConfiguration.Builder()
                .setAgeRestrictedTreatment(age.treatment() == AdAgePolicy.Treatment.CHILD
                        ? AgeRestrictedTreatment.CHILD : AgeRestrictedTreatment.TEEN)
                .setMaxAdContentRating(RequestConfiguration.MAX_AD_CONTENT_RATING_G)
                .setPublisherPrivacyPersonalizationState(RequestConfiguration.PublisherPrivacyPersonalizationState.DISABLED)
                .build());
    }
    private void requestConsent() {
        int revision = age.beginConsent();
        if (revision < 0) return;
        // These independent SDK signals must both be set before either SDK starts work.
        applyAgeConfiguration();
        if (consent == null) consent = UserMessagingPlatform.getConsentInformation(activity);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder()
                .setTagForUnderAgeOfConsent(age.underAgeOfConsent()).build();
        consentBusy = true;
        consent.requestConsentInfoUpdate(activity, params,
                () -> activity.runOnUiThread(() -> {
                    consentBusy = false;
                    if (!available()) return;
                    if (age.current(revision)) consentInfoRevision = revision;
                    // A changed age band waits for the old request before sending its own update.
                    update();
                }),
                error -> activity.runOnUiThread(() -> {
                    consentBusy = false;
                    if (!available()) return;
                    age.completeConsent(revision, false);
                    update();
                }));
    }
    private void showRequiredConsentForm() {
        if (!age.current(consentInfoRevision)) return;
        int revision = consentInfoRevision;
        consentInfoRevision = -1;
        consentBusy = true;
        UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity,
                error -> activity.runOnUiThread(() -> {
                    consentBusy = false;
                    if (!available()) return;
                    if (age.current(revision)) {
                        explicitConsent = false;
                        age.completeConsent(revision, error == null && consent.canRequestAds());
                    }
                    update();
                }));
    }
    private void initializeIfAllowed() {
        if (!canRequest()) return;
        if (!initialized) {
            if (initializing) return;
            applyAgeConfiguration();
            initializing = true;
            MobileAds.initialize(activity, status -> activity.runOnUiThread(() -> {
                initializing = false; initialized = true;
                // update rechecks the current age and consent, including changes during initialization.
                update();
            }));
            return;
        }
        refreshPlacement();
    }
    private AdRequest request() {
        Bundle extras = new Bundle(); extras.putString("npa", "1");
        return new AdRequest.Builder().addNetworkExtrasBundle(AdMobAdapter.class, extras).build();
    }
    private void refreshPlacement() {
        if (!available()) return;
        if (AdPolicy.banner(screen, canRequest(), eligible.getAsBoolean(), online())) {
            if (banner == null) {
                final int revision = adRevision;
                AdView view = new AdView(activity); banner = view;
                view.setAdSize(AdSize.BANNER); view.setAdUnitId(BuildConfig.BANNER_AD_UNIT);
                view.setAdListener(new AdListener() {
                    @Override public void onAdLoaded() {
                        if (revision != adRevision || banner != view
                                || !AdPolicy.banner(screen, canRequest(), eligible.getAsBoolean(), online())) {
                            if (banner == view) removeBanner(); else view.destroy();
                            return;
                        }
                        slot.removeAllViews(); TextView label = new TextView(activity);
                        label.setText("광고"); label.setTextSize(10); label.setTextColor(Color.DKGRAY);
                        label.setGravity(Gravity.CENTER); slot.addView(label); slot.addView(view);
                        slot.setVisibility(View.VISIBLE);
                    }
                    @Override public void onAdFailedToLoad(@NonNull LoadAdError error) {
                        if (revision == adRevision && banner == view) removeBanner();
                    }
                });
                view.loadAd(request());
            }
        } else removeBanner();
        if (canRequest() && full == null && !loadingFull && !showing && safeScreen(screen)) {
            final int revision = adRevision;
            loadingFull = true;
            InterstitialAd.load(activity, BuildConfig.INTERSTITIAL_AD_UNIT, request(), new InterstitialAdLoadCallback() {
                @Override public void onAdLoaded(@NonNull InterstitialAd ad) {
                    if (revision != adRevision) return;
                    loadingFull = false;
                    if (canRequest()) full = ad;
                }
                @Override public void onAdFailedToLoad(@NonNull LoadAdError error) {
                    if (revision != adRevision) return;
                    loadingFull = false; full = null;
                }
            });
        }
    }
    private static boolean safeScreen(String value) {
        return "home".equals(value) || "words".equals(value) || "completed".equals(value);
    }
    public void chapterBreak(Runnable done) {
        if (dead || full == null || showing || !AdPolicy.interstitial(screen, canRequest(),
                eligible.getAsBoolean(), online(), completedSinceAd, SystemClock.elapsedRealtime() - lastShown)) {
            done.run(); return;
        }
        InterstitialAd ad = full; full = null; showing = true;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            private boolean finished;
            private void end() { if (finished) return; finished = true; showing = false; done.run(); }
            @Override public void onAdDismissedFullScreenContent() { end(); }
            @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError error) { end(); }
            @Override public void onAdShowedFullScreenContent() {
                lastShown = SystemClock.elapsedRealtime(); completedSinceAd = 0;
            }
        });
        ad.show(activity);
    }
    private void showAgePicker(boolean editing) {
        if (!available() || dialog != null || consentBusy || showing) return;
        prompted = true; agePickerOpen = true; discardAds();
        int padding = Math.round(20 * activity.getResources().getDisplayMetrics().density);
        LinearLayout content = new LinearLayout(activity);
        content.setOrientation(LinearLayout.VERTICAL); content.setPadding(padding, padding / 2, padding, 0);
        TextView explanation = new TextView(activity);
        explanation.setText("이 앱은 만 13세 이상을 대상으로 해요. 광고 개인정보 보호에 사용할 연령대를 선택해 주세요.\n\n만 14세 미만으로 선택하면 광고를 요청하지 않아요. 선택은 이 기기에만 저장하며 생년월일이나 이름은 수집하지 않아요. 선택하지 않아도 무료 학습할 수 있어요.");
        explanation.setTextSize(14); content.addView(explanation);
        RadioGroup choices = new RadioGroup(activity); choices.setOrientation(RadioGroup.VERTICAL);
        RadioButton underFourteen = new RadioButton(activity), younger = new RadioButton(activity), older = new RadioButton(activity);
        underFourteen.setId(View.generateViewId()); younger.setId(View.generateViewId()); older.setId(View.generateViewId());
        underFourteen.setText("만 14세 미만"); younger.setText("만 14~15세"); older.setText("만 16세 이상");
        int touchHeight = Math.round(48 * activity.getResources().getDisplayMetrics().density);
        underFourteen.setMinHeight(touchHeight); younger.setMinHeight(touchHeight); older.setMinHeight(touchHeight);
        choices.addView(underFourteen); choices.addView(younger); choices.addView(older); content.addView(choices);
        if (age.band() == AdAgePolicy.UNDER_FOURTEEN) choices.check(underFourteen.getId());
        else if (age.band() == AdAgePolicy.FOURTEEN_TO_FIFTEEN) choices.check(younger.getId());
        else if (age.band() == AdAgePolicy.SIXTEEN_OR_OLDER) choices.check(older.getId());
        ScrollView scroll = new ScrollView(activity); scroll.addView(content);
        AlertDialog picker = new AlertDialog.Builder(activity).setTitle("광고 연령대 선택").setView(scroll)
                .setPositiveButton("저장", (d, which) -> {
                    int checked = choices.getCheckedRadioButtonId();
                    if (checked != underFourteen.getId() && checked != younger.getId() && checked != older.getId()) return;
                    int selected = checked == underFourteen.getId() ? AdAgePolicy.UNDER_FOURTEEN
                            : checked == younger.getId() ? AdAgePolicy.FOURTEEN_TO_FIFTEEN : AdAgePolicy.SIXTEEN_OR_OLDER;
                    agePrefs.edit().putInt(AGE_KEY, selected).apply();
                    age.select(selected); consentInfoRevision = -1; explicitConsent = editing;
                    discardAds(); applyAgeConfiguration();
                })
                .setNegativeButton(editing ? "취소" : "나중에", null).create();
        dialog = picker;
        picker.setOnDismissListener(d -> {
            if (dialog == picker) dialog = null;
            agePickerOpen = false;
            update();
        });
        picker.show();
        picker.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(choices.getCheckedRadioButtonId() != -1);
        choices.setOnCheckedChangeListener((group, checked) -> picker.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(checked != -1));
    }
    public void privacy(PlayCommerce.Reply reply) {
        if (!BuildConfig.ADS_ENABLED) {
            reply.done(new org.json.JSONObject(), "이 설치에서는 광고가 활성화되어 있지 않아요."); return;
        }
        if (!available() || dialog != null || consentBusy || showing) {
            reply.done(new org.json.JSONObject(), "열려 있는 광고 선택 화면을 닫은 뒤 다시 시도해 주세요."); return;
        }
        if (!age.known()) showAgePicker(true);
        else {
            AlertDialog menu = new AlertDialog.Builder(activity).setTitle("광고 개인정보 선택")
                    .setItems(new String[]{"광고 연령대 변경", "광고 동의 선택"}, (d, which) -> {
                        dialog = null;
                        if (which == 0) showAgePicker(true); else showPrivacyOptions();
                    }).setNegativeButton("닫기", null).create();
            dialog = menu;
            menu.setOnDismissListener(d -> { if (dialog == menu) dialog = null; });
            menu.show();
        }
        // Native selections can stay open longer than the web bridge's 30-second timeout.
        reply.done(new org.json.JSONObject(), null);
    }
    private void showPrivacyOptions() {
        if (!available()) return;
        if (!age.allowsAdvertising()) {
            showNotice("만 14세 미만 선택에서는 광고를 요청하지 않아요. 무료 학습은 계속할 수 있고, 연령대는 광고 개인정보 선택에서 변경할 수 있어요.");
            return;
        }
        if (!eligible.getAsBoolean() || !online() || consent == null
                || consent.getPrivacyOptionsRequirementStatus() != ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED) {
            showNotice("현재 변경이 필요한 광고 동의 항목이 없거나 광고를 요청할 수 없는 상태예요. 연령대는 광고 개인정보 선택에서 변경할 수 있어요.");
            return;
        }
        discardAds(); age.select(age.band());
        int revision = age.beginConsent();
        applyAgeConfiguration(); consentBusy = true;
        UserMessagingPlatform.showPrivacyOptionsForm(activity, error -> activity.runOnUiThread(() -> {
            consentBusy = false;
            if (!available()) return;
            age.completeConsent(revision, error == null && consent.canRequestAds());
            if (error != null) showNotice("개인정보 선택을 열지 못했어요. 연령대를 다시 선택하면 광고 동의를 재확인할 수 있어요.");
            update();
        }));
    }
    private void showNotice(String message) {
        AlertDialog notice = new AlertDialog.Builder(activity).setTitle("광고 개인정보 선택")
                .setMessage(message).setPositiveButton("확인", null).create();
        dialog = notice;
        notice.setOnDismissListener(d -> { if (dialog == notice) dialog = null; });
        notice.show();
    }
    private void removeBanner() {
        slot.setVisibility(View.GONE); slot.removeAllViews();
        if (banner != null) { banner.destroy(); banner = null; }
    }
    private void discardAds() { adRevision++; removeBanner(); full = null; loadingFull = false; }
    public void pause() { if (banner != null) banner.pause(); }
    public void resume() { if (banner != null) banner.resume(); update(); }
    public void destroy() {
        dead = true; discardAds();
        if (dialog != null) { dialog.dismiss(); dialog = null; }
    }
}
