package com.studio501.kotoba;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import org.json.JSONObject;
import java.util.Set;

/** Uses only an installed, non-network Japanese voice from the user's system engine. */
final class JapaneseSpeech {
    interface Reply {void send(JSONObject result,String error);}
    private final Handler main=new Handler(Looper.getMainLooper());
    private TextToSpeech tts; private boolean ready=false,dead=false;private Reply pending;private String utterance="",queuedText="";private float rate=1;private long sequence=0;private Runnable timeout;
    JapaneseSpeech(Context c){tts=new TextToSpeech(c.getApplicationContext(),status->main.post(()->{if(dead)return;ready=status==TextToSpeech.SUCCESS;if(ready){tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){@Override public void onStart(String id){}@Override public void onDone(String id){main.post(()->finish(id,null));}@Override public void onError(String id){main.post(()->finish(id,"일본어 기기 음성을 재생하지 못했어요."));}@Override public void onStop(String id,boolean interrupted){main.post(()->finish(id,"재생이 중단되었어요."));}});}if(pending!=null){if(ready)perform();else finish(utterance,"일본어 기기 음성이 없어요.");}}));}
    void speak(String text,double speed,Reply reply){stop();if(dead||text==null||text.trim().isEmpty()||text.length()>500){reply.send(null,"읽을 내용을 확인해 주세요.");return;}queuedText=text;rate=(float)Math.max(.5,Math.min(1.2,speed));pending=reply;utterance="kotoba-"+(++sequence);String id=utterance;timeout=()->{if(id.equals(utterance)){if(tts!=null)tts.stop();finish(id,"기기 음성 응답이 없어 내장 음성으로 전환해요.");}};main.postDelayed(timeout,10000);if(ready)perform();}
    private void perform(){try{Set<Voice> voices=tts.getVoices();Voice best=null;if(voices!=null)for(Voice v:voices){if(!"ja".equals(v.getLocale().getLanguage())||v.isNetworkConnectionRequired()||(v.getFeatures()!=null&&v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)))continue;if(best==null||v.getQuality()>best.getQuality())best=v;}
        if(best==null||tts.setVoice(best)!=TextToSpeech.SUCCESS){finish(utterance,"설치된 오프라인 일본어 음성이 없어요.");return;}
        tts.setSpeechRate(rate);tts.setPitch(1);Bundle args=new Bundle();args.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME,1);if(tts.speak(queuedText,TextToSpeech.QUEUE_FLUSH,args,utterance)==TextToSpeech.ERROR)finish(utterance,"기기 음성을 재생하지 못했어요.");
    }catch(Exception e){finish(utterance,"기기 음성을 사용할 수 없어요.");}}
    private void finish(String id,String error){if(!id.equals(utterance)||pending==null)return;Reply callback=pending;pending=null;queuedText="";utterance="";if(timeout!=null)main.removeCallbacks(timeout);callback.send(new JSONObject(),error);}
    void stop(){if(tts!=null)tts.stop();finish(utterance,"재생이 중단되었어요.");}
    void destroy(){stop();dead=true;if(tts!=null)tts.shutdown();main.removeCallbacksAndMessages(null);}
}
