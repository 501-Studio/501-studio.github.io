package com.studio501.kotoba;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;
import com.android.billingclient.api.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/** Play is the catalog authority; server-verified, signed leases are the entitlement authority. */
public final class PlayCommerce implements PurchasesUpdatedListener {
 public interface Reply {void done(JSONObject data,String error);}
 private static final String SUB="kotoba_premium",LIFE="kotoba_lifetime";
 private final Activity activity;private final BillingClient billing;
 private final SharedPreferences prefs;private final ExecutorService io=Executors.newSingleThreadExecutor();
 private final Runnable onChanged;
 private final Map<String,Offer> offers=new HashMap<>();
 private final List<Reply> waitingProducts=new ArrayList<>();
 private boolean ready=false,connecting=false,loading=false,refreshing=false,destroyed=false,uncertain=true,pending=false;
 private Reply purchaseReply;
 private final List<Reply> restoreReplies=new ArrayList<>();
 private JSONObject lease=new JSONObject();
 private static final class Offer {
  final ProductDetails details;final String token,price,plan;
  Offer(ProductDetails d,String t,String p,String key){details=d;token=t;price=p;plan=key;}
 }
 public PlayCommerce(Activity a,Runnable changed){activity=a;onChanged=changed;prefs=a.getSharedPreferences("kotoba-purchases",Context.MODE_PRIVATE);
  if(!prefs.contains("installation"))prefs.edit().putString("installation",UUID.randomUUID().toString()).apply();
  readLease();
  billing=BillingClient.newBuilder(a).setListener(this)
   .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
   .enableAutoServiceReconnection().build();connect();
 }
 private boolean configured(){return BuildConfig.SELLING_ENABLED&&BuildConfig.VERIFICATION_URL.startsWith("https://")&&!BuildConfig.ENTITLEMENT_PUBLIC_KEY.isEmpty();}
 private void connect(){if(connecting||destroyed)return;connecting=true;
  billing.startConnection(new BillingClientStateListener(){
   @Override public void onBillingSetupFinished(BillingResult r){connecting=false;ready=r.getResponseCode()==BillingClient.BillingResponseCode.OK;
    if(ready){loadProducts();refresh(null);}else{finishProducts();flushRestore("Google Play에 연결하지 못했어요.");onChanged.run();}}
   @Override public void onBillingServiceDisconnected(){ready=false;connecting=false;onChanged.run();}
  });
 }
 public void resume(){if(destroyed)return;if(ready)refresh(null);else connect();}
 public JSONObject status(){JSONObject out=new JSONObject();try{out.put("premium",premium());out.put("kind",premium()?lease.optString("kind"):JSONObject.NULL);out.put("pending",pending);out.put("verificationPending",uncertain);out.put("available",configured()&&ready);out.put("expiresAt",lease.optLong("exp")*1000L);}catch(Exception ignored){}return out;}
 public boolean premium(){return validLease(lease);}
 public boolean adsAllowed(){return !premium()&&!pending&&!uncertain;}
 public void getProducts(Reply reply){if(destroyed)return;
  waitingProducts.add(reply);if(!ready){connect();if(!connecting)finishProducts();return;}loadProducts();
 }
 private void loadProducts(){if(loading||!ready||destroyed)return;loading=true;offers.clear();final int[] remaining={2};
  for(String type:new String[]{BillingClient.ProductType.SUBS,BillingClient.ProductType.INAPP}){
   String id=type.equals(BillingClient.ProductType.SUBS)?SUB:LIFE;
   QueryProductDetailsParams q=QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(type).build())).build();
   billing.queryProductDetailsAsync(q,(result,list)->{if(destroyed)return;
    if(result.getResponseCode()==BillingClient.BillingResponseCode.OK)for(ProductDetails d:list.getProductDetailsList()){
     if(SUB.equals(d.getProductId())&&d.getSubscriptionOfferDetails()!=null){for(ProductDetails.SubscriptionOfferDetails o:d.getSubscriptionOfferDetails()){
      String plan=o.getBasePlanId();if(!Arrays.asList("monthly","annual").contains(plan)||o.getOfferId()!=null)continue;
      List<ProductDetails.PricingPhase> phases=o.getPricingPhases().getPricingPhaseList();if(phases.isEmpty())continue;
      ProductDetails.PricingPhase phase=phases.get(phases.size()-1);
      if(!(plan.equals("monthly")?"P1M":"P1Y").equals(phase.getBillingPeriod()))continue;
      offers.put(plan,new Offer(d,o.getOfferToken(),phase.getFormattedPrice(),plan));
     }}else if(LIFE.equals(d.getProductId())){
      List<ProductDetails.OneTimePurchaseOfferDetails> one=d.getOneTimePurchaseOfferDetailsList();
      if(one!=null&&!one.isEmpty()){ProductDetails.OneTimePurchaseOfferDetails o=one.get(0);offers.put("lifetime",new Offer(d,o.getOfferToken(),o.getFormattedPrice(),"lifetime"));}
     }
    }
    if(--remaining[0]==0){loading=false;finishProducts();}
   });
  }
 }
 private void finishProducts(){JSONObject result=new JSONObject();JSONArray items=new JSONArray();try{for(Offer o:offers.values())items.put(new JSONObject().put("plan",o.plan).put("productId",o.details.getProductId()).put("price",o.price).put("available",configured()&&ready));result.put("items",items);}catch(Exception ignored){}
  for(Reply p:new ArrayList<>(waitingProducts))p.done(result,null);waitingProducts.clear();
 }
 public void buy(String plan,Reply reply){
  if(!configured()){reply.done(null,"구매 기능을 준비 중이에요. 현재 결제되지 않습니다.");return;}
  if(premium()||pending||purchaseReply!=null){reply.done(null,"이미 이용 중이거나 확인 중인 구매가 있어요. 구독 관리에서 확인해 주세요.");return;}
  Offer o=offers.get(plan);if(!ready||o==null){reply.done(null,"상품 정보를 다시 불러와 주세요.");loadProducts();return;}
  purchaseReply=reply;
  BillingFlowParams.ProductDetailsParams item=BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(o.details).setOfferToken(o.token).build();
  BillingResult result=billing.launchBillingFlow(activity,BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(item)).build());
  if(result.getResponseCode()!=BillingClient.BillingResponseCode.OK){purchaseReply=null;reply.done(null,"Google Play 구매 화면을 열지 못했어요.");}
 }
 @Override public void onPurchasesUpdated(BillingResult r,List<Purchase> purchases){
  if(destroyed)return;
  if(r.getResponseCode()==BillingClient.BillingResponseCode.USER_CANCELED){finishPurchase("구매를 취소했어요.");return;}
  if(r.getResponseCode()==BillingClient.BillingResponseCode.OK){refresh(purchaseReply);purchaseReply=null;}
  else if(r.getResponseCode()==BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED){refresh(purchaseReply);purchaseReply=null;}
  else finishPurchase("결제를 완료하지 못했어요. Google Play에서 다시 확인해 주세요.");
 }
 private void finishPurchase(String error){Reply p=purchaseReply;purchaseReply=null;if(p!=null)p.done(status(),error);}
 public void restore(Reply p){if(!configured()){p.done(null,"구매 복원 연결을 준비 중이에요. 결제 내역은 변경되지 않습니다.");return;}refresh(p);}
 private void refresh(Reply callback){
  if(callback!=null)restoreReplies.add(callback);
  if(refreshing||destroyed)return;
  if(!ready){connect();return;}
  refreshing=true;final int[] remaining={2};final boolean[] success={true};List<Purchase> all=new ArrayList<>();
  for(String type:new String[]{BillingClient.ProductType.SUBS,BillingClient.ProductType.INAPP}){
   billing.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(type).build(),(result,purchases)->{
    if(destroyed)return;
    if(result.getResponseCode()==BillingClient.BillingResponseCode.OK)all.addAll(purchases);else success[0]=false;
    if(--remaining[0]!=0)return;
    if(!success[0]){refreshing=false;flushRestore("구매 내역에 연결하지 못했어요. 저장된 이용권은 유지됩니다.");onChanged.run();return;}
    List<Purchase> valid=new ArrayList<>();pending=false;
    for(Purchase p:all){if(Collections.disjoint(p.getProducts(),Arrays.asList(SUB,LIFE)))continue;
     if(p.getPurchaseState()==Purchase.PurchaseState.PENDING)pending=true;
     if(p.getPurchaseState()==Purchase.PurchaseState.PURCHASED)valid.add(p);
    }
    if(valid.isEmpty()){
     prefs.edit().remove("lease").apply();lease=new JSONObject();uncertain=false;refreshing=false;flushRestore(null);onChanged.run();return;
    }
    uncertain=true;onChanged.run();
    if(!configured()){refreshing=false;flushRestore("구매 확인 연결을 준비 중이에요. 구매 내역은 유지됩니다.");return;}
    verify(valid);
   });
  }
 }
 private void verify(List<Purchase> purchases){io.execute(()->{
  JSONObject best=null;String signed=null;boolean confirmedInactive=false;String error=null;
  for(Purchase purchase:purchases){try{
   String product=purchase.getProducts().contains(LIFE)?LIFE:SUB;
   JSONObject request=new JSONObject().put("packageName",activity.getPackageName()).put("productId",product).put("purchaseToken",purchase.getPurchaseToken()).put("installationId",prefs.getString("installation",""));
   JSONObject response=post(request);String raw=response.optString("lease","");JSONObject decoded=decodeLease(raw);
   if(decoded.optBoolean("active")){if(best==null||"lifetime".equals(decoded.optString("kind"))){best=decoded;signed=raw;}}
   else confirmedInactive=true;
  }catch(Exception failure){error="구매 확인을 완료하지 못했어요. 연결 후 구매 복원을 눌러 주세요.";}}
  final JSONObject selected=best;final String jwt=signed,problem=error;final boolean inactive=confirmedInactive;
  activity.runOnUiThread(()->{if(destroyed)return;refreshing=false;
   if(selected!=null){lease=selected;prefs.edit().putString("lease",jwt).apply();uncertain=false;flushRestore(null);}
   else if(problem==null&&inactive){lease=new JSONObject();prefs.edit().remove("lease").apply();uncertain=false;flushRestore(null);}
   else flushRestore(problem);
   onChanged.run();
  });
 });}
 private JSONObject post(JSONObject body)throws Exception{
  URI uri=URI.create(BuildConfig.VERIFICATION_URL);if(!"https".equals(uri.getScheme())||uri.getHost()==null)throw new IllegalArgumentException();
  HttpURLConnection c=(HttpURLConnection)new URL(uri.toString()).openConnection();c.setRequestMethod("POST");c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(15000);c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");
  byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(bytes.length);
  try{try(java.io.OutputStream out=c.getOutputStream()){out.write(bytes);}if(c.getResponseCode()!=200)throw new IllegalStateException();
   try(java.io.InputStream in=c.getInputStream();java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){
    byte[] buf=new byte[4096];int n;while((n=in.read(buf))!=-1){if(out.size()+n>65536)throw new IllegalStateException();out.write(buf,0,n);}return new JSONObject(out.toString("UTF-8"));}
  }finally{c.disconnect();}
 }
 private JSONObject decodeLease(String jwt)throws Exception{
  String[] parts=jwt.split("\\.");if(parts.length!=3)throw new IllegalArgumentException();
  JSONObject header=new JSONObject(new String(Base64.decode(parts[0],Base64.URL_SAFE|Base64.NO_WRAP),StandardCharsets.UTF_8));
  if(!"RS256".equals(header.optString("alg")))throw new IllegalArgumentException();
  String key=BuildConfig.ENTITLEMENT_PUBLIC_KEY.replace("-----BEGIN PUBLIC KEY-----","").replace("-----END PUBLIC KEY-----","").replaceAll("\\s","");
  Signature verifier=Signature.getInstance("SHA256withRSA");verifier.initVerify(KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.decode(key,Base64.DEFAULT))));
  verifier.update((parts[0]+"."+parts[1]).getBytes(StandardCharsets.US_ASCII));if(!verifier.verify(Base64.decode(parts[2],Base64.URL_SAFE|Base64.NO_WRAP)))throw new IllegalArgumentException();
  JSONObject payload=new JSONObject(new String(Base64.decode(parts[1],Base64.URL_SAFE|Base64.NO_WRAP),StandardCharsets.UTF_8));
  if(!"studio501.kotoba".equals(payload.optString("iss"))||!activity.getPackageName().equals(payload.optString("aud"))||!prefs.getString("installation","").equals(payload.optString("sub")))throw new IllegalArgumentException();
  long now=System.currentTimeMillis()/1000;if(payload.optLong("exp")<=now||payload.optLong("iat")>now+300)throw new IllegalArgumentException();
  return payload;
 }
 private boolean validLease(JSONObject value){return value.optBoolean("active")&&value.optLong("exp")>System.currentTimeMillis()/1000&&Arrays.asList("subscription","lifetime").contains(value.optString("kind"));}
 private void readLease(){try{lease=decodeLease(prefs.getString("lease",""));}catch(Exception ignored){lease=new JSONObject();}}
 private void flushRestore(String error){for(Reply r:new ArrayList<>(restoreReplies))r.done(status(),error);restoreReplies.clear();}
 public void manage(Reply reply){try{activity.startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/account/subscriptions?package="+activity.getPackageName())));reply.done(new JSONObject(),null);}catch(Exception e){reply.done(null,"Google Play 구독 관리 화면을 열지 못했어요.");}}
 public void destroy(){destroyed=true;billing.endConnection();io.shutdownNow();waitingProducts.clear();restoreReplies.clear();purchaseReply=null;}
}
