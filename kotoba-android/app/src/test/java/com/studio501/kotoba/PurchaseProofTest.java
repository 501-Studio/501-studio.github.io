package com.studio501.kotoba;

import org.junit.Test;
import static org.junit.Assert.*;

/** Known vectors also used by the server's ASCII JSON/SHA-256 contract. */
public final class PurchaseProofTest {
 private static final String ACCOUNT="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
 private static final String OTHER="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
 @Test public void requestHashMatchesServerVector(){
  assertEquals("1kvX3kUPoc7ReGlei6MJC4CSsz_fZ4N3I8c5_Tl7sRU",PurchaseProof.requestHash(ACCOUNT,"install-1","com.studio501.kotoba","kotoba_premium","receipt-1"));
 }
 @Test public void unicodeAndJsonEscapesMatchServerAsciiVector(){
  String canonical=PurchaseProof.canonicalRequest(ACCOUNT,"기기😀","com.studio501.kotoba","kotoba_lifetime","quote\" slash\\\n\t\u007f");
  assertTrue(canonical.contains("\"installationId\":\"\\uae30\\uae30\\ud83d\\ude00\""));
  for(char c:canonical.toCharArray())assertTrue(c<=127);
  assertEquals("o_SafDsqwJqyyOZ40SH4iM8SDunLCqfJ5RnwAXkwMcI",PurchaseProof.requestHash(ACCOUNT,"기기😀","com.studio501.kotoba","kotoba_lifetime","quote\" slash\\\n\t\u007f"));
 }
 @Test public void changingAnyPurchaseBindingChangesProof(){
  String original=PurchaseProof.requestHash(ACCOUNT,"install-1","com.studio501.kotoba","kotoba_premium","receipt-1");
  assertNotEquals(original,PurchaseProof.requestHash(OTHER,"install-1","com.studio501.kotoba","kotoba_premium","receipt-1"));
  assertNotEquals(original,PurchaseProof.requestHash(ACCOUNT,"install-2","com.studio501.kotoba","kotoba_premium","receipt-1"));
  assertNotEquals(original,PurchaseProof.requestHash(ACCOUNT,"install-1","com.studio501.kotoba.debug","kotoba_premium","receipt-1"));
  assertNotEquals(original,PurchaseProof.requestHash(ACCOUNT,"install-1","com.studio501.kotoba","kotoba_lifetime","receipt-1"));
  assertNotEquals(original,PurchaseProof.requestHash(ACCOUNT,"install-1","com.studio501.kotoba","kotoba_premium","receipt-2"));
  assertTrue(original.matches("[A-Za-z0-9_-]{43}"));
 }
 @Test public void leaseRequiresCurrentAccountAndCurrentInstallation(){
  assertTrue(PurchaseProof.leaseMatches("install-1",ACCOUNT,"install-1",ACCOUNT));
  assertFalse(PurchaseProof.leaseMatches("install-1",OTHER,"install-1",ACCOUNT));
  assertFalse(PurchaseProof.leaseMatches("install-2",ACCOUNT,"install-1",ACCOUNT));
  assertFalse(PurchaseProof.leaseMatches("install-1","","install-1",""));
  assertFalse(PurchaseProof.leaseMatches("",ACCOUNT,"",ACCOUNT));
 }
 @Test public void newInstallationAcceptsOnlyNewLeaseForSameAccount(){
  assertFalse(PurchaseProof.leaseMatches("new-install",ACCOUNT,"old-install",ACCOUNT));
  assertTrue(PurchaseProof.leaseMatches("new-install",ACCOUNT,"new-install",ACCOUNT));
 }
 @Test public void accountSwitchClearsOldLeaseButSameAccountKeepsIt(){
  assertTrue(PurchaseProof.shouldClearLease(ACCOUNT,OTHER));
  assertTrue(PurchaseProof.shouldClearLease("",ACCOUNT));
  assertFalse(PurchaseProof.shouldClearLease(ACCOUNT,ACCOUNT));
 }
 @Test(expected=IllegalArgumentException.class) public void invalidServerAccountCannotReplaceCacheOwner(){PurchaseProof.shouldClearLease(ACCOUNT,"arbitrary-account");}
 @Test public void malformedAccountIdsAreRejected(){
  assertFalse(PurchaseProof.isAccountId(null));assertFalse(PurchaseProof.isAccountId(ACCOUNT.substring(1)));assertFalse(PurchaseProof.isAccountId(ACCOUNT.toUpperCase()));
 }
 @Test public void expiredOrNearlyExpiredSessionCannotStartPayment(){
  assertFalse(PurchaseProof.sessionUsable(1000,1000));assertFalse(PurchaseProof.sessionUsable(1060,1000));assertTrue(PurchaseProof.sessionUsable(1061,1000));
 }
 @Test public void ageUnselectedAndUnderFourteenCannotConnectGoogle(){
  assertFalse(PurchaseProof.canConnectGoogle(null));assertFalse(PurchaseProof.canConnectGoogle(false));assertTrue(PurchaseProof.canConnectGoogle(true));
 }
}
