package com.studio501.kotoba;
import org.junit.Test;
import static org.junit.Assert.*;
public final class AdPolicyTest {
 @Test public void neverBannerInLesson(){assertFalse(AdPolicy.banner("lesson",true,true,true));}
 @Test public void noBannerOffline(){assertFalse(AdPolicy.banner("home",true,true,false));}
 @Test public void noBannerForPremium(){assertFalse(AdPolicy.banner("words",true,false,true));}
 @Test public void noBannerWithoutConsent(){assertFalse(AdPolicy.banner("profile",false,true,true));}
 @Test public void eligibleHomeBanner(){assertTrue(AdPolicy.banner("home",true,true,true));}
 @Test public void breaksNeedNaturalCompletion(){assertFalse(AdPolicy.interstitial("lesson",true,true,true,10,600000));}
 @Test public void breaksNeedTwoChaptersAndThreeMinutes(){assertFalse(AdPolicy.interstitial("completed",true,true,true,1,600000));assertFalse(AdPolicy.interstitial("completed",true,true,true,2,179999));assertTrue(AdPolicy.interstitial("completed",true,true,true,2,180000));}
 @Test public void noInterstitialOfflinePremiumOrNoConsent(){assertFalse(AdPolicy.interstitial("completed",true,true,false,3,600000));assertFalse(AdPolicy.interstitial("completed",true,false,true,3,600000));assertFalse(AdPolicy.interstitial("completed",false,true,true,3,600000));}
}
