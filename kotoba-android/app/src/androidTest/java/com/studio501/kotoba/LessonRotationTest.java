package com.studio501.kotoba;

import static org.junit.Assert.*;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Actual Android Activity/WebView rotation and recreation; no pass flag in production. */
@RunWith(AndroidJUnit4.class)
public final class LessonRotationTest {
    private static WebView web(View v) {
        if(v instanceof WebView)return (WebView)v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){
            WebView w=web(((ViewGroup)v).getChildAt(i));if(w!=null)return w;
        }
        return null;
    }
    private String js(ActivityScenario<MainActivity> s,String code)throws Exception {
        AtomicReference<String> r=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);
        s.onActivity(a->web(a.getWindow().getDecorView()).evaluateJavascript(code,x->{r.set(x);done.countDown();}));
        assertTrue("JavaScript callback timed out",done.await(10,TimeUnit.SECONDS));return r.get();
    }
    private void until(ActivityScenario<MainActivity>s,String predicate)throws Exception{
        long end=SystemClock.elapsedRealtime()+25000;String last="";
        while(SystemClock.elapsedRealtime()<end){last=js(s,predicate);if("true".equals(last))return;SystemClock.sleep(100);}
        fail("Condition not satisfied: "+predicate+" result="+last+" page="+js(s,"JSON.stringify({url:location.href,seedError:document.body.dataset.seedError,body:document.body.innerText.slice(0,2400)})"));
    }
    @Test public void rotationAndRecreationKeepLessonAndAcceptedInk()throws Exception{
        try(ActivityScenario<MainActivity>s=ActivityScenario.launch(MainActivity.class)){
            s.onActivity(a->a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
            until(s,"!!document.querySelector('.level-progress-grid')");
            // Wait for asynchronous first-run persistence before pressing a disabled button.
            until(s,"!document.querySelector('#function-tutorial[open]') || !!document.querySelector('#function-tutorial[aria-busy=\"false\"]')");
            // Dismiss the first-run tutorial through its public button when present.
            js(s,"document.querySelector('#function-tutorial [data-tour-action=\"skip\"]')?.click();true");
            until(s,"!document.querySelector('#function-tutorial[open]')");
            // Start and classify the actual lesson through its public UI.
            js(s,"document.querySelector('[data-action=\"start-course\"][data-id=\"N5-chapter-1\"]').click();true");
            int unknown=0;
            StringBuilder observed=new StringBuilder();
            for(int index=1;index<=30;index++){
                until(s,"!!document.querySelector('.survey-card') && document.querySelector('.session-label>span:last-child').textContent==='"+index+"/30'");
                observed.append(js(s,"document.querySelector('.survey-card .survey-headword strong').textContent.trim()")).append(",");
                boolean mountain="true".equals(js(s,"document.querySelector('.survey-card .survey-headword strong').textContent.trim()==='山'"));
                if(mountain)unknown++;
                js(s,"document.querySelector('[data-action=\""+(mountain?"unknown-word":"known-word")+"\"]').click();true");
            }
            assertEquals("Exactly one unknown target must enter practice; observed="+observed,1,unknown);
            // Very first training phase now shows the word before pronunciation.
            until(s,"!!document.querySelector('[data-action=\"studied\"]')");
            js(s,"document.querySelector('[data-action=\"studied\"]').click();true");
            until(s,"!!document.querySelector('[data-action=\"audio-done\"]')");
            SystemClock.sleep(500);
            // Lifecycle fixture only. Surface conflicts instead of racing the last survey save.
            js(s,"(async()=>{try{const S=await import(new URL('./src/storage.js',location.href).href);const v=await S.loadState();const index=v.session.queue.findIndex(t=>t.skill==='trace');if(index<0)throw new Error('Trace task missing after survey');v.session.index=index;v.uiRoute='lesson';await S.commit(v,v.revision);document.body.dataset.seedReady='true';}catch(e){document.body.dataset.seedError=String(e);}})();true");
            until(s,"document.body.dataset.seedReady==='true'||!!document.body.dataset.seedError");
            assertEquals("Fixture preparation failed: "+js(s,"document.body.dataset.seedError||'unknown'"), "true", js(s,"document.body.dataset.seedReady==='true'"));
            js(s,"location.reload();true");
            until(s,"!!document.querySelector('#ink-canvas')");
            // Dispatch pointer input through the real pad/matcher. Nothing directly marks it accepted.
            js(s,"(async()=>{const b=await fetch('./data/strokes.json').then(r=>r.json()),c=document.querySelector('#ink-canvas'),r=c.getBoundingClientRect(),p=b.characters['山'][0];p.forEach(([x,y],i)=>c.dispatchEvent(new PointerEvent(i?'pointermove':'pointerdown',{bubbles:true,pointerId:1,pointerType:'touch',isPrimary:true,buttons:1,clientX:r.left+x*r.width,clientY:r.top+y*r.height})));const [x,y]=p[p.length-1];c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,pointerType:'touch',isPrimary:true,buttons:0,clientX:r.left+x*r.width,clientY:r.top+y*r.height}));})();true");
            until(s,"document.querySelector('#ink-canvas')?.dataset.accepted==='1'");
            SystemClock.sleep(400);
            String task=js(s,"document.querySelector('.session-label').textContent");
            AtomicReference<WebView> original=new AtomicReference<>();s.onActivity(a->original.set(web(a.getWindow().getDecorView())));
            s.onActivity(a->a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
            until(s,"innerWidth>innerHeight");
            s.onActivity(a->{assertEquals(Configuration.ORIENTATION_LANDSCAPE,a.getResources().getConfiguration().orientation);assertSame("Rotation must not recreate WebView",original.get(),web(a.getWindow().getDecorView()));});
            assertEquals("true",js(s,"location.hash==='#lesson' && document.querySelector('#ink-canvas').dataset.accepted==='1'"));
            assertEquals(task,js(s,"document.querySelector('.session-label').textContent"));
            s.onActivity(a->a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
            until(s,"innerWidth<innerHeight");
            assertEquals("true",js(s,"document.querySelector('#ink-canvas').dataset.accepted==='1'"));
            // Separate lifecycle test: the system may still recreate for other reasons.
            s.recreate();until(s,"location.hash==='#lesson' && document.querySelector('#ink-canvas')?.dataset.accepted==='1'");
            assertEquals(task,js(s,"document.querySelector('.session-label').textContent"));
        }
    }
}
