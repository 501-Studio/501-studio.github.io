package com.studio501.kotoba;

import static org.junit.Assert.*;
import android.app.ActivityManager;
import android.content.Context;
import android.os.SystemClock;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.atomic.AtomicReference;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Tests actual service lifecycle and error reporting. Does not verify physical speech audibility. */
@RunWith(AndroidJUnit4.class)
public final class PlaylistLifecycleTest {
    private JSONObject snapshot(){
        AtomicReference<JSONObject> result=new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->result.set(PlaylistService.status()));
        return result.get();
    }
    private boolean serviceRunning(){
        Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();
        ActivityManager manager=(ActivityManager)c.getSystemService(Context.ACTIVITY_SERVICE);
        for(ActivityManager.RunningServiceInfo info:manager.getRunningServices(100))
            if(info.service.getClassName().equals(PlaylistService.class.getName()))return info.foreground;
        return false;
    }
    @Test public void invalidPlaylistIsRejectedBeforeServiceLaunch()throws Exception{
        Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();
        for(JSONObject input:new JSONObject[]{new JSONObject(),new JSONObject().put("entries",new JSONArray()),new JSONObject().put("entries",new JSONArray().put(new JSONObject().put("wordId","bad").put("reading","やま")))}){
            try{PlaylistService.start(c,input);fail("Malformed list accepted");}catch(IllegalArgumentException expected){}
        }
    }
    @Test public void serviceCanPauseInBackgroundAndStopWithoutWritingLearningRecords()throws Exception{
        JSONObject entry=new JSONObject().put("wordId","N5-playlisttest").put("word","山").put("reading","やま").put("meaning","산").put("example","山へ行きます。");
        JSONObject payload=new JSONObject().put("entries",new JSONArray().put(entry)).put("includeMeaning",false).put("repeat",true);
        AtomicReference<Exception> startError=new AtomicReference<>();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            SystemClock.sleep(1200);
            scenario.onActivity(a->{try{PlaylistService.start(a,payload);}catch(Exception e){startError.set(e);}});
            assertNull("Foreground launch failed",startError.get());
            long deadline=SystemClock.elapsedRealtime()+8000;
            while(snapshot().optInt("total")!=1&&SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(100);
            assertEquals(1,snapshot().optInt("total"));
            assertTrue("Playback notification/service must be foreground",serviceRunning());
            scenario.onActivity(a->PlaylistService.control("pause"));
            scenario.moveToState(Lifecycle.State.CREATED);SystemClock.sleep(350);
            assertEquals(1,snapshot().optInt("total"));assertFalse(snapshot().optBoolean("playing"));
            assertTrue("Paused service should survive activity backgrounding",serviceRunning());
            scenario.moveToState(Lifecycle.State.RESUMED);
            scenario.onActivity(a->PlaylistService.control("stop"));
            deadline=SystemClock.elapsedRealtime()+5000;
            while(serviceRunning()&&SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(100);
            assertFalse("Stop must remove the foreground service",serviceRunning());
        }finally{InstrumentationRegistry.getInstrumentation().runOnMainSync(()->PlaylistService.control("stop"));}
    }
}
