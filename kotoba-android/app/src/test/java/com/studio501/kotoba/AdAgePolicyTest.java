package com.studio501.kotoba;

import org.junit.Test;
import static org.junit.Assert.*;

public final class AdAgePolicyTest {
    @Test public void unknownNeverStartsConsentOrAds() {
        AdAgePolicy policy = new AdAgePolicy(AdAgePolicy.UNKNOWN);
        assertFalse(policy.known());
        assertEquals(AdAgePolicy.Treatment.NONE, policy.treatment());
        assertFalse(policy.needsConsent());
        assertEquals(-1, policy.beginConsent());
        assertFalse(policy.completeConsent(0, true));
        assertFalse(policy.canRequest(true, true, true));
    }
    @Test public void invalidStoredAgeFailsClosed() {
        for (int value : new int[]{-1, 1, 5, 13, 16, Integer.MAX_VALUE}) {
            AdAgePolicy policy = new AdAgePolicy(value);
            assertEquals(AdAgePolicy.UNKNOWN, policy.band());
            assertFalse(policy.needsConsent());
            assertFalse(policy.canRequest(true, true, true));
        }
    }
    @Test public void underFourteenIsKnownLocallyButNeverStartsConsentOrAds() {
        AdAgePolicy policy = new AdAgePolicy(AdAgePolicy.UNDER_FOURTEEN);
        assertTrue(policy.known());
        assertEquals(AdAgePolicy.UNDER_FOURTEEN, policy.band());
        assertFalse(policy.allowsAdvertising());
        assertEquals(AdAgePolicy.Treatment.NONE, policy.treatment());
        assertFalse(policy.needsConsent());
        assertEquals(-1, policy.beginConsent());
        assertFalse(policy.completeConsent(policy.revision(), true));
        assertFalse(policy.canRequest(true, true, true));
    }
    @Test public void legacyMixedTeenBandRequiresSelectionWhileSixteenPlusIsPreserved() {
        AdAgePolicy legacy = new AdAgePolicy(1);
        assertEquals(AdAgePolicy.UNKNOWN, legacy.band());
        assertFalse(legacy.known());
        assertFalse(legacy.allowsAdvertising());
        assertEquals(-1, legacy.beginConsent());
        AdAgePolicy preserved = new AdAgePolicy(2);
        assertEquals(AdAgePolicy.SIXTEEN_OR_OLDER, preserved.band());
        assertTrue(preserved.known());
        assertTrue(preserved.allowsAdvertising());
        assertFalse(preserved.canRequest(true, true, true));
    }
    @Test public void youngerTeensGetChildAndUnderAgeTreatment() {
        AdAgePolicy policy = new AdAgePolicy(AdAgePolicy.FOURTEEN_TO_FIFTEEN);
        assertEquals(AdAgePolicy.Treatment.CHILD, policy.treatment());
        assertTrue(policy.underAgeOfConsent());
    }
    @Test public void olderUsersStillGetTeenTreatment() {
        AdAgePolicy policy = new AdAgePolicy(AdAgePolicy.SIXTEEN_OR_OLDER);
        assertEquals(AdAgePolicy.Treatment.TEEN, policy.treatment());
        assertFalse(policy.underAgeOfConsent());
    }
    @Test public void storedAgeAloneCannotReuseCachedConsent() {
        AdAgePolicy policy = new AdAgePolicy(AdAgePolicy.SIXTEEN_OR_OLDER);
        assertFalse(policy.canRequest(true, true, true));
        assertFalse(policy.completeConsent(policy.revision(), true));
        int revision = policy.beginConsent();
        assertFalse(policy.canRequest(true, true, true));
        assertTrue(policy.completeConsent(revision, true));
        assertTrue(policy.canRequest(true, true, true));
    }
    @Test public void consentFailureKeepsAdsOffAndDoesNotLoop() {
        AdAgePolicy policy = new AdAgePolicy(AdAgePolicy.SIXTEEN_OR_OLDER);
        int revision = policy.beginConsent();
        assertTrue(policy.completeConsent(revision, false));
        assertFalse(policy.canRequest(true, true, true));
        assertFalse(policy.needsConsent());
        assertEquals(-1, policy.beginConsent());
    }
    @Test public void changingToYoungerBandRejectsOldSuccess() {
        AdAgePolicy policy = new AdAgePolicy(AdAgePolicy.SIXTEEN_OR_OLDER);
        int old = policy.beginConsent();
        assertTrue(policy.completeConsent(old, true));
        policy.select(AdAgePolicy.FOURTEEN_TO_FIFTEEN);
        assertFalse(policy.current(old));
        assertFalse(policy.canRequest(true, true, true));
        int current = policy.beginConsent();
        assertFalse(policy.completeConsent(old, true));
        assertFalse(policy.canRequest(true, true, true));
        assertTrue(policy.completeConsent(current, true));
        assertTrue(policy.canRequest(true, true, true));
    }
    @Test public void oldFailureCannotClearCurrentConsent() {
        AdAgePolicy policy = new AdAgePolicy(AdAgePolicy.FOURTEEN_TO_FIFTEEN);
        int old = policy.beginConsent();
        policy.select(AdAgePolicy.SIXTEEN_OR_OLDER);
        int current = policy.beginConsent();
        policy.completeConsent(current, true);
        assertFalse(policy.completeConsent(old, false));
        assertTrue(policy.canRequest(true, true, true));
    }
    @Test public void reselectingSameBandForcesFreshConsent() {
        AdAgePolicy policy = new AdAgePolicy(AdAgePolicy.FOURTEEN_TO_FIFTEEN);
        int old = policy.beginConsent(); policy.completeConsent(old, true);
        policy.select(AdAgePolicy.FOURTEEN_TO_FIFTEEN);
        assertFalse(policy.canRequest(true, true, true));
        assertTrue(policy.needsConsent());
        assertFalse(policy.completeConsent(old, true));
    }
    @Test public void ageAndConsentDoNotOverrideOtherSafetyGates() {
        AdAgePolicy policy = new AdAgePolicy(AdAgePolicy.SIXTEEN_OR_OLDER);
        policy.completeConsent(policy.beginConsent(), true);
        assertFalse(policy.canRequest(false, true, true));
        assertFalse(policy.canRequest(true, false, true));
        assertFalse(policy.canRequest(true, true, false));
    }
    @Test public void resettingToUnknownInvalidatesPendingConsent() {
        AdAgePolicy policy = new AdAgePolicy(AdAgePolicy.SIXTEEN_OR_OLDER);
        int old = policy.beginConsent();
        policy.select(AdAgePolicy.UNKNOWN);
        assertFalse(policy.completeConsent(old, true));
        assertEquals(-1, policy.beginConsent());
        assertFalse(policy.canRequest(true, true, true));
    }
    @Test public void loweringAgeBelowFourteenRejectsInFlightConsentAndCachedApproval() {
        for (int older : new int[]{AdAgePolicy.FOURTEEN_TO_FIFTEEN, AdAgePolicy.SIXTEEN_OR_OLDER}) {
            AdAgePolicy policy = new AdAgePolicy(older);
            int old = policy.beginConsent();
            policy.completeConsent(old, true);
            policy.select(AdAgePolicy.UNDER_FOURTEEN);
            assertTrue(policy.known());
            assertFalse(policy.current(old));
            assertFalse(policy.completeConsent(old, true));
            assertEquals(-1, policy.beginConsent());
            assertFalse(policy.canRequest(true, true, true));
        }
    }
    @Test public void raisingAgeRequiresNewConsentAndOldCallbacksCannotOverrideIt() {
        AdAgePolicy policy = new AdAgePolicy(AdAgePolicy.SIXTEEN_OR_OLDER);
        int first = policy.beginConsent();
        policy.select(AdAgePolicy.UNDER_FOURTEEN);
        int lower = policy.revision();
        policy.select(AdAgePolicy.FOURTEEN_TO_FIFTEEN);
        assertTrue(policy.underAgeOfConsent());
        assertFalse(policy.canRequest(true, true, true));
        int current = policy.beginConsent();
        assertFalse(policy.completeConsent(first, true));
        assertFalse(policy.completeConsent(lower, true));
        assertTrue(policy.completeConsent(current, true));
        assertFalse(policy.completeConsent(first, false));
        assertTrue(policy.canRequest(true, true, true));
    }
}
