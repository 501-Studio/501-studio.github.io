package com.studio501.kotoba;

import static org.junit.Assert.*;
import android.app.AlertDialog;
import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Native controls; unknown/under-14 never start SDKs even when otherwise ad-eligible. */
@RunWith(AndroidJUnit4.class)
public final class AdAgeSelectionTest {
    private static Object field(Object value, String name) {
        try {
            Field field = value.getClass().getDeclaredField(name); field.setAccessible(true);
            return field.get(value);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    private static AlertDialog dialog(PlayAds ads) { return (AlertDialog) field(ads, "dialog"); }
    private static RadioButton radio(View view, String text) {
        if (view instanceof RadioButton && text.contentEquals(((RadioButton) view).getText())) return (RadioButton) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
            RadioButton found = radio(((ViewGroup) view).getChildAt(i), text); if (found != null) return found;
        }
        return null;
    }
    private static void onMain(ActivityScenario<MainActivity> scenario, Consumer<MainActivity> action) {
        scenario.onActivity(action::accept);
        // AlertDialog dispatches button listeners and dismissal as queued main-thread messages.
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
    }
    private static PlayAds start(MainActivity activity, boolean corrupt) {
        return start(activity, corrupt, AdAgePolicy.UNKNOWN, false);
    }
    private static PlayAds start(MainActivity activity, boolean corrupt, int storedBand, boolean eligible) {
        // Stop the main host's controller; this test owns a separate controller with ads ineligible.
        ((PlayAds) field(activity, "ads")).destroy();
        android.content.SharedPreferences prefs = activity.getSharedPreferences(PlayAds.AGE_PREFS, Context.MODE_PRIVATE);
        prefs.edit().clear().commit();
        if (corrupt) prefs.edit().putString(PlayAds.AGE_KEY, "invalid").commit();
        else if (storedBand != AdAgePolicy.UNKNOWN) prefs.edit().putInt(PlayAds.AGE_KEY, storedBand).commit();
        PlayAds ads = new PlayAds(activity, new LinearLayout(activity), () -> eligible);
        ads.screen("home", ""); return ads;
    }
    private static void finish(MainActivity activity, PlayAds ads) {
        if (ads != null) ads.destroy();
        activity.getSharedPreferences(PlayAds.AGE_PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }
    private static int saved(MainActivity activity) {
        return activity.getSharedPreferences(PlayAds.AGE_PREFS, Context.MODE_PRIVATE).getInt(PlayAds.AGE_KEY, 0);
    }
    private static void editAge(PlayAds ads) {
        ads.privacy((data, error) -> assertNull(error));
        AlertDialog menu = dialog(ads);
        menu.getListView().performItemClick(menu.getListView().getChildAt(0), 0, 0);
    }
    @Test public void laterKeepsUnknownAndDoesNotInitializeSdks() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<PlayAds> ads = new AtomicReference<>();
            try {
                onMain(scenario, activity -> ads.set(start(activity, false)));
                onMain(scenario, activity -> {
                    AlertDialog picker = dialog(ads.get()); assertNotNull(picker);
                    assertFalse(picker.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled());
                    assertFalse(radio(picker.getWindow().getDecorView(), "만 14세 미만").isChecked());
                    assertFalse(radio(picker.getWindow().getDecorView(), "만 14~15세").isChecked());
                    assertFalse(radio(picker.getWindow().getDecorView(), "만 16세 이상").isChecked());
                    assertNull(field(ads.get(), "consent"));
                    picker.getButton(AlertDialog.BUTTON_NEGATIVE).performClick();
                });
                onMain(scenario, activity -> {
                    assertFalse(activity.getSharedPreferences(PlayAds.AGE_PREFS, Context.MODE_PRIVATE).contains(PlayAds.AGE_KEY));
                    ads.get().update(); ads.get().screen("lesson", "");
                    assertNull(dialog(ads.get())); assertNull(field(ads.get(), "consent"));
                    assertEquals(false, field(ads.get(), "initialized"));
                });
            } finally { onMain(scenario, activity -> finish(activity, ads.get())); }
        }
    }
    @Test public void ageChangesPersistLocallyAndCancelPreservesPreviousBand() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<PlayAds> ads = new AtomicReference<>();
            try {
                onMain(scenario, activity -> ads.set(start(activity, false)));
                onMain(scenario, activity -> {
                    AlertDialog picker = dialog(ads.get());
                    radio(picker.getWindow().getDecorView(), "만 14~15세").performClick();
                    picker.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
                });
                onMain(scenario, activity -> {
                    assertEquals(AdAgePolicy.FOURTEEN_TO_FIFTEEN, saved(activity));
                    AtomicInteger replies = new AtomicInteger();
                    ads.get().privacy((data, error) -> { assertNull(error); replies.incrementAndGet(); });
                    assertEquals(1, replies.get());
                    AlertDialog menu = dialog(ads.get());
                    menu.getListView().performItemClick(menu.getListView().getChildAt(0), 0, 0);
                });
                onMain(scenario, activity -> {
                    AlertDialog picker = dialog(ads.get());
                    assertTrue(radio(picker.getWindow().getDecorView(), "만 14~15세").isChecked());
                    radio(picker.getWindow().getDecorView(), "만 16세 이상").performClick();
                    picker.getButton(AlertDialog.BUTTON_NEGATIVE).performClick();
                });
                onMain(scenario, activity -> {
                    assertEquals(AdAgePolicy.FOURTEEN_TO_FIFTEEN, saved(activity));
                    editAge(ads.get());
                });
                onMain(scenario, activity -> {
                    AlertDialog picker = dialog(ads.get());
                    radio(picker.getWindow().getDecorView(), "만 16세 이상").performClick();
                    picker.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
                });
                onMain(scenario, activity -> {
                    assertEquals(AdAgePolicy.SIXTEEN_OR_OLDER, saved(activity));
                    assertNull(field(ads.get(), "consent"));
                    assertEquals(false, field(ads.get(), "initialized"));
                });
            } finally { onMain(scenario, activity -> finish(activity, ads.get())); }
        }
    }
    @Test public void corruptPreferencePromptsWithoutInitializingSdks() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<PlayAds> ads = new AtomicReference<>();
            try {
                onMain(scenario, activity -> ads.set(start(activity, true)));
                onMain(scenario, activity -> {
                    assertNotNull(dialog(ads.get()));
                    assertFalse(dialog(ads.get()).getButton(AlertDialog.BUTTON_POSITIVE).isEnabled());
                    assertNull(field(ads.get(), "consent"));
                });
            } finally { onMain(scenario, activity -> finish(activity, ads.get())); }
        }
    }
    private static void noSdkOrAdWork(PlayAds ads) {
        assertNull(field(ads, "consent"));
        assertEquals(false, field(ads, "initialized"));
        assertEquals(false, field(ads, "initializing"));
        assertEquals(false, field(ads, "consentBusy"));
        assertNull(field(ads, "banner"));
        assertNull(field(ads, "full"));
        assertEquals(false, field(ads, "loadingFull"));
    }
    @Test public void underFourteenSelectionPersistsAndBlocksSdkWorkWhenEligible() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<PlayAds> ads = new AtomicReference<>();
            try {
                onMain(scenario, activity -> ads.set(start(activity, false, AdAgePolicy.UNKNOWN, true)));
                onMain(scenario, activity -> {
                    AlertDialog picker = dialog(ads.get());
                    radio(picker.getWindow().getDecorView(), "만 14세 미만").performClick();
                    picker.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
                });
                onMain(scenario, activity -> {
                    assertEquals(AdAgePolicy.UNDER_FOURTEEN, saved(activity));
                    ads.get().update(); ads.get().resume(); ads.get().screen("words", "");
                    noSdkOrAdWork(ads.get());
                    AtomicInteger ended = new AtomicInteger(); ads.get().chapterBreak(ended::incrementAndGet);
                    assertEquals(1, ended.get());
                    ads.get().privacy((data, error) -> assertNull(error));
                    AlertDialog menu = dialog(ads.get());
                    menu.getListView().performItemClick(menu.getListView().getChildAt(1), 1, 1);
                });
                onMain(scenario, activity -> {
                    assertNotNull(dialog(ads.get()));
                    noSdkOrAdWork(ads.get());
                    dialog(ads.get()).getButton(AlertDialog.BUTTON_POSITIVE).performClick();
                });
            } finally { onMain(scenario, activity -> finish(activity, ads.get())); }
        }
    }
    @Test public void storedUnderFourteenBlocksSdkWorkAndLegacyOnePromptsAgain() {
        for (int stored : new int[]{AdAgePolicy.UNDER_FOURTEEN, 1}) {
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                AtomicReference<PlayAds> ads = new AtomicReference<>();
                try {
                    onMain(scenario, activity -> ads.set(start(activity, false, stored, true)));
                    onMain(scenario, activity -> {
                        noSdkOrAdWork(ads.get());
                        if (stored == 1) {
                            assertNotNull(dialog(ads.get()));
                            assertFalse(dialog(ads.get()).getButton(AlertDialog.BUTTON_POSITIVE).isEnabled());
                            assertEquals(AdAgePolicy.UNKNOWN, ((AdAgePolicy) field(ads.get(), "age")).band());
                        } else assertNull(dialog(ads.get()));
                    });
                } finally { onMain(scenario, activity -> finish(activity, ads.get())); }
            }
        }
    }
    @Test public void privacyAgeChangesCanMoveAboveAndBelowFourteenWithoutStaleApproval() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<PlayAds> ads = new AtomicReference<>();
            AtomicInteger staleConsent = new AtomicInteger();
            try {
                onMain(scenario, activity -> {
                    ads.set(start(activity, false, AdAgePolicy.SIXTEEN_OR_OLDER, false));
                    AdAgePolicy policy = (AdAgePolicy) field(ads.get(), "age");
                    staleConsent.set(policy.beginConsent());
                    policy.completeConsent(staleConsent.get(), true);
                    editAge(ads.get());
                });
                onMain(scenario, activity -> {
                    AlertDialog picker = dialog(ads.get());
                    assertTrue(radio(picker.getWindow().getDecorView(), "만 16세 이상").isChecked());
                    radio(picker.getWindow().getDecorView(), "만 14세 미만").performClick();
                    picker.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
                });
                onMain(scenario, activity -> {
                    AdAgePolicy policy = (AdAgePolicy) field(ads.get(), "age");
                    assertEquals(AdAgePolicy.UNDER_FOURTEEN, saved(activity));
                    assertFalse(policy.completeConsent(staleConsent.get(), true));
                    assertFalse(policy.canRequest(true, true, true));
                    noSdkOrAdWork(ads.get()); editAge(ads.get());
                });
                onMain(scenario, activity -> {
                    AlertDialog picker = dialog(ads.get());
                    assertTrue(radio(picker.getWindow().getDecorView(), "만 14세 미만").isChecked());
                    radio(picker.getWindow().getDecorView(), "만 14~15세").performClick();
                    picker.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
                });
                onMain(scenario, activity -> {
                    AdAgePolicy policy = (AdAgePolicy) field(ads.get(), "age");
                    assertEquals(AdAgePolicy.FOURTEEN_TO_FIFTEEN, saved(activity));
                    assertTrue(policy.needsConsent());
                    assertFalse(policy.completeConsent(staleConsent.get(), true));
                    assertFalse(policy.canRequest(true, true, true));
                    noSdkOrAdWork(ads.get());
                });
            } finally { onMain(scenario, activity -> finish(activity, ads.get())); }
        }
    }
}
