package com.studio501.kotoba;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.HapticFeedbackConstants;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.*;
import com.google.mlkit.nl.translate.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Local, origin-restricted WebView with on-device Japanese digital-ink and TTS. */
public final class MainActivity extends Activity {
    private static final String ORIGIN="https://appassets.androidplatform.net";
    private static final String HOME=ORIGIN+"/assets/index.html";
    private static final int EXPORT=100, IMPORT=101, LIMIT=8*1024*1024;
    private WebView web;
    private DigitalInkRecognitionModel inkModel;
    private DigitalInkRecognizer recognizer;
    private Translator translator;
    private final RemoteModelManager models=RemoteModelManager.getInstance();
    private TextToSpeech tts;
    private boolean speechReady=false, recognizing=false, destroyed=false;
    private final Map<String,Reply> speechReplies=new HashMap<>();
    private Reply fileReply;
    private String exportText;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private static final class Reply { final String id; final JavaScriptReplyProxy proxy; Reply(String i,JavaScriptReplyProxy p){id=i;proxy=p;} }

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(245,246,249));
        web=new WebView(this);root.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(root);
        if(Build.VERSION.SDK_INT>=30){getWindow().setDecorFitsSystemWindows(false);WindowInsetsController controller=getWindow().getInsetsController();if(controller!=null)controller.setSystemBarsAppearance(WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);}
        root.setOnApplyWindowInsetsListener((v,insets)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets bar=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(bar.left,bar.top,bar.right,bar.bottom);}else v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setMediaPlaybackRequiresUserGesture(true);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){Uri url=request.getUrl();if(!isLocal(url))return blocked();WebResourceResponse result=loader.shouldInterceptRequest(url);return result!=null?result:blocked();}
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !isLocal(request.getUrl());}
            @Override public void onReceivedSslError(WebView view,android.webkit.SslErrorHandler handler,android.net.http.SslError error){handler.cancel();}
        });
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){TextView message=new TextView(this);message.setText("Android System WebView 또는 Chrome을 업데이트한 후 코토바를 다시 열어 주세요.");message.setTextSize(18);message.setPadding(36,80,36,36);setContentView(message);return;}
        WebViewCompat.addWebMessageListener(web,"KotobaNative",Collections.singleton(ORIGIN),(view,message,sourceOrigin,isMainFrame,proxy)->{
            if(!isMainFrame||!ORIGIN.equals(sourceOrigin.toString()))return;
            String raw=message.getData();if(raw==null||raw.length()>LIMIT+10000)return;
            try{JSONObject request=new JSONObject(raw);String id=request.getString("id");if(!id.matches("[A-Za-z0-9-]{1,80}"))return;dispatch(request.getString("action"),request.optJSONObject("payload"),new Reply(id,proxy));}catch(Exception error){/* Unknown/malformed messages are not privileged operations. */}
        });
        try{DigitalInkRecognitionModelIdentifier id=DigitalInkRecognitionModelIdentifier.fromLanguageTag("ja");if(id==null)throw new IllegalStateException("Japanese model unavailable");inkModel=DigitalInkRecognitionModel.builder(id).build();recognizer=DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(inkModel).build());}catch(Exception error){inkModel=null;}
        translator=Translation.getClient(new TranslatorOptions.Builder().setSourceLanguage(TranslateLanguage.ENGLISH).setTargetLanguage(TranslateLanguage.KOREAN).build());
        tts=new TextToSpeech(this,status->{if(status==TextToSpeech.SUCCESS){int result=tts.setLanguage(Locale.JAPANESE);speechReady=result!=TextToSpeech.LANG_MISSING_DATA&&result!=TextToSpeech.LANG_NOT_SUPPORTED;}});
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
            @Override public void onStart(String id){}
            @Override public void onDone(String id){runOnUiThread(()->{Reply r=speechReplies.remove(id);if(r!=null)ok(r,json("completed",true));});}
            @Override public void onError(String id){runOnUiThread(()->{Reply r=speechReplies.remove(id);if(r!=null)fail(r,"일본어 음성 재생이 실패했습니다. 기기 음성을 확인해 주세요.");});}
            @Override public void onStop(String id,boolean interrupted){runOnUiThread(()->{Reply r=speechReplies.remove(id);if(r!=null)fail(r,"재생이 중단됐습니다. 다시 끝까지 들어 주세요.");});}
        });
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->web.evaluateJavascript("window.dispatchEvent(new Event('kotoba-back'))",null));
        web.loadUrl(HOME);
    }
    private static boolean isLocal(Uri uri){return "https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost())&&uri.getPath()!=null&&uri.getPath().startsWith("/assets/");}
    private static WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    private static JSONObject json(String key,Object value){JSONObject j=new JSONObject();try{j.put(key,value);}catch(Exception ignored){}return j;}
    private void ok(Reply r,JSONObject result){if(destroyed)return;JSONObject response=json("id",r.id);try{response.put("ok",true);response.put("result",result);r.proxy.postMessage(response.toString());}catch(Exception ignored){}}
    private void fail(Reply r,String message){if(destroyed)return;JSONObject response=json("id",r.id);try{response.put("ok",false);response.put("error",message);r.proxy.postMessage(response.toString());}catch(Exception ignored){}}
    private void dispatch(String action,JSONObject payload,Reply reply){
        JSONObject p=payload!=null?payload:new JSONObject();
        switch(action){
            case "status": if(inkModel==null){ok(reply,json("inkReady",false));break;}models.isModelDownloaded(inkModel).addOnSuccessListener(ready->{JSONObject result=json("inkReady",ready);try{result.put("speechReady",speechReady);}catch(Exception ignored){}ok(reply,result);}).addOnFailureListener(e->fail(reply,"모델 상태를 확인하지 못했습니다."));break;
            case "downloadInk": if(inkModel==null){fail(reply,"일본어 필기 모델을 지원하지 않습니다.");break;}models.download(inkModel,new DownloadConditions.Builder().build()).addOnSuccessListener(v->ok(reply,json("ready",true))).addOnFailureListener(e->fail(reply,"모델 다운로드에 실패했습니다. 연결과 저장 공간을 확인해 주세요."));break;
            case "recognize": recognize(p,reply);break;
            case "speak": speech(p,reply);break;
            case "stopSpeech": stopSpeech();ok(reply,json("stopped",true));break;
            case "downloadTranslation": translator.downloadModelIfNeeded(new DownloadConditions.Builder().build()).addOnSuccessListener(v->ok(reply,json("ready",true))).addOnFailureListener(e->fail(reply,"번역 모델 다운로드에 실패했습니다."));break;
            case "translate": translate(p,reply);break;
            case "haptic":web.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);ok(reply,json("done",true));break;
            case "export": openFile(p,reply,true);break;
            case "import": openFile(p,reply,false);break;
            case "exit":ok(reply,json("done",true));finish();break;
            default:fail(reply,"허용되지 않은 기기 기능입니다.");
        }
    }
    private void recognize(JSONObject p,Reply reply){
        if(recognizer==null||inkModel==null){fail(reply,"일본어 필기 모델이 없습니다.");return;}
        if(recognizing){fail(reply,"이전 필기를 확인하고 있습니다.");return;}
        final Ink ink;
        try{JSONArray lines=p.getJSONArray("strokes");if(lines.length()==0||lines.length()>60)throw new IllegalArgumentException();Ink.Builder builder=Ink.builder();int points=0;
            for(int i=0;i<lines.length();i++){JSONArray line=lines.getJSONArray(i);if(line.length()==0||line.length()>1600)throw new IllegalArgumentException();Ink.Stroke.Builder stroke=Ink.Stroke.builder();
                for(int j=0;j<line.length();j++){JSONArray point=line.getJSONArray(j);double x=point.getDouble(0),y=point.getDouble(1);if(!Double.isFinite(x)||!Double.isFinite(y)||x<0||x>1||y<0||y>1)throw new IllegalArgumentException();if(point.length()>2){double time=point.getDouble(2);if(!Double.isFinite(time)||time<0||time>1e15)throw new IllegalArgumentException();stroke.addPoint(Ink.Point.create((float)(x*1000),(float)(y*1000),(long)time));}else stroke.addPoint(Ink.Point.create((float)(x*1000),(float)(y*1000)));points++;}builder.addStroke(stroke.build());}
            if(points<4)throw new IllegalArgumentException();ink=builder.build();
        }catch(Exception e){fail(reply,"필기 데이터가 올바르지 않습니다. 다시 써 주세요.");return;}
        recognizing=true;models.isModelDownloaded(inkModel).addOnSuccessListener(ready->{
            if(!ready){recognizing=false;fail(reply,"설정에서 일본어 필기 모델을 먼저 준비해 주세요.");return;}
            RecognitionContext context=RecognitionContext.builder().setWritingArea(new WritingArea(1000,1000)).build();
            // No expected character, lesson answer, or target hint is passed into recognition.
            recognizer.recognize(ink,context).addOnSuccessListener(result->{recognizing=false;JSONArray candidates=new JSONArray();for(RecognitionCandidate c:result.getCandidates()){candidates.put(json("text",c.getText()));if(candidates.length()==5)break;}ok(reply,json("candidates",candidates));}).addOnFailureListener(e->{recognizing=false;fail(reply,"필기를 인식하지 못했습니다. 다시 써 주세요.");});
        }).addOnFailureListener(e->{recognizing=false;fail(reply,"필기 모델 상태 확인에 실패했습니다.");});
    }
    private void speech(JSONObject p,Reply reply){
        String text=p.optString("text","");double rate=p.optDouble("rate",.9);
        if(text.trim().isEmpty()||text.length()>150||!(rate>=.5&&rate<=1.2)){fail(reply,"발음 요청이 올바르지 않습니다.");return;}
        if(!speechReady){fail(reply,"기기에 일본어 TTS 음성을 설치한 후 다시 시도해 주세요.");return;}
        stopSpeech();tts.setSpeechRate((float)rate);speechReplies.put(reply.id,reply);
        if(tts.speak(text,TextToSpeech.QUEUE_FLUSH,null,reply.id)==TextToSpeech.ERROR){speechReplies.remove(reply.id);fail(reply,"음성 재생을 시작하지 못했습니다.");}
    }
    private void stopSpeech(){if(tts!=null)tts.stop();for(Reply r:speechReplies.values())fail(r,"재생이 중단됐습니다.");speechReplies.clear();}
    private void translate(JSONObject p,Reply reply){String text=p.optString("text","");if(text.trim().isEmpty()||text.length()>2000){fail(reply,"번역할 뜻이 올바르지 않습니다.");return;}
        TranslateRemoteModel korean=new TranslateRemoteModel.Builder(TranslateLanguage.KOREAN).build();models.isModelDownloaded(korean).addOnSuccessListener(ready->{if(!ready){fail(reply,"설정에서 한국어 번역 모델을 먼저 준비해 주세요.");return;}translator.translate(text).addOnSuccessListener(translated->ok(reply,json("text",translated))).addOnFailureListener(e->fail(reply,"번역을 완료하지 못했습니다. 원문을 표시합니다."));}).addOnFailureListener(e->fail(reply,"번역 모델 상태를 확인하지 못했습니다."));}
    private void openFile(JSONObject p,Reply reply,boolean export){
        if(fileReply!=null){fail(reply,"이전 파일 작업을 먼저 마쳐 주세요.");return;}
        if(export){exportText=p.optString("content","");if(exportText.getBytes(StandardCharsets.UTF_8).length>LIMIT){fail(reply,"백업이 8MB보다 큽니다.");exportText=null;return;}}
        fileReply=reply;Intent intent=new Intent(export?Intent.ACTION_CREATE_DOCUMENT:Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/json");if(export){String name=p.optString("name","kotoba-backup.json");if(!name.matches("[A-Za-z0-9._-]{1,100}"))name="kotoba-backup.json";intent.putExtra(Intent.EXTRA_TITLE,name);}
        try{startActivityForResult(intent,export?EXPORT:IMPORT);}catch(Exception e){fileReply=null;exportText=null;fail(reply,"파일 선택기를 열 수 없습니다.");}
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);if(requestCode!=EXPORT&&requestCode!=IMPORT)return;Reply reply=fileReply;fileReply=null;if(reply==null)return;if(resultCode!=RESULT_OK||data==null||data.getData()==null){exportText=null;fail(reply,"파일 작업이 취소됐습니다.");return;}Uri uri=data.getData();String content=exportText;exportText=null;
        io.execute(()->{try{if(requestCode==EXPORT){try(OutputStream output=getContentResolver().openOutputStream(uri)){if(output==null)throw new IllegalStateException();output.write(content.getBytes(StandardCharsets.UTF_8));}runOnUiThread(()->ok(reply,json("saved",true)));}else{byte[] bytes;try(InputStream input=getContentResolver().openInputStream(uri)){if(input==null)throw new IllegalStateException();java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[8192];int size;while((size=input.read(buffer))!=-1){if(out.size()+size>LIMIT)throw new IllegalArgumentException();out.write(buffer,0,size);}bytes=out.toByteArray();}String text=new String(bytes,StandardCharsets.UTF_8);runOnUiThread(()->ok(reply,json("content",text)));}}catch(Exception e){runOnUiThread(()->fail(reply,"파일을 처리하지 못했습니다. 8MB 이하 JSON 파일과 저장 공간을 확인해 주세요."));}});
    }
    @Override public void onBackPressed(){web.evaluateJavascript("window.dispatchEvent(new Event('kotoba-back'))",null);}
    @Override protected void onPause(){stopSpeech();super.onPause();}
    @Override protected void onDestroy(){destroyed=true;stopSpeech();if(tts!=null)tts.shutdown();if(recognizer!=null)recognizer.close();if(translator!=null)translator.close();if(web!=null){if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))WebViewCompat.removeWebMessageListener(web,"KotobaNative");web.destroy();}io.shutdownNow();super.onDestroy();}
}
