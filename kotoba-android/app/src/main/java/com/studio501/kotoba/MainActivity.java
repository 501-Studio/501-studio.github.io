package com.studio501.kotoba;

import android.annotation.SuppressLint;
import android.Manifest;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
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
import android.widget.LinearLayout;
import android.view.Gravity;
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

/** APK-local learning, stroke and pronunciation assets. Native bridge handles backups, notifications, installed speech and commerce. */
public final class MainActivity extends ComponentActivity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START = ORIGIN + "/assets/www/index.html";
    private static final int EXPORT = 201, IMPORT = 202, MAX_BACKUP = 30_000_000;
    private WebView web;
    private JapaneseSpeech speech;
    private boolean refreshSpeech=false;
    private Pending notificationPermission;
    private static final int NOTIFICATIONS=203;
    private boolean destroyed;
    private PlayCommerce commerce;
    private PlayAds ads;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private Pending picker;
    private String exportData;
    private static final class Pending {
        final String id; final JavaScriptReplyProxy reply;
        Pending(String id, JavaScriptReplyProxy reply) { this.id=id; this.reply=reply; }
    }
    @SuppressLint("RequiresFeature")
    private void respond(Pending request, Object data, String error) {
        if (request==null || destroyed) return;
        runOnUiThread(() -> { if(destroyed)return; try {
            JSONObject response=new JSONObject().put("id",request.id);
            if(error!=null) response.put("error",error); else response.put("result",data==null?new JSONObject():data);
            request.reply.postMessage(response.toString());
        } catch (Exception ignored) { /* A closed web document has no reply target. */ } });
    }
    @SuppressLint({"SetJavaScriptEnabled","RequiresFeature"})
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web=new WebView(this); web.setBackgroundColor(Color.rgb(245,246,249));
        // Inset the parent, not the WebView itself: CSS fixed buttons then stay above navigation.
        WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
        FrameLayout frame=new FrameLayout(this);frame.setBackgroundColor(Color.rgb(245,246,249));
        LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);
        LinearLayout adSlot=new LinearLayout(this);adSlot.setOrientation(LinearLayout.VERTICAL);adSlot.setGravity(Gravity.CENTER);adSlot.setVisibility(View.GONE);
        int gap=(int)(8*getResources().getDisplayMetrics().density);adSlot.setPadding(gap,gap,gap,gap);
        body.addView(web,new LinearLayout.LayoutParams(-1,0,1));body.addView(adSlot,new LinearLayout.LayoutParams(-1,-2));
        frame.addView(body,new FrameLayout.LayoutParams(-1,-1));setContentView(frame);
        WindowCompat.getInsetsController(getWindow(),frame).setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(getWindow(),frame).setAppearanceLightNavigationBars(true);
        ViewCompat.setOnApplyWindowInsetsListener(frame,(v,insets)->{
            androidx.core.graphics.Insets i=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout()|WindowInsetsCompat.Type.ime());
            v.setPadding(i.left,i.top,i.right,i.bottom);return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(frame);
        WebSettings ws=web.getSettings();ws.setJavaScriptEnabled(true);ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);ws.setAllowContentAccess(false);ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // Listening prompts use installed local TTS. Foreground playlist owns background playback.
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
        commerce=new PlayCommerce(this,()->{if(ads!=null)ads.update();if(!destroyed)web.evaluateJavascript("window.dispatchEvent(new Event('kotoba-commerce-changed'))",null);});
        ads=new PlayAds(this,adSlot,()->commerce!=null&&commerce.adsAllowed());
        ReviewReminders.channel(this);
        ReviewReminders.schedule(this);
        String restored=saved!=null?saved.getString("kotoba-url",START):START;
        if(restored==null||!(restored.equals(START)||restored.matches(java.util.regex.Pattern.quote(START)+"#(home|lesson|kana|kana-practice|review|words|word-practice|course|profile|study-hub|exam|commute)")))restored=START;
        if(getIntent().getBooleanExtra(ReviewReminders.EXTRA,false)){restored=START+"#review";getIntent().removeExtra(ReviewReminders.EXTRA);}
        if(getIntent().getBooleanExtra("kotoba-playlist",false)){restored=START+"#commute";getIntent().removeExtra("kotoba-playlist");}
        web.loadUrl(restored);
    }
    private static WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream("Blocked resource".getBytes(StandardCharsets.UTF_8)));}
    private void handle(WebMessageCompat message,Pending base){
        Pending request=base;
        try { String raw=message.getData();if(raw==null||raw.length()>MAX_BACKUP+1000)return;JSONObject q=new JSONObject(raw);
            String id=q.getString("id"),type=q.getString("type");if(id.length()>100)return;Pending p=new Pending(id,base.reply);request=p;JSONObject body=q.optJSONObject("payload");if(body==null)body=new JSONObject();
            PlayCommerce.Reply reply=(data,error)->respond(p,data,error);
            switch(type){
                case "speechSpeak": PlaylistService.pauseForLesson();if(speech==null)speech=new JapaneseSpeech(this);speech.speak(body.optString("text",""),body.optDouble("rate",1),(data,error)->respond(p,data,error));break;
                case "playlistStart": if(speech!=null)speech.stop();PlaylistService.start(this,body);respond(p,new JSONObject().put("requested",true),null);break;
                case "playlistControl": PlaylistService.control(body.optString("action"));respond(p,PlaylistService.status(),null);break;
                case "playlistStatus": respond(p,PlaylistService.status(),null);break;
                case "speechStop": if(speech!=null)speech.stop();respond(p,new JSONObject(),null);break;
                case "speechSettings": try{refreshSpeech=true;startActivity(new Intent("com.android.settings.TTS_SETTINGS"));respond(p,new JSONObject(),null);}catch(Exception e){respond(p,null,"설정 앱에서 텍스트 음성 변환을 찾아 주세요.");}break;
                case "reviewSync": respond(p,ReviewReminders.sync(this,body),null);break;
                case "reviewStatus": respond(p,ReviewReminders.status(this),null);break;
                case "reviewPermission": {
                    if(notificationPermission!=null){respond(p,ReviewReminders.status(this),null);break;}
                    boolean asked=ReviewReminders.status(this).optBoolean("permissionRequested",false);
                    if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED&&!asked){notificationPermission=p;ReviewReminders.requested(this);requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATIONS);}
                    else {if(!ReviewReminders.granted(this)){try{Intent settings=Build.VERSION.SDK_INT>=26?new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()):new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName()));startActivity(settings);}catch(Exception ignored){}}ReviewReminders.requested(this);ReviewReminders.schedule(this);respond(p,ReviewReminders.status(this),null);}break;
                }
                case "commerceStatus": respond(p,commerce.status(),null);break;
                case "commerceProducts": commerce.getProducts(reply);break;
                case "commerceBuy": commerce.buy(body.optString("plan",""),reply);break;
                case "commerceRestore": commerce.restore(reply);break;
                case "commerceManage": commerce.manage(reply);break;
                case "commerceScreen": {
                    String screen=body.optString("screen",""),completion=body.optString("completionId","");
                    if(!java.util.Arrays.asList("home","words","course","profile","review","lesson","completed").contains(screen))screen="lesson";
                    if(completion.length()>100)completion="";
                    ads.screen(screen,completion);respond(p,new JSONObject(),null);break;
                }
                case "commerceBreak": ads.chapterBreak(()->respond(p,new JSONObject(),null));break;
                case "adPrivacyOptions": ads.privacy(reply);break;
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
    @Override public void onConfigurationChanged(Configuration configuration){super.onConfigurationChanged(configuration);if(web!=null){web.invalidate();ViewCompat.requestApplyInsets(web);}}
    @Override protected void onSaveInstanceState(Bundle out){if(web!=null&&web.getUrl()!=null)out.putString("kotoba-url",web.getUrl());super.onSaveInstanceState(out);}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(intent.getBooleanExtra("kotoba-playlist",false)&&web!=null){intent.removeExtra("kotoba-playlist");web.evaluateJavascript("location.hash='commute'",null);}if(intent.getBooleanExtra(ReviewReminders.EXTRA,false)&&web!=null){intent.removeExtra(ReviewReminders.EXTRA);web.evaluateJavascript("location.hash='review'",null);}}
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){super.onRequestPermissionsResult(requestCode,permissions,results);if(requestCode==NOTIFICATIONS){Pending p=notificationPermission;notificationPermission=null;ReviewReminders.schedule(this);respond(p,ReviewReminders.status(this),null);}}
    @Override protected void onPause(){ReviewReminders.foreground(false);if(speech!=null)speech.stop();if(web!=null){web.evaluateJavascript("window.dispatchEvent(new Event('kotoba-pause'))",null);web.onPause();}if(ads!=null)ads.pause();super.onPause();}
    @Override protected void onResume(){super.onResume();if(refreshSpeech&&speech!=null){speech.destroy();speech=new JapaneseSpeech(this);refreshSpeech=false;}ReviewReminders.foreground(true);ReviewReminders.schedule(this);if(web!=null)web.onResume();if(commerce!=null)commerce.resume();if(ads!=null)ads.resume();}
    @Override protected void onDestroy(){destroyed=true;if(speech!=null)speech.destroy();if(ads!=null)ads.destroy();if(commerce!=null)commerce.destroy();if(web!=null)web.destroy();io.shutdown();super.onDestroy();}
}
