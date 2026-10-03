package com.studio501.kotoba;
import java.util.Arrays;
/** Pure, testable policy. No ads during learning, purchases, or uncertain purchase verification. */
public final class AdPolicy {
 private AdPolicy(){}
 public static boolean banner(String screen,boolean canRequest,boolean eligible,boolean online){
  return canRequest&&eligible&&online&&Arrays.asList("home","words","profile").contains(screen);
 }
 public static boolean interstitial(String screen,boolean canRequest,boolean eligible,boolean online,int completions,long sinceLast){
  return "completed".equals(screen)&&canRequest&&eligible&&online&&completions>=2&&sinceLast>=180_000;
 }
}
