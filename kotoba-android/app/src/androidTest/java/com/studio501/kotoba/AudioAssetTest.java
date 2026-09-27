package com.studio501.kotoba;

import static org.junit.Assert.*;
import android.content.Context;
import android.media.MediaDataSource;
import android.media.MediaPlayer;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Actual Android decoder/playback, not a JS heard=true fixture. Not a phonetics test. */
@RunWith(AndroidJUnit4.class)
public final class AudioAssetTest {
    private byte[] asset(Context context,String path)throws Exception{
        try(InputStream in=context.getAssets().open(path);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toByteArray();
        }
    }
    private static final class Bytes extends MediaDataSource{
        private final byte[] bytes;
        Bytes(byte[] value){bytes=value;}
        @Override public int readAt(long position,byte[] buffer,int offset,int size){
            if(position>=bytes.length)return -1;
            if(position<0)return -1;
            int count=(int)Math.min(size,bytes.length-position);System.arraycopy(bytes,(int)position,buffer,offset,count);return count;
        }
        @Override public long getSize(){return bytes.length;}
        @Override public void close(){}
    }
    @Test public void correctedRecordingsCompleteOnAndroidWithoutSpeechEngine()throws Exception{
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        JSONObject manifest=new JSONObject(new String(asset(context,"www/data/audio-manifest.json"),StandardCharsets.UTF_8));
        assertEquals(3,manifest.getInt("version"));
        assertEquals("038-phonetic-audit-v1",manifest.getString("audioRevision"));
        assertEquals("ハ",manifest.getJSONObject("speechTexts").getString("KANA-h306f"));
        assertEquals("ヘ",manifest.getJSONObject("speechTexts").getString("KANA-h3078"));
        assertEquals("サンセイ",manifest.getJSONObject("speechTexts").getString("N3-1d6ofkx"));
        String[] ids={"KANA-h306f","KANA-h3078","KANA-h3056","KANA-h3089","KANA-h3092","N5-cgfly3","N3-1b97nrt","N3-1d6ofkx"};
        for(String id:ids){
            String name=manifest.getJSONObject("clips").getString(id);assertTrue(name.matches("[a-f0-9]{24}\\.ogg"));
            byte[] bytes=asset(context,"www/data/audio/"+name);assertTrue(bytes.length>300);
            CountDownLatch done=new CountDownLatch(1);AtomicReference<String> error=new AtomicReference<>();
            MediaPlayer player=new MediaPlayer();
            try{
                player.setOnErrorListener((mp,what,extra)->{error.set(what+":"+extra);done.countDown();return true;});
                player.setOnPreparedListener(mp->{if(mp.getDuration()<150)error.set("Too short");mp.setVolume(0f,0f);mp.start();});
                player.setOnCompletionListener(mp->done.countDown());
                player.setDataSource(new Bytes(bytes));player.prepareAsync();
                assertTrue(id+" completion timed out",done.await(20,TimeUnit.SECONDS));assertNull(id+" playback error",error.get());
            }finally{player.release();}
        }
    }
}
