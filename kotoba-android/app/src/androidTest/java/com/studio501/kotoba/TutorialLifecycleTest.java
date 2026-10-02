package com.studio501.kotoba;

import static org.junit.Assert.*;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Test-only first-run preference reset. Never deletes learning or backup records. */
@RunWith(AndroidJUnit4.class)
public final class TutorialLifecycleTest {
    private static WebView web(View v){
        if(v instanceof WebView)return (WebView)v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){
            WebView found=web(((ViewGroup)v).getChildAt(i));if(found!=null)return found;
        }
        return null;
    }
    private String js(ActivityScenario<MainActivity>s,String code)throws Exception{
        AtomicReference<String> value=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);
        s.onActivity(a->web(a.getWindow().getDecorView()).evaluateJavascript(code,r->{value.set(r);done.countDown();}));
        assertTrue("JavaScript timed out",done.await(10,TimeUnit.SECONDS));return value.get();
    }
    private void until(ActivityScenario<MainActivity>s,String predicate)throws Exception{
        long end=SystemClock.elapsedRealtime()+25000;
        while(SystemClock.elapsedRealtime()<end){if("true".equals(js(s,predicate)))return;SystemClock.sleep(100);}
        fail(predicate+" page="+js(s,"document.body.innerText.slice(0,1400)"));
    }
    private void deferAdAgeSelection(){
        long end=SystemClock.elapsedRealtime()+3000;
        while(SystemClock.elapsedRealtime()<end){
            AccessibilityNodeInfo root=InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
            if(root!=null&&!root.findAccessibilityNodeInfosByText("광고 연령대 선택").isEmpty()){
                for(AccessibilityNodeInfo node:root.findAccessibilityNodeInfosByText("나중에")){
                    if("android.widget.Button".contentEquals(node.getClassName())){
                        assertTrue(node.performAction(AccessibilityNodeInfo.ACTION_CLICK));SystemClock.sleep(150);return;
                    }
                }
            }
            SystemClock.sleep(100);
        }
    }
    @Test public void firstRunResumeBackAndSettingsReplay()throws Exception{
        try(ActivityScenario<MainActivity>s=ActivityScenario.launch(MainActivity.class)){
            until(s,"!!document.querySelector('.page,.question')");
            js(s,"document.querySelector('[data-action=\"tutorial-skip\"]')?.click();location.hash='home';true");
            until(s,"!!document.querySelector('.level-progress-grid')");SystemClock.sleep(400);deferAdAgeSelection();
            js(s,"(async()=>{try{await new Promise((resolve,reject)=>{const r=indexedDB.open('kotoba-learning-v3',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readwrite');tx.objectStore('state').delete('tutorial-v1');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);});document.body.dataset.helpReset='true';}catch(e){document.body.dataset.helpError=String(e);}})();true");
            until(s,"document.body.dataset.helpReset==='true'");js(s,"location.reload();true");
            until(s,"document.querySelector('.tutorial')?.dataset.step==='0'");
            assertEquals("true",js(s,"document.querySelector('#app').inert"));
            js(s,"document.querySelector('[data-action=\"tutorial-next\"]').click();true");
            until(s,"document.querySelector('.tutorial')?.dataset.step==='1'");SystemClock.sleep(300);
            s.recreate();until(s,"document.querySelector('.tutorial')?.dataset.step==='1'");deferAdAgeSelection();
            s.onActivity(a->a.getOnBackPressedDispatcher().onBackPressed());
            until(s,"!document.querySelector('.tutorial') && !!document.querySelector('.level-progress-grid')");
            assertEquals("false",js(s,"document.querySelector('#app').inert"));
            js(s,"document.querySelector('.appbar [data-action=\"settings\"]').click();true");
            until(s,"!!document.querySelector('[data-action=\"tutorial-open\"]')");
            js(s,"document.querySelector('[data-action=\"tutorial-open\"]').click();true");
            until(s,"document.querySelector('.tutorial')?.dataset.step==='0'");
            s.onActivity(a->a.getOnBackPressedDispatcher().onBackPressed());
            until(s,"!document.querySelector('.tutorial') && !!document.querySelector('[data-action=\"tutorial-open\"]')");
            assertEquals("true",js(s,"document.activeElement.dataset.action==='tutorial-open'"));
        }
    }
}
