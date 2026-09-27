package com.studio501.kotoba;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.NonNull;
import com.google.android.gms.ads.*;
import com.google.android.gms.ads.interstitial.*;
import com.google.ads.mediation.admob.AdMobAdapter;
import com.google.android.ump.*;
import java.util.HashSet;
import java.util.Set;
import java.util.function.BooleanSupplier;

/** Consent first. Ads never overlap web content; user-initiated chapter breaks only. */
public final class PlayAds {
 private final Activity activity;private final LinearLayout slot;private final BooleanSupplier eligible;
 private final ConsentInformation consent;private boolean consentRequested=false,initialized=false,initializing=false,dead=false;
 private String screen="";private AdView banner;private InterstitialAd full;private boolean loadingFull=false,showing=false;
 private long lastShown;private int completedSinceAd=0;private final Set<String> counted=new HashSet<>();
 public PlayAds(Activity a,LinearLayout s,BooleanSupplier canShow){activity=a;slot=s;eligible=canShow;consent=UserMessagingPlatform.getConsentInformation(a);lastShown=SystemClock.elapsedRealtime();slot.setVisibility(View.GONE);}
 public void screen(String value,String completionId){screen=value;if("completed".equals(value)&&!completionId.isEmpty()&&counted.add(completionId)){completedSinceAd++;if(counted.size()>500){counted.clear();counted.add(completionId);}}update();}
 private boolean online(){ConnectivityManager cm=(ConnectivityManager)activity.getSystemService(Context.CONNECTIVITY_SERVICE);if(cm==null)return false;NetworkCapabilities n=cm.getNetworkCapabilities(cm.getActiveNetwork());return n!=null&&n.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)&&n.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);}
 private boolean canRequest(){return BuildConfig.ADS_ENABLED&&consent.canRequestAds()&&eligible.getAsBoolean()&&!dead;}
 public void update(){if(dead)return;
  if(!BuildConfig.ADS_ENABLED||!eligible.getAsBoolean()||!online()){removeBanner();full=null;return;}
  if(!consentRequested&&"home".equals(screen)){
   consentRequested=true;
   ConsentRequestParameters params=new ConsentRequestParameters.Builder().build();
   consent.requestConsentInfoUpdate(activity,params,()->UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity,error->initializeIfAllowed()),error->initializeIfAllowed());
   return;
  }
  initializeIfAllowed();
 }
 private void initializeIfAllowed(){if(!canRequest())return;
  if(!initialized){if(initializing)return;initializing=true;
   // Non-personalized requests only. No mediation, location, or custom audience signals.
   MobileAds.setRequestConfiguration(new RequestConfiguration.Builder().setMaxAdContentRating(RequestConfiguration.MAX_AD_CONTENT_RATING_G).build());
   MobileAds.initialize(activity,status->activity.runOnUiThread(()->{initializing=false;initialized=true;refreshPlacement();}));return;
  }
  refreshPlacement();
 }
 private AdRequest request(){Bundle extras=new Bundle();extras.putString("npa","1");return new AdRequest.Builder().addNetworkExtrasBundle(AdMobAdapter.class,extras).build();}
 private void refreshPlacement(){if(dead)return;
  if(AdPolicy.banner(screen,canRequest(),eligible.getAsBoolean(),online())){
   if(banner==null){AdView view=new AdView(activity);banner=view;view.setAdSize(AdSize.BANNER);view.setAdUnitId(BuildConfig.BANNER_AD_UNIT);
    view.setAdListener(new AdListener(){
     @Override public void onAdLoaded(){if(banner!=view||!AdPolicy.banner(screen,canRequest(),eligible.getAsBoolean(),online())){view.destroy();return;}
      slot.removeAllViews();TextView label=new TextView(activity);label.setText("광고");label.setTextSize(10);label.setTextColor(Color.DKGRAY);label.setGravity(Gravity.CENTER);slot.addView(label);slot.addView(view);slot.setVisibility(View.VISIBLE);}
     @Override public void onAdFailedToLoad(@NonNull LoadAdError error){if(banner==view)removeBanner();}
    });view.loadAd(request());
   }
  }else removeBanner();
  if(canRequest()&&eligible.getAsBoolean()&&online()&&full==null&&!loadingFull&&!showing&&ArraysForAds.safeScreen(screen)){
   loadingFull=true;InterstitialAd.load(activity,BuildConfig.INTERSTITIAL_AD_UNIT,request(),new InterstitialAdLoadCallback(){
    @Override public void onAdLoaded(@NonNull InterstitialAd ad){loadingFull=false;if(canRequest()&&eligible.getAsBoolean())full=ad;}
    @Override public void onAdFailedToLoad(@NonNull LoadAdError error){loadingFull=false;full=null;}
   });
  }
 }
 private static final class ArraysForAds {static boolean safeScreen(String s){return "home".equals(s)||"words".equals(s)||"completed".equals(s);}}
 public void chapterBreak(Runnable done){
  if(dead||full==null||showing||!AdPolicy.interstitial(screen,canRequest(),eligible.getAsBoolean(),online(),completedSinceAd,SystemClock.elapsedRealtime()-lastShown)){done.run();return;}
  InterstitialAd ad=full;full=null;showing=true;
  ad.setFullScreenContentCallback(new FullScreenContentCallback(){private boolean finished;
   private void end(){if(finished)return;finished=true;showing=false;done.run();}
   @Override public void onAdDismissedFullScreenContent(){end();}
   @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError error){end();}
   @Override public void onAdShowedFullScreenContent(){lastShown=SystemClock.elapsedRealtime();completedSinceAd=0;}
  });ad.show(activity);
 }
 public void privacy(PlayCommerce.Reply reply){
  if(!BuildConfig.ADS_ENABLED){reply.done(new org.json.JSONObject(),"이 설치에서는 광고가 활성화되어 있지 않아요.");return;}
  if(consent.getPrivacyOptionsRequirementStatus()==ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED){
   UserMessagingPlatform.showPrivacyOptionsForm(activity,error->{removeBanner();full=null;update();reply.done(new org.json.JSONObject(),error==null?null:"개인정보 선택을 열지 못했어요.");});
  }else reply.done(new org.json.JSONObject(),"현재 변경이 필요한 광고 동의 항목이 없어요.");
 }
 private void removeBanner(){slot.setVisibility(View.GONE);slot.removeAllViews();if(banner!=null){banner.destroy();banner=null;}}
 public void pause(){if(banner!=null)banner.pause();}
 public void resume(){if(banner!=null)banner.resume();update();}
 public void destroy(){dead=true;removeBanner();full=null;}
}
