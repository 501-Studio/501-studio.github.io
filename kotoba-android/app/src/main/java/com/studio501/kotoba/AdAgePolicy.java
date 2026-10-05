package com.studio501.kotoba;

/** Local age bands and consent epochs; unknown or stale consent always fails closed. */
public final class AdAgePolicy {
    public static final int UNKNOWN = 0;
    // Stored value 1 previously mixed ages 13–15. It cannot prove an age of 14+.
    public static final int SIXTEEN_OR_OLDER = 2;
    public static final int UNDER_FOURTEEN = 3;
    public static final int FOURTEEN_TO_FIFTEEN = 4;
    public enum Treatment { NONE, CHILD, TEEN }

    private int band;
    private int revision;
    private boolean consentAttempted;
    private boolean consentReady;

    public AdAgePolicy(int savedBand) { band = normalize(savedBand); }
    private static int normalize(int value) {
        return value == UNDER_FOURTEEN || value == FOURTEEN_TO_FIFTEEN || value == SIXTEEN_OR_OLDER ? value : UNKNOWN;
    }
    public int band() { return band; }
    public boolean known() { return band != UNKNOWN; }
    /** No guardian consent verification exists. Under-14 selections start neither ad SDK. */
    public boolean allowsAdvertising() { return band == FOURTEEN_TO_FIFTEEN || band == SIXTEEN_OR_OLDER; }
    public boolean underAgeOfConsent() { return band == FOURTEEN_TO_FIFTEEN; }
    public Treatment treatment() {
        return !allowsAdvertising() ? Treatment.NONE : underAgeOfConsent() ? Treatment.CHILD : Treatment.TEEN;
    }
    public int revision() { return revision; }
    public boolean current(int value) { return allowsAdvertising() && value == revision; }
    public boolean needsConsent() { return allowsAdvertising() && !consentAttempted; }

    /** Every selection, including a reselection, invalidates the previous consent callbacks. */
    public void select(int value) {
        band = normalize(value);
        revision++;
        consentAttempted = false;
        consentReady = false;
    }
    public int beginConsent() {
        if (!needsConsent()) return -1;
        consentAttempted = true;
        return revision;
    }
    public boolean completeConsent(int value, boolean allowed) {
        if (!current(value) || !consentAttempted) return false;
        consentReady = allowed;
        return true;
    }
    public boolean canRequest(boolean enabled, boolean eligible, boolean online) {
        return allowsAdvertising() && consentReady && enabled && eligible && online;
    }
}
