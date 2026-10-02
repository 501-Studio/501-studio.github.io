package com.studio501.kotoba;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.SharedPreferences;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Disposable emulator account state; does not alter local learning records. */
@RunWith(AndroidJUnit4.class)
public final class DeletedAccountTest {
 private static Field field(Class<?> type,String name)throws Exception{Field f=type.getDeclaredField(name);f.setAccessible(true);return f;}
 @Test public void confirmedDeletionClearsPersistentAndInMemoryAccountCache(){
  assertTrue(PurchaseProof.isDeletedAccountResponse(410,"account_deleted"));
  assertFalse(PurchaseProof.isDeletedAccountResponse(503,"account_deleted"));
  assertFalse(PurchaseProof.isDeletedAccountResponse(401,"account_deleted"));
  assertFalse(PurchaseProof.isDeletedAccountResponse(410,"service_not_configured"));
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   scenario.onActivity(activity->{try{
    PlayCommerce commerce=(PlayCommerce)field(MainActivity.class,"commerce").get(activity);
    commerce.destroy();
    SharedPreferences prefs=activity.getSharedPreferences("kotoba-purchases",Context.MODE_PRIVATE);
    String installation=prefs.getString("installation","");
    prefs.edit().putString("account","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").putString("lease","test-only-cached-lease").putString("test-unrelated","preserved").commit();
    field(PlayCommerce.class,"lease").set(commerce,new JSONObject().put("active",true));
    field(PlayCommerce.class,"session").set(commerce,new PurchaseIdentity.Session("test-only-token",System.currentTimeMillis()/1000+600));
    long generation=field(PlayCommerce.class,"accountGeneration").getLong(commerce);
    Method clear=PlayCommerce.class.getDeclaredMethod("clearDeletedAccount");clear.setAccessible(true);clear.invoke(commerce);
    assertFalse(prefs.contains("account"));assertFalse(prefs.contains("lease"));
    assertEquals(installation,prefs.getString("installation",""));assertEquals("preserved",prefs.getString("test-unrelated",""));
    assertNull(field(PlayCommerce.class,"session").get(commerce));assertNull(field(PlayCommerce.class,"integrityProvider").get(commerce));
    assertEquals(0,((JSONObject)field(PlayCommerce.class,"lease").get(commerce)).length());
    assertEquals(generation+1,field(PlayCommerce.class,"accountGeneration").getLong(commerce));
    assertFalse(commerce.premium());prefs.edit().remove("test-unrelated").commit();
   }catch(Exception error){throw new AssertionError(error);}});
  }
 }
}
