package com.studio501.kotoba;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.media.*;
import android.media.session.*;
import android.os.*;
import android.speech.tts.*;
import java.util.*;
import org.json.*;

/** User-started, local TTS playlist. No microphone, location, network voice or boot start. */
public final class PlaylistService extends Service {
    private static final String CHANNEL="kotoba-listening";
    private static final int NOTICE=410;
    static final String STOP_CUSTOM_ACTION="com.studio501.kotoba.action.STOP_LISTENING";
    private static PlaylistService active;
    private static JSONObject lastStatus=new JSONObject();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private MediaSession media;
    private AudioManager audio;
    private AudioFocusRequest focus;
    private PowerManager.WakeLock wake;
    private JSONArray entries=new JSONArray();
    private boolean ready=false,playing=false,meaning=true,example=true,repeat=false,dead=false;
    private int index=0,part=0;
    private long generation=0;
    private float rate=1;
    private String error="",utterance="";
    private Runnable timeout,idle;
    private final AudioManager.OnAudioFocusChangeListener focusListener=change->{if(change<0)pausePlayback();};
    private final BroadcastReceiver noisy=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){pausePlayback();}};

    public static JSONObject status(){return active==null?lastStatus:active.snapshot();}
    public static void pauseForLesson(){if(active!=null)active.pausePlayback();}
    public static void start(Context c,JSONObject payload)throws Exception{
        JSONArray rows=payload.optJSONArray("entries");
        if(rows==null||rows.length()<1||rows.length()>200)throw new IllegalArgumentException("목록은 1~200단어여야 합니다.");
        for(int i=0;i<rows.length();i++){
            JSONObject e=rows.getJSONObject(i);
            if(!e.optString("wordId").matches("N[1-5]-[a-z0-9]+"))throw new IllegalArgumentException("단어 ID 오류");
            for(String k:new String[]{"word","reading","meaning","example"})if(e.optString(k).length()>500)throw new IllegalArgumentException("문장이 너무 깁니다.");
            if(e.optString("reading").trim().isEmpty())throw new IllegalArgumentException("단어의 읽기가 없습니다.");
        }
        Intent intent=new Intent(c,PlaylistService.class).setAction("start").putExtra("payload",payload.toString());
        if(Build.VERSION.SDK_INT>=26)c.startForegroundService(intent);else c.startService(intent);
    }
    public static void control(String action){if(active==null)return;active.command(action);}
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public void onCreate(){
        super.onCreate();active=this;audio=(AudioManager)getSystemService(AUDIO_SERVICE);
        if(Build.VERSION.SDK_INT>=26){NotificationChannel ch=new NotificationChannel(CHANNEL,"연속 듣기",NotificationManager.IMPORTANCE_LOW);ch.setSound(null,null);((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);}
        media=new MediaSession(this,"KotobaPlaylist");media.setCallback(new MediaSession.Callback(){
            @Override public void onPlay(){command("play");}@Override public void onPause(){command("pause");}
            @Override public void onSkipToNext(){command("next");}@Override public void onSkipToPrevious(){command("prev");}
            @Override public void onStop(){command("stop");}
            @Override public void onCustomAction(String action,Bundle extras){if(STOP_CUSTOM_ACTION.equals(action))command("stop");}
        });media.setActive(true);
        IntentFilter filter=new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if(Build.VERSION.SDK_INT>=33)registerReceiver(noisy,filter,Context.RECEIVER_NOT_EXPORTED);else registerReceiver(noisy,filter);
        wake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"kotoba:playlist");wake.setReferenceCounted(false);
        foreground();
        tts=new TextToSpeech(getApplicationContext(),status->handler.post(()->{
            if(dead)return;ready=status==TextToSpeech.SUCCESS;if(!ready){fail("기기 음성을 초기화하지 못했습니다.");return;}
            tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
                @Override public void onStart(String id){}
                @Override public void onDone(String id){handler.post(()->{if(playing&&id.equals(utterance)){clearTimeout();part++;speakPart();}});}
                @Override public void onError(String id){handler.post(()->{if(id.equals(utterance))fail("기기 음성 재생에 실패했습니다.");});}
            });if(playing)speakPart();
        }));
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent==null){stopSelf();return START_NOT_STICKY;}
        if("start".equals(intent.getAction()))try{
            JSONObject p=new JSONObject(intent.getStringExtra("payload"));entries=p.getJSONArray("entries");
            if(entries.length()<1||entries.length()>200)throw new IllegalArgumentException();
            index=Math.max(0,Math.min(entries.length()-1,p.optInt("index",0)));part=0;
            meaning=p.optBoolean("includeMeaning",true);example=p.optBoolean("includeExample",true);repeat=p.optBoolean("repeat",false);
            rate=(float)Math.max(.5,Math.min(1.2,p.optDouble("rate",1)));command("play");
        }catch(Exception e){fail("재생 목록을 읽을 수 없습니다.");}
        else command(intent.getAction());
        return START_NOT_STICKY;
    }
    private void command(String action){
        if(dead)return;
        if("stop".equals(action)){pausePlayback();error="";lastStatus=snapshot();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return;}
        if("pause".equals(action)){pausePlayback();return;}
        if(!Arrays.asList("play","next","prev").contains(action)||entries.length()==0)return;
        interrupt();if(idle!=null)handler.removeCallbacks(idle);
        if("next".equals(action)){index=Math.min(entries.length()-1,index+1);part=0;}
        if("prev".equals(action)){index=Math.max(0,index-1);part=0;}
        error="";playing=true;foreground();
        int result;
        if(Build.VERSION.SDK_INT>=26){focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setWillPauseWhenDucked(true).setOnAudioFocusChangeListener(focusListener,handler).build();result=audio.requestAudioFocus(focus);}
        else result=audio.requestAudioFocus(focusListener,AudioManager.STREAM_MUSIC,AudioManager.AUDIOFOCUS_GAIN);
        if(result!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED){fail("다른 앱이 소리를 사용 중입니다. 다시 재생을 누르세요.");return;}
        wake.acquire(2*60*60*1000L);handler.removeCallbacks(endSession);handler.postDelayed(endSession,2*60*60*1000L);
        if(ready)speakPart();else {clearTimeout();timeout=()->fail("음성 엔진이 응답하지 않습니다.");handler.postDelayed(timeout,15000);}
        refresh();
    }
    private final Runnable endSession=()->{error="2시간 재생을 마쳤습니다.";command("stop");};
    private Voice voice(String lang){Set<Voice> voices=tts.getVoices();Voice best=null;if(voices!=null)for(Voice v:voices){if(!lang.equals(v.getLocale().getLanguage())||v.isNetworkConnectionRequired()||(v.getFeatures()!=null&&v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)))continue;if(best==null||v.getQuality()>best.getQuality())best=v;}return best;}
    private void speakPart(){
        if(!playing||!ready||dead)return;clearTimeout();
        try{
            JSONObject e=entries.getJSONObject(index);List<String> texts=new ArrayList<>(),langs=new ArrayList<>();
            texts.add(e.getString("reading"));langs.add("ja");
            if(meaning){texts.add(e.optString("meaning"));langs.add("ko");}
            if(example&&!e.optString("example").isEmpty()){texts.add(e.getString("example"));langs.add("ja");}
            if(part>=texts.size()){part=0;index++;if(index>=entries.length()){if(repeat)index=0;else {index=entries.length()-1;pausePlayback();return;}}long token=generation;handler.postDelayed(()->{if(token==generation)speakPart();},600);refresh();return;}
            String lang=langs.get(part);Voice v=voice(lang);if(v==null){fail(("ko".equals(lang)?"한국어":"일본어")+" 오프라인 음성을 설치하세요.");return;}
            if(tts.setVoice(v)!=TextToSpeech.SUCCESS){fail("기기 음성을 선택하지 못했습니다.");return;}
            tts.setSpeechRate(rate);tts.setPitch(1);utterance="playlist-"+(++generation);String id=utterance;
            if(tts.speak(texts.get(part),TextToSpeech.QUEUE_FLUSH,new Bundle(),id)==TextToSpeech.ERROR){fail("음성을 재생하지 못했습니다.");return;}
            timeout=()->{if(id.equals(utterance))fail("음성 엔진 응답 시간이 초과되었습니다.");};handler.postDelayed(timeout,95000);refresh();
        }catch(Exception e){fail("재생을 계속할 수 없습니다.");}
    }
    private void clearTimeout(){if(timeout!=null)handler.removeCallbacks(timeout);timeout=null;}
    private void interrupt(){generation++;utterance="";clearTimeout();if(tts!=null)tts.stop();}
    private void pausePlayback(){
        playing=false;interrupt();if(wake!=null&&wake.isHeld())wake.release();
        if(audio!=null){if(Build.VERSION.SDK_INT>=26&&focus!=null)audio.abandonAudioFocusRequest(focus);else audio.abandonAudioFocus(focusListener);}
        refresh();if(idle!=null)handler.removeCallbacks(idle);idle=()->{lastStatus=snapshot();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();};handler.postDelayed(idle,600000);
    }
    private void fail(String message){error=message;pausePlayback();}
    private JSONObject snapshot(){try{return new JSONObject().put("playing",playing).put("index",index).put("part",part).put("total",entries.length()).put("word",entries.optJSONObject(index)==null?"":entries.optJSONObject(index).optString("word")).put("error",error);}catch(Exception ignored){return new JSONObject();}}
    private PendingIntent action(String a){return PendingIntent.getService(this,a.hashCode(),new Intent(this,PlaylistService.class).setAction(a),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private Notification notification(){
        PendingIntent open=PendingIntent.getActivity(this,410,new Intent(this,MainActivity.class).putExtra("kotoba-playlist",true),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);
        String word=entries.optJSONObject(index)==null?"코토바":entries.optJSONObject(index).optString("word");
        return b.setSmallIcon(android.R.drawable.ic_media_play).setContentTitle(word).setContentText(error.isEmpty()?((entries.length()>0?index+1:0)+" / "+entries.length()+" · "+(playing?"연속 듣기":"일시정지")):error).setContentIntent(open).setOnlyAlertOnce(true).setOngoing(playing)
          .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous,"이전",action("prev")).build())
          .addAction(new Notification.Action.Builder(playing?android.R.drawable.ic_media_pause:android.R.drawable.ic_media_play,playing?"일시정지":"재생",action(playing?"pause":"play")).build())
          .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next,"다음",action("next")).build())
          .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"정지",action("stop")).build())
          .setStyle(new Notification.MediaStyle().setMediaSession(media.getSessionToken()).setShowActionsInCompactView(0,1,2)).build();
    }
    private void foreground(){if(Build.VERSION.SDK_INT>=29)startForeground(NOTICE,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);else startForeground(NOTICE,notification());}
    private void refresh(){if(dead||media==null)return;lastStatus=snapshot();media.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE,lastStatus.optString("word","코토바")).putString(MediaMetadata.METADATA_KEY_ARTIST,"코토바 연속 듣기").build());
        // Android 13+ derives its fourth/fifth media buttons from custom actions, not ACTION_STOP.
        media.setPlaybackState(new PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY|PlaybackState.ACTION_PAUSE|PlaybackState.ACTION_SKIP_TO_NEXT|PlaybackState.ACTION_SKIP_TO_PREVIOUS|PlaybackState.ACTION_STOP)
          .addCustomAction(STOP_CUSTOM_ACTION,"정지",R.drawable.ic_playlist_stop)
          .setState(playing?PlaybackState.STATE_PLAYING:PlaybackState.STATE_PAUSED,PlaybackState.PLAYBACK_POSITION_UNKNOWN,playing?1:0).build());
        // MediaSession notifications are exempt from POST_NOTIFICATIONS; keep posted actions in sync.
        ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTICE,notification());}
    @Override public void onDestroy(){playing=false;lastStatus=snapshot();dead=true;interrupt();handler.removeCallbacksAndMessages(null);if(tts!=null)tts.shutdown();if(wake!=null&&wake.isHeld())wake.release();if(audio!=null){if(Build.VERSION.SDK_INT>=26&&focus!=null)audio.abandonAudioFocusRequest(focus);else audio.abandonAudioFocus(focusListener);}try{unregisterReceiver(noisy);}catch(Exception ignored){}if(media!=null)media.release();if(active==this)active=null;super.onDestroy();}
}
