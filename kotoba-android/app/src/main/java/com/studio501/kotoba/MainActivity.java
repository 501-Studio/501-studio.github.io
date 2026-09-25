package com.studio501.kotoba;

import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** APK-local learning, stroke and pronunciation assets. Native bridge handles backups and exit only. */
public final class MainActivity extends ComponentActivity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START = ORIGIN + "/assets/www/index.html";
    private static final int EXPORT = 201, IMPORT = 202, MAX_BACKUP = 30_000_000;
    private WebView web;
    private boolean destroyed;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private Pending picker;
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
        // Inset the parent, not the WebView itself: CSS fixed buttons then stay above navigation.
        WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
        FrameLayout frame=new FrameLayout(this);frame.setBackgroundColor(Color.rgb(245,246,249));
        frame.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(frame);
        WindowCompat.getInsetsController(getWindow(),frame).setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(getWindow(),frame).setAppearanceLightNavigationBars(true);
        ViewCompat.setOnApplyWindowInsetsListener(frame,(v,insets)->{
            androidx.core.graphics.Insets i=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout()|WindowInsetsCompat.Type.ime());
            v.setPadding(i.left,i.top,i.right,i.bottom);return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(frame);
        WebSettings ws=web.getSettings();ws.setJavaScriptEnabled(true);ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);ws.setAllowContentAccess(false);ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // Listening prompts auto-play once from APK-local Ogg files. No network TTS is used.
        ws.setMediaPlaybackRequiresUserGesture(false);if(Build.VERSION.SDK_INT>=26)ws.setSafeBrowsingEnabled(true);
        final WebViewAssetLoader assets=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();if("https".equals(u.getScheme())&&"appassets.androidplatform.net".equals(u.getHost())){
                    WebResourceResponse res=assets.shouldInterceptRequest(u);return res!=null?res:blocked();
                }
                return blocked();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();if(u.toString().startsWith(ORIGIN+"/assets/www/"))return false;
                if(req.hasGesture()&&"https".equals(u.getScheme()))try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}
                return true;
            }
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){
                view.destroy();
                new AlertDialog.Builder(MainActivity.this).setTitle("학습 화면을 다시 열어 주세요").setMessage("이미 저장된 기록은 유지됩니다.").setPositiveButton("다시 열기",(d,w)->recreate()).setNegativeButton("닫기",(d,w)->finish()).show();return true;
            }
        });
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            new AlertDialog.Builder(this).setTitle("Android System WebView 업데이트 필요").setMessage("학습 화면과 기기 기능을 사용하려면 시스템 WebView를 업데이트한 뒤 앱을 다시 열어 주세요.").setPositiveButton("닫기",(d,w)->finish()).show();return;
        }
        WebViewCompat.addWebMessageListener(web,"KotobaNative",Collections.singleton(ORIGIN),(view,message,sourceOrigin,isMainFrame,proxy)->{
            if(!isMainFrame || !ORIGIN.equals(sourceOrigin.toString()))return;
            handle(message,new Pending("",proxy));
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
                case "exportBackup": if(picker!=null){respond(p,null,"다른 파일 작업이 진행 중입니다.");return;}String data=body.getString("json");if(data.length()>MAX_BACKUP){respond(p,null,"백업이 너무 큽니다.");return;}new JSONObject(data);picker=p;exportData=data;Intent out=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,"kotoba-backup.json");startActivityForResult(out,EXPORT);break;
                case "importBackup": if(picker!=null){respond(p,null,"다른 파일 작업이 진행 중입니다.");return;}picker=p;startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json"),IMPORT);break;
                case "requestExit": new AlertDialog.Builder(this).setTitle("코토바를 닫을까요?").setMessage("저장한 학습 기록은 유지됩니다.").setPositiveButton("닫기",(d,w)->finish()).setNegativeButton("계속 학습",(d,w)->respond(p,new JSONObject(),null)).show();break;
                default: respond(p,null,"지원하지 않는 요청입니다.");
            }
        } catch(Exception e){respond(request,null,"요청을 처리하지 못했습니다.");}
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);if(requestCode!=EXPORT&&requestCode!=IMPORT)return;
        Pending p=picker;picker=null;String json=exportData;exportData=null;
        if(resultCode!=RESULT_OK||data==null||data.getData()==null){respond(p,null,"파일 선택이 취소되었습니다.");return;}Uri uri=data.getData();
        io.execute(()->{try{if(requestCode==EXPORT){try(OutputStream stream=getContentResolver().openOutputStream(uri,"wt")){if(stream==null)throw new IllegalStateException();stream.write(json.getBytes(StandardCharsets.UTF_8));}respond(p,new JSONObject(),null);}
            else{try(InputStream in=getContentResolver().openInputStream(uri);ByteArrayOutputStream out=new ByteArrayOutputStream()){if(in==null)throw new IllegalStateException();byte[] chunk=new byte[8192];int n;while((n=in.read(chunk))!=-1){if(out.size()+n>MAX_BACKUP)throw new IllegalArgumentException();out.write(chunk,0,n);}respond(p,new JSONObject().put("json",new String(out.toByteArray(),StandardCharsets.UTF_8)),null);}}}
            catch(Exception e){respond(p,null,"백업 파일을 읽거나 저장하지 못했습니다.");}});
    }
    @Override protected void onPause(){if(web!=null)web.onPause();super.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onDestroy(){destroyed=true;if(web!=null)web.destroy();io.shutdown();super.onDestroy();}
}
