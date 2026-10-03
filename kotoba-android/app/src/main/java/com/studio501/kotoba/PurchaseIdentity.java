package com.studio501.kotoba;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.MutableContextWrapper;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.CancellationSignal;
import android.util.Base64;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Foreground-only account choice. Tokens never enter preferences, backups or logs. */
final class PurchaseIdentity {
 interface Result {void done(Session session,String error);}
 static final class Session {
  final String token;final long expiresAt;
  Session(String token,long expiresAt){this.token=token;this.expiresAt=expiresAt;}
  boolean usable(){return PurchaseProof.sessionUsable(expiresAt,System.currentTimeMillis()/1000);}
 }
 private final Activity activity;
 private CredentialManager manager;
 private final SharedPreferences agePrefs;
 private static final String AGE_KEY="google-purchase-age-eligible-v1";
 private AlertDialog explanation;
 private CancellationSignal cancellation;
 private MutableContextWrapper foregroundContext;
 private Result pending;
 private boolean destroyed;
 PurchaseIdentity(Activity activity){this.activity=activity;agePrefs=activity.getSharedPreferences("kotoba-purchase-age",Context.MODE_PRIVATE);}
 boolean eligible(){try{return PurchaseProof.canConnectGoogle(agePrefs.contains(AGE_KEY)?agePrefs.getBoolean(AGE_KEY,false):null);}catch(ClassCastException invalid){return false;}}
 void choose(Result callback){
  if(destroyed||activity.isFinishing()||activity.isDestroyed()){callback.done(null,"계정 연결 화면을 다시 열어 주세요.");return;}
  if(pending!=null){callback.done(null,"계정 연결을 확인 중이에요.");return;}
  pending=callback;
  if(!agePrefs.contains(AGE_KEY))showAgePicker();else if(eligible())showPurpose();else showUnderAgeNotice();
 }
 private void showAgePicker(){
  if(destroyed)return;
  explanation=new AlertDialog.Builder(activity).setTitle("Google 계정 연결 연령 확인")
   .setItems(new String[]{"만 14세 이상","만 14세 미만","취소"},(dialog,which)->{
    explanation=null;
    if(which==2){finish(null,"연령 확인을 취소했어요. 무료 학습은 계속할 수 있어요.");return;}
    // Store only the local eligibility choice. No birthday or guardian information is collected.
    agePrefs.edit().putBoolean(AGE_KEY,which==0).apply();
    if(which==0)showPurpose();else showUnderAgeNotice();
   }).setOnCancelListener(dialog->finish(null,"연령 확인을 취소했어요. 무료 학습은 계속할 수 있어요.")).create();
  explanation.show();
 }
 private void showUnderAgeNotice(){
  if(destroyed)return;
  explanation=new AlertDialog.Builder(activity).setTitle("무료 학습을 계속할 수 있어요")
   .setMessage("만 14세 미만의 유료 이용권 계정 연결은 현재 지원하지 않아요. Google 계정에 연결하지 않고 무료 학습을 계속할 수 있습니다.")
   .setPositiveButton("무료 학습 계속",(dialog,which)->finish(null,"만 14세 미만은 현재 유료 계정 연결을 지원하지 않아요. 무료 학습은 계속할 수 있어요."))
   .setNeutralButton("연령 확인 변경",(dialog,which)->showAgePicker())
   .setOnCancelListener(dialog->finish(null,"계정 연결을 취소했어요. 무료 학습은 계속할 수 있어요.")).create();
  explanation.show();
 }
 private void showPurpose(){
  if(destroyed)return;
  explanation=new AlertDialog.Builder(activity).setTitle("구매 내역을 Google 계정에 연결")
   .setMessage("유료 이용권을 선택한 Google 계정에 연결합니다. 다른 기기에서도 구매할 때 연결한 계정을 선택하면 이용권을 복원할 수 있어요. Google Play 결제 계정과 같은 계정을 사용하면 기억하기 편리합니다. 취소해도 무료 학습은 계속할 수 있어요.")
   .setPositiveButton("Google 계정 선택",(dialog,which)->openChoice())
   .setNegativeButton("취소",(dialog,which)->finish(null,"계정 연결을 취소했어요. 무료 학습은 계속할 수 있어요."))
   .setNeutralButton("연령 확인 변경",(dialog,which)->showAgePicker())
   .setOnCancelListener(dialog->finish(null,"계정 연결을 취소했어요. 무료 학습은 계속할 수 있어요.")).create();
  explanation.show();
 }
 private void openChoice(){
  explanation=null;
  if(destroyed)return;
  if(!eligible()){finish(null,"연령 확인이 필요해요. 무료 학습은 계속할 수 있어요.");return;}
  try {
   if(manager==null)manager=CredentialManager.create(activity.getApplicationContext());
   GetSignInWithGoogleOption option=new GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_OAUTH_CLIENT_ID).build();
   GetCredentialRequest request=new GetCredentialRequest.Builder().addCredentialOption(option).build();
   cancellation=new CancellationSignal();foregroundContext=new MutableContextWrapper(activity);
   manager.getCredentialAsync(foregroundContext,request,cancellation,activity::runOnUiThread,new CredentialManagerCallback<GetCredentialResponse,GetCredentialException>(){
    @Override public void onResult(GetCredentialResponse response){
     if(destroyed)return;
     try {
      Credential credential=response.getCredential();
      if(!(credential instanceof CustomCredential)||!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType()))throw new IllegalArgumentException();
      String token=GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken();
      String[] parts=token.split("\\.");if(parts.length!=3)throw new IllegalArgumentException();
      JSONObject claims=new JSONObject(new String(Base64.decode(parts[1],Base64.URL_SAFE|Base64.NO_WRAP),StandardCharsets.UTF_8));
      // This is only an expiry/audience sanity check. /account verifies Google's signature and identity.
      if(!BuildConfig.GOOGLE_OAUTH_CLIENT_ID.equals(claims.optString("aud")))throw new IllegalArgumentException();
      Session session=new Session(token,claims.optLong("exp"));if(!session.usable())throw new IllegalArgumentException();
      finish(session,null);
     }catch(Exception invalid){finish(null,"Google 계정을 확인하지 못했어요. 계정 선택을 다시 시도해 주세요.");}
    }
    @Override public void onError(GetCredentialException error){if(!destroyed)finish(null,error instanceof GetCredentialCancellationException?"계정 연결을 취소했어요. 무료 학습은 계속할 수 있어요.":"Google 계정에 연결하지 못했어요. 연결 후 다시 시도해 주세요.");}
   });
  }catch(Exception unavailable){finish(null,"Google 계정 선택을 열지 못했어요. 연결 후 다시 시도해 주세요.");}
 }
 private void finish(Session session,String error){
  Result callback=pending;pending=null;cancellation=null;explanation=null;
  if(foregroundContext!=null){foregroundContext.setBaseContext(activity.getApplicationContext());foregroundContext=null;}
  if(callback!=null&&!destroyed)callback.done(session,error);
 }
 void destroy(){destroyed=true;pending=null;if(cancellation!=null)cancellation.cancel();cancellation=null;
  if(explanation!=null)explanation.dismiss();explanation=null;
  if(foregroundContext!=null)foregroundContext.setBaseContext(activity.getApplicationContext());foregroundContext=null;
 }
}
