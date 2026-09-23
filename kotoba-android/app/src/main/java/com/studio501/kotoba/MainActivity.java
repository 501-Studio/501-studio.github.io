package com.studio501.kotoba;

import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizer;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.recognition.Ink;
import com.google.mlkit.vision.digitalink.recognition.RecognitionContext;
import com.google.mlkit.vision.digitalink.recognition.WritingArea;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native-only services. Strokes and the target answer are never sent to a server. */
public final class MainActivity extends ComponentActivity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START = ORIGIN + "/assets/www/index.html";
    private static final String SOURCE = "/evanclan/OpenJLPT/c42fd9fa3777bfc1775446f7c418d549dfd6e4cf/data/json/vocab/";
    private static final int EXPORT = 201, IMPORT = 202, MAX_BACKUP = 30_000_000;
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady, destroyed, recognizing;
    private DigitalInkRecognizer recognizer;
    private DigitalInkRecognitionModel model;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private Pending audio, picker;
    private String exportData;
    private static final class Pending {
        final String id; final JavaScriptReplyProxy reply;
        Pending(String id, JavaScriptReplyProxy reply) { this.id=id; this.reply=reply; }
    }
    private void respond(Pending request, Object data, String error) {
        if (request==null || destroyed) return;
        runOnUiThread(() -> { if(destroyed)return; try {
            JSONObject response=new JSONObject().put("id",request.id);
            if(error!=null) response.put("error",error); else response.put("result",data==null?new JSONObject():data);
            request.reply.postMessage(response.toString());
        } catch (Exception ignored) { /* A closed web document has no reply target. */ } });
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web=new WebView(this); web.setBackgroundColor(Color.rgb(245,246,249));
        setContentView(web);
        web.setOnApplyWindowInsetsListener((v,insets)->{
            if(Build.VERSION.SDK_INT>=30){android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());v.setPadding(i.left,i.top,i.right,i.bottom);}
            else v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        WebSettings ws=web.getSettings();ws.setJavaScriptEnabled(true);ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);ws.setAllowContentAccess(false);ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        ws.setMediaPlaybackRequiresUserGesture(true);if(Build.VERSION.SDK_INT>=26)ws.setSafeBrowsingEnabled(true);
        final WebViewAssetLoader assets=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();if("https".equals(u.getScheme())&&"appassets.androidplatform.net".equals(u.getHost())){
                    WebResourceResponse res=assets.shouldInterceptRequest(u);return res!=null?res:blocked();
                }
                if("https".equals(u.getScheme())&&"raw.githubusercontent.com".equals(u.getHost())&&u.getPath()!=null&&u.getPath().matches(java.util.regex.Pattern.quote(SOURCE)+"n[1-5]\\.json")&&"GET".equals(req.getMethod()))return null;
                return blocked();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();if(u.toString().startsWith(ORIGIN+"/assets/www/"))return false;
                if(req.hasGesture()&&"https".equals(u.getScheme()))try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}
                return true;
            }
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){
                stopSpeech("화면이 재시작되어 재생을 중단했습니다.");view.destroy();
                new AlertDialog.Builder(MainActivity.this).setTitle("학습 화면을 다시 열어 주세요").setMessage("이미 저장된 기록은 유지됩니다.").setPositiveButton("다시 열기",(d,w)->recreate()).setNegativeButton("닫기",(d,w)->finish()).show();return true;
            }
        });
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            new AlertDialog.Builder(this).setTitle("Android System WebView 업데이트 필요").setMessage("안전한 손글씨 인식을 위해 시스템 WebView를 업데이트한 뒤 앱을 다시 열어 주세요.").setPositiveButton("닫기",(d,w)->finish()).show();return;
        }
        WebViewCompat.addWebMessageListener(web,"KotobaNative",Collections.singleton(ORIGIN),(view,message,sourceOrigin,isMainFrame,proxy)->{
            if(!isMainFrame || !ORIGIN.equals(sourceOrigin.toString()))return;
            handle(message,new Pending("",proxy));
        });
        try { DigitalInkRecognitionModelIdentifier identifier=DigitalInkRecognitionModelIdentifier.fromLanguageTag("ja");
            if(identifier!=null){model=DigitalInkRecognitionModel.builder(identifier).build();recognizer=DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(model).build());}
        } catch(Exception ignored) { /* Explicit unavailable response below. */ }
        tts=new TextToSpeech(this,status->{ttsReady=status==TextToSpeech.SUCCESS;});
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
            @Override public void onStart(String id) {}
            @Override public void onDone(String id){runOnUiThread(()->{if(audio!=null&&audio.id.equals(id)){Pending p=audio;audio=null;respond(p,new JSONObject(),null);}});}
            @Override public void onError(String id){runOnUiThread(()->{if(audio!=null&&audio.id.equals(id))stopSpeech("일본어 음성 재생에 실패했습니다.");});}
            @Override public void onStop(String id,boolean interrupted){runOnUiThread(()->{if(audio!=null&&audio.id.equals(id))stopSpeech("재생이 중단되었습니다.");});}
        });
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){@Override public void handleOnBackPressed(){web.evaluateJavascript("window.dispatchEvent(new Event('kotoba-back'))",null);}});
        web.loadUrl(START);
    }
    private static WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream("Blocked resource".getBytes(StandardCharsets.UTF_8)));}
    private void handle(WebMessageCompat message,Pending base){
        Pending request=base;
        try { String raw=message.getData();if(raw==null||raw.length()>MAX_BACKUP+1000)return;JSONObject q=new JSONObject(raw);
            String id=q.getString("id"),type=q.getString("type");if(id.length()>100)return;Pending p=new Pending(id,base.reply);request=p;JSONObject body=q.optJSONObject("payload");if(body==null)body=new JSONObject();
            switch(type){
                case "status": if(model==null){respond(p,null,"일본어 인식 모델을 사용할 수 없습니다.");return;}RemoteModelManager.getInstance().isModelDownloaded(model).addOnSuccessListener(ready->{try{respond(p,new JSONObject().put("ready",ready),null);}catch(Exception ignored){}}).addOnFailureListener(e->respond(p,null,"모델 상태 확인 실패"));break;
                case "downloadModel": if(model==null){respond(p,null,"일본어 인식 모델을 사용할 수 없습니다.");return;}RemoteModelManager.getInstance().download(model,new DownloadConditions.Builder().build()).addOnSuccessListener(v->respond(p,new JSONObject(),null)).addOnFailureListener(e->respond(p,null,"모델을 내려받지 못했습니다. 네트워크와 저장 공간을 확인하세요."));break;
                case "recognize": recognize(p,body);break;
                case "speak": speak(p,body);break;
                case "stopAudio": stopSpeech("재생이 중단되었습니다.");respond(p,new JSONObject(),null);break;
                case "exportBackup": if(picker!=null){respond(p,null,"다른 파일 작업이 진행 중입니다.");return;}String data=body.getString("json");if(data.length()>MAX_BACKUP){respond(p,null,"백업이 너무 큽니다.");return;}new JSONObject(data);picker=p;exportData=data;Intent out=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,"kotoba-backup.json");startActivityForResult(out,EXPORT);break;
                case "importBackup": if(picker!=null){respond(p,null,"다른 파일 작업이 진행 중입니다.");return;}picker=p;startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json"),IMPORT);break;
                case "requestExit": new AlertDialog.Builder(this).setTitle("코토바를 닫을까요?").setMessage("저장한 학습 기록은 유지됩니다.").setPositiveButton("닫기",(d,w)->finish()).setNegativeButton("계속 학습",(d,w)->respond(p,new JSONObject(),null)).show();break;
                default: respond(p,null,"지원하지 않는 요청입니다.");
            }
        } catch(Exception e){respond(request,null,"요청을 처리하지 못했습니다.");}
    }
    private void recognize(Pending p,JSONObject body) throws Exception {
        if(recognizer==null||model==null){respond(p,null,"일본어 손글씨 인식을 사용할 수 없습니다.");return;}
        if(recognizing){respond(p,null,"이전 글자를 확인하고 있습니다.");return;}
        JSONArray lines=body.getJSONArray("strokes");if(lines.length()==0||lines.length()>60){respond(p,null,"획 수를 확인해 주세요.");return;}
        Ink.Builder ink=Ink.builder();int points=0;
        for(int i=0;i<lines.length();i++){JSONArray line=lines.getJSONArray(i);if(line.length()<1||line.length()>2000)throw new IllegalArgumentException();Ink.Stroke.Builder stroke=Ink.Stroke.builder();
            for(int j=0;j<line.length();j++){JSONArray pt=line.getJSONArray(j);double x=pt.getDouble(0),y=pt.getDouble(1);if(Double.isNaN(x)||Double.isInfinite(x)||Double.isNaN(y)||Double.isInfinite(y)||x<0||x>1||y<0||y>1)throw new IllegalArgumentException();stroke.addPoint(Ink.Point.create((float)(x*1000),(float)(y*1000)));points++;}
            ink.addStroke(stroke.build());
        }
        if(points<3){respond(p,null,"한 글자를 직접 써 주세요.");return;}recognizing=true;
        // Never provide the expected answer or lesson vocabulary as recognition context.
        RecognitionContext context=RecognitionContext.builder().setWritingArea(new WritingArea(1000,1000)).build();
        RemoteModelManager.getInstance().isModelDownloaded(model).addOnSuccessListener(available->{
            if(!available){recognizing=false;respond(p,null,"설정에서 일본어 손글씨 모델을 먼저 다운로드해 주세요.");return;}
            recognizer.recognize(ink.build(),context).addOnSuccessListener(result->{recognizing=false;JSONArray candidates=new JSONArray();for(int i=0;i<Math.min(5,result.getCandidates().size());i++)candidates.put(result.getCandidates().get(i).getText());try{respond(p,new JSONObject().put("candidates",candidates),null);}catch(Exception ignored){}}).addOnFailureListener(e->{recognizing=false;respond(p,null,"손글씨를 판독하지 못했습니다. 다시 써 주세요.");});
        }).addOnFailureListener(e->{recognizing=false;respond(p,null,"인식 모델을 확인하지 못했습니다.");});
    }
    private void speak(Pending p,JSONObject body) throws Exception {
        stopSpeech("새로운 재생이 시작되었습니다.");if(!ttsReady||tts==null){respond(p,null,"음성 엔진을 준비하고 있습니다. 다시 눌러 주세요.");return;}
        String text=body.getString("text");double rate=body.optDouble("rate",.85);if(text.trim().isEmpty()||text.length()>120||rate<.5||rate>1.2){respond(p,null,"음성 입력을 확인해 주세요.");return;}
        int available=tts.setLanguage(Locale.JAPANESE);if(available==TextToSpeech.LANG_MISSING_DATA||available==TextToSpeech.LANG_NOT_SUPPORTED){respond(p,null,"기기 음성 설정에서 일본어 음성을 설치해 주세요.");return;}
        tts.setSpeechRate((float)rate);audio=p;int result=tts.speak(text,TextToSpeech.QUEUE_FLUSH,new Bundle(),p.id);if(result==TextToSpeech.ERROR)stopSpeech("음성을 재생하지 못했습니다.");
    }
    private void stopSpeech(String reason){Pending old=audio;audio=null;if(tts!=null)tts.stop();respond(old,null,reason);}
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);if(requestCode!=EXPORT&&requestCode!=IMPORT)return;
        Pending p=picker;picker=null;String json=exportData;exportData=null;
        if(resultCode!=RESULT_OK||data==null||data.getData()==null){respond(p,null,"파일 선택이 취소되었습니다.");return;}Uri uri=data.getData();
        io.execute(()->{try{if(requestCode==EXPORT){try(OutputStream stream=getContentResolver().openOutputStream(uri,"wt")){if(stream==null)throw new IllegalStateException();stream.write(json.getBytes(StandardCharsets.UTF_8));}respond(p,new JSONObject(),null);}
            else{try(InputStream in=getContentResolver().openInputStream(uri);ByteArrayOutputStream out=new ByteArrayOutputStream()){if(in==null)throw new IllegalStateException();byte[] chunk=new byte[8192];int n;while((n=in.read(chunk))!=-1){if(out.size()+n>MAX_BACKUP)throw new IllegalArgumentException();out.write(chunk,0,n);}respond(p,new JSONObject().put("json",new String(out.toByteArray(),StandardCharsets.UTF_8)),null);}}}
            catch(Exception e){respond(p,null,"백업 파일을 읽거나 저장하지 못했습니다.");}});
    }
    @Override protected void onPause(){stopSpeech("앱이 잠시 멈춰 재생을 중단했습니다.");if(web!=null)web.onPause();super.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onDestroy(){stopSpeech("앱이 종료되었습니다.");destroyed=true;if(recognizer!=null)recognizer.close();if(tts!=null)tts.shutdown();if(web!=null)web.destroy();io.shutdown();super.onDestroy();}
}
