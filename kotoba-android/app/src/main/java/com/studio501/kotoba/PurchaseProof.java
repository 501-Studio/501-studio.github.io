package com.studio501.kotoba;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** Shared, deterministic purchase binding. This class has no Android dependency. */
public final class PurchaseProof {
 private PurchaseProof() {}
 private static final char[] URL_ALPHABET="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".toCharArray();
 public static String canonicalRequest(String accountId,String installationId,String packageName,String productId,String purchaseToken) {
  return "{\"accountId\":"+quote(accountId)+",\"installationId\":"+quote(installationId)+",\"packageName\":"+quote(packageName)+",\"productId\":"+quote(productId)+",\"purchaseToken\":"+quote(purchaseToken)+"}";
 }
 public static String requestHash(String accountId,String installationId,String packageName,String productId,String purchaseToken) {
  try {
   byte[] digest=MessageDigest.getInstance("SHA-256").digest(canonicalRequest(accountId,installationId,packageName,productId,purchaseToken).getBytes(StandardCharsets.UTF_8));
   // java.util.Base64 needs API 26; keep this encoding available on the app's API 24 floor.
   StringBuilder out=new StringBuilder(43);int bits=0,value=0;
   for(byte b:digest){value=(value<<8)|(b&255);bits+=8;while(bits>=6){bits-=6;out.append(URL_ALPHABET[(value>>>bits)&63]);}}
   if(bits>0)out.append(URL_ALPHABET[(value<<(6-bits))&63]);
   return out.toString();
  } catch(NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);}
 }
 private static String quote(String value) {
  if(value==null)throw new IllegalArgumentException("Missing purchase binding");
  StringBuilder out=new StringBuilder("\"");
  for(int i=0;i<value.length();i++){
   char c=value.charAt(i);
   switch(c){
    case '"':out.append("\\\"");break;
    case '\\':out.append("\\\\");break;
    case '\b':out.append("\\b");break;
    case '\f':out.append("\\f");break;
    case '\n':out.append("\\n");break;
    case '\r':out.append("\\r");break;
    case '\t':out.append("\\t");break;
    default:if(c<32||c>126){out.append("\\u");String hex=Integer.toHexString(c);for(int n=hex.length();n<4;n++)out.append('0');out.append(hex);}else out.append(c);
   }
  }
  return out.append('"').toString();
 }
 public static boolean isAccountId(String value){return value!=null&&value.matches("[0-9a-f]{64}");}
 public static boolean leaseMatches(String installationId,String currentAccountId,String leaseInstallationId,String leaseAccountId){
  return installationId!=null&&!installationId.isEmpty()&&installationId.equals(leaseInstallationId)&&isAccountId(currentAccountId)&&currentAccountId.equals(leaseAccountId);
 }
 public static boolean shouldClearLease(String previousAccountId,String nextAccountId){
  if(!isAccountId(nextAccountId))throw new IllegalArgumentException("Invalid verified account");
  return !nextAccountId.equals(previousAccountId);
 }
 /** Leave enough time for attestation and the authenticated server call before launching payment. */
 public static boolean sessionUsable(long expiresAtSeconds,long nowSeconds){return expiresAtSeconds>nowSeconds+60;}
 public static boolean canConnectGoogle(Boolean ageEligible){return Boolean.TRUE.equals(ageEligible);}
}
