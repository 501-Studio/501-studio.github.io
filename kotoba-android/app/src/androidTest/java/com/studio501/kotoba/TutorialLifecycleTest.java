package com.studio501.kotoba;
import static org.junit.Assert.*;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Actual WebView tutorial, persisted progress, native Back and settings replay. */
@RunWith(AndroidJUnit4.class)
public final class TutorialLifecycleTest {
 private static WebView web(View v){
  if(v instanceof WebView)return (WebView)v;
  if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){WebView w=web(((ViewGroup)v).getChildAt(i));if(w!=null)return w;}
  return null;
 }
 private String js(ActivityScenario<MainActivity>s,String code)throws Exception{
  CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
  s.onActivity(a->web(a.getWindow().getDecorView()).evaluateJavascript(code,r->{result.set(r);latch.countDown();}));
  assertTrue(latch.await(10,TimeUnit.SECONDS));return result.get();
 }
 private void until(ActivityScenario<MainActivity>s,String code)throws Exception{
  long end=SystemClock.elapsedRealtime()+25000;
  while(SystemClock.elapsedRealtime()<end){if("true".equals(js(s,code)))return;SystemClock.sleep(100);}
  fail("Tutorial condition failed: "+code+" page="+js(s,"document.body.innerText.slice(0,1500)"));
 }
 @Test public void tutorialResumesAndBackReturnsToSettingsWithoutResettingRecords()throws Exception{
  try(ActivityScenario<MainActivity>s=ActivityScenario.launch(MainActivity.class)){
   until(s,"!!document.querySelector('#main')");
   js(s,"document.querySelector('#function-tutorial [data-tour-action=\"skip\"]')?.click();true");
   until(s,"!document.querySelector('#function-tutorial[open]')");
   js(s,"(async()=>{const S=await import('./src/storage.js');const v=await S.loadState();v.tutorial={version:1,status:'started',step:1};v.uiRoute='home';await S.commit(v,v.revision);location.href=location.href.split('#')[0]+'#home';location.reload();})();true");
   until(s,"document.querySelector('#function-tutorial[open][aria-busy=\"false\"]')?.innerText.includes('한 글자')===true");
   s.recreate();until(s,"document.querySelector('#function-tutorial[open][aria-busy=\"false\"]')?.innerText.includes('한 글자')===true");
   js(s,"document.querySelector('#function-tutorial [data-tour-action=\"skip\"]').click();true");until(s,"!document.querySelector('#function-tutorial[open]')");
   js(s,"document.querySelector('.appbar [data-action=\"settings\"]').click();true");until(s,"!!document.querySelector('[data-action=\"tutorial-start\"]')");
   js(s,"document.querySelector('[data-action=\"tutorial-start\"]').click();true");until(s,"document.querySelector('#function-tutorial[open][aria-busy=\"false\"]')?.innerText.includes('급수를')===true");
   s.onActivity(a->a.getOnBackPressedDispatcher().onBackPressed());until(s,"!document.querySelector('#function-tutorial[open]') && document.querySelector('#sheet-title')?.textContent==='설정'");
   assertEquals("true",js(s,"location.hash==='#home'"));
  }
 }
}
