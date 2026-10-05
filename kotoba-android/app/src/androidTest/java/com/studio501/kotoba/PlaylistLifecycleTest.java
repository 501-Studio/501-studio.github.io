package com.studio501.kotoba;

import static org.junit.Assert.*;
import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
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
            if(c.getPackageName().equals(info.service.getPackageName())&&info.service.getClassName().equals(PlaylistService.class.getName()))return info.foreground;
        return false;
    }
    private StatusBarNotification ownNotice(Context context){
        NotificationManager manager=context.getSystemService(NotificationManager.class);
        StatusBarNotification found=null;
        for(StatusBarNotification notice:manager.getActiveNotifications())if(context.getPackageName().equals(notice.getPackageName())
                &&notice.getUid()==context.getApplicationInfo().uid&&notice.getId()==410
                &&(Build.VERSION.SDK_INT<26||"kotoba-listening".equals(notice.getNotification().getChannelId()))){
            assertNull("Only one own playlist notification expected",found);found=notice;
        }
        return found;
    }
    private boolean ownServiceExists(Context context){
        ActivityManager manager=context.getSystemService(ActivityManager.class);
        for(ActivityManager.RunningServiceInfo info:manager.getRunningServices(100))if(context.getPackageName().equals(info.service.getPackageName())
                &&PlaylistService.class.getName().equals(info.service.getClassName()))return true;
        return false;
    }
    private String fixtureEvidence(Context context){
        return " status="+snapshot()+" foreground="+serviceRunning()+" serviceExists="+ownServiceExists(context)+" ownNotice="+(ownNotice(context)!=null);
    }
    private void awaitFixtureStarted(Context context){
        long deadline=SystemClock.elapsedRealtime()+8000;
        while((snapshot().optInt("total")!=1||!serviceRunning()||ownNotice(context)==null)&&SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(100);
        String evidence=fixtureEvidence(context);
        assertEquals("Started fixture must contain one entry"+evidence,1,snapshot().optInt("total"));
        assertTrue("Playback notification/service must be foreground"+evidence,serviceRunning());
        assertNotNull("Started fixture must post its own notification"+evidence,ownNotice(context));
    }
    private void awaitFixtureAbsent(Context context){
        long deadline=SystemClock.elapsedRealtime()+5000;
        while((ownServiceExists(context)||ownNotice(context)!=null)&&SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(100);
        String evidence=fixtureEvidence(context);
        assertFalse("Fixture service must be absent"+evidence,ownServiceExists(context));
        assertNull("Fixture notification must be absent"+evidence,ownNotice(context));
    }
    private void cleanupFixture(Context context,Throwable primaryFailure)throws Exception{
        try{
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->PlaylistService.control("stop"));
            context.stopService(new Intent(context,PlaylistService.class));
            awaitFixtureAbsent(context);
        }catch(Exception|AssertionError cleanupFailure){
            if(primaryFailure!=null)primaryFailure.addSuppressed(cleanupFailure);else throw cleanupFailure;
        }
    }
    private MediaController ownController(Context context,StatusBarNotification notice){
        assertNotNull("Own playlist notification missing",notice);
        MediaSession.Token token=Build.VERSION.SDK_INT>=33?notice.getNotification().extras.getParcelable(Notification.EXTRA_MEDIA_SESSION,MediaSession.Token.class)
                :notice.getNotification().extras.getParcelable(Notification.EXTRA_MEDIA_SESSION);
        assertNotNull("Own MediaSession token missing",token);
        MediaController controller=new MediaController(context,token);
        assertEquals(context.getPackageName(),controller.getPackageName());assertEquals("KotobaPlaylist",controller.getTag());
        return controller;
    }
    private void assertStopContract(Context context,MediaController controller){
        PlaybackState state=controller.getPlaybackState();assertNotNull(state);
        assertTrue("Legacy STOP capability must remain",(state.getActions()&PlaybackState.ACTION_STOP)!=0);
        int stops=0;
        for(PlaybackState.CustomAction action:state.getCustomActions())if(PlaylistService.STOP_CUSTOM_ACTION.equals(action.getAction())){
            stops++;assertEquals("정지",String.valueOf(action.getName()));assertEquals(R.drawable.ic_playlist_stop,action.getIcon());
            assertEquals("ic_playlist_stop",context.getResources().getResourceEntryName(action.getIcon()));
            assertNotNull("Session app must be able to load its custom icon",context.getDrawable(action.getIcon()));
        }
        assertEquals("Exactly one discoverable custom Stop expected",1,stops);
        StatusBarNotification notice=ownNotice(context);assertNotNull(notice);
        int legacyStops=0;
        for(Notification.Action action:notice.getNotification().actions)if("정지".contentEquals(action.title)){
            legacyStops++;assertNotNull(action.actionIntent);assertEquals(context.getPackageName(),action.actionIntent.getCreatorPackage());
        }
        assertEquals("Legacy notification Stop must remain",1,legacyStops);
    }
    @Test public void invalidPlaylistIsRejectedBeforeServiceLaunch()throws Exception{
        Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();
        for(JSONObject input:new JSONObject[]{new JSONObject(),new JSONObject().put("entries",new JSONArray()),new JSONObject().put("entries",new JSONArray().put(new JSONObject().put("wordId","bad").put("reading","やま")))}){
            try{PlaylistService.start(c,input);fail("Malformed list accepted");}catch(IllegalArgumentException expected){}
        }
    }
    @Test public void serviceCanPauseInBackgroundAndStopWithoutWritingLearningRecords()throws Exception{
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        JSONObject entry=new JSONObject().put("wordId","N5-playlisttest").put("word","山").put("reading","やま").put("meaning","산").put("example","山へ行きます。");
        JSONObject payload=new JSONObject().put("entries",new JSONArray().put(entry)).put("includeMeaning",false).put("repeat",true);
        AtomicReference<Exception> startError=new AtomicReference<>();
        cleanupFixture(context,null);
        Throwable primaryFailure=null;
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            SystemClock.sleep(1200);
            scenario.onActivity(a->{try{PlaylistService.start(a,payload);}catch(Exception e){startError.set(e);}});
            assertNull("Foreground launch failed",startError.get());
            awaitFixtureStarted(context);
            scenario.onActivity(a->PlaylistService.control("pause"));
            scenario.moveToState(Lifecycle.State.CREATED);SystemClock.sleep(350);
            assertEquals(1,snapshot().optInt("total"));assertFalse(snapshot().optBoolean("playing"));
            assertTrue("Paused service should survive activity backgrounding"+fixtureEvidence(context),serviceRunning());
            scenario.moveToState(Lifecycle.State.RESUMED);
            scenario.onActivity(a->PlaylistService.control("stop"));
            awaitFixtureAbsent(context);
            assertFalse("Stop must remove the foreground service"+fixtureEvidence(context),serviceRunning());
        }catch(Exception|AssertionError failure){primaryFailure=failure;throw failure;}
        finally{cleanupFixture(context,primaryFailure);}
    }
    /** Framework session contract only; actual SystemUI touch/visibility is verified by the opt-in UI probe. */
    @Test public void customStopFromOwnMediaControllerRemovesServiceAndNotification()throws Exception{
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        JSONObject entry=new JSONObject().put("wordId","N5-customstoptest").put("word","山").put("reading","やま").put("meaning","산").put("example","山へ行きます。");
        JSONObject payload=new JSONObject().put("entries",new JSONArray().put(entry)).put("includeMeaning",false).put("repeat",true);
        AtomicReference<Exception> startError=new AtomicReference<>();
        cleanupFixture(context,null);
        Throwable primaryFailure=null;
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(activity->{try{PlaylistService.start(activity,payload);}catch(Exception error){startError.set(error);}});
            assertNull("Foreground launch failed",startError.get());
            awaitFixtureStarted(context);
            MediaController controller=ownController(context,ownNotice(context));assertStopContract(context,controller);
            controller.getTransportControls().pause();
            long deadline=SystemClock.elapsedRealtime()+5000;
            while((controller.getPlaybackState()==null||controller.getPlaybackState().getState()!=PlaybackState.STATE_PAUSED)&&SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(100);
            assertEquals(PlaybackState.STATE_PAUSED,controller.getPlaybackState().getState());assertStopContract(context,controller);
            controller.getTransportControls().sendCustomAction(PlaylistService.STOP_CUSTOM_ACTION+".unknown",null);
            SystemClock.sleep(300);assertTrue("Unknown custom action must not stop service",serviceRunning());assertNotNull(ownNotice(context));
            controller.getTransportControls().sendCustomAction(PlaylistService.STOP_CUSTOM_ACTION,null);
            deadline=SystemClock.elapsedRealtime()+5000;
            while((ownServiceExists(context)||ownNotice(context)!=null)&&SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(100);
            assertFalse("Custom Stop must remove service",ownServiceExists(context));assertNull("Custom Stop must remove notification",ownNotice(context));
            assertFalse("Custom Stop must leave playback stopped",snapshot().optBoolean("playing"));
        }catch(Exception|AssertionError failure){primaryFailure=failure;throw failure;}
        finally{
            // Cleanup only: this cannot satisfy assertions for the custom action.
            cleanupFixture(context,primaryFailure);
        }
    }
}
