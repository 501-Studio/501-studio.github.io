package com.studio501.kotoba;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.TimeZone;
import java.util.TreeSet;

/** Offline, inexact alarms. No remote push service, accounts or exact-alarm permission. */
final class ReviewReminders {
    private static final String CHANNEL="kotoba-review", PREFS="review-reminders";
    static final String ACTION="com.studio501.kotoba.REVIEW_DUE", EXTRA="kotoba-open-review";
    private static volatile boolean foreground=false;
    private ReviewReminders(){}
    static void foreground(boolean value){foreground=value;}
    private static SharedPreferences prefs(Context c){return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    static void channel(Context c){if(Build.VERSION.SDK_INT>=26){NotificationChannel ch=new NotificationChannel(CHANNEL,"복습 알림",NotificationManager.IMPORTANCE_DEFAULT);ch.setDescription("학습한 단어와 가나의 복습 시간이 되면 알려드립니다.");c.getSystemService(NotificationManager.class).createNotificationChannel(ch);}}
    static boolean granted(Context c){return (Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(c,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)&&NotificationManagerCompat.from(c).areNotificationsEnabled();}
    static void requested(Context c){prefs(c).edit().putBoolean("permissionRequested",true).apply();}
    static JSONObject status(Context c){JSONObject result=new JSONObject();try{return result.put("granted",granted(c)).put("permissionRequested",prefs(c).getBoolean("permissionRequested",false)).put("enabled",prefs(c).getBoolean("enabled",true)).put("scheduledAt",prefs(c).getLong("scheduledAt",0));}catch(Exception ignored){return result;}}
    static JSONObject sync(Context c,JSONObject body){boolean enabled=body.optBoolean("enabled",true);JSONArray input=body.optJSONArray("dueTimes"),clean=new JSONArray();TreeSet<Long> times=new TreeSet<>();if(input!=null)for(int i=0;i<Math.min(input.length(),30000);i++){long t=input.optLong(i,0);if(t>0&&t<32_503_680_000_000L)times.add(t);}for(long t:times)clean.put(t);prefs(c).edit().putBoolean("enabled",enabled).putString("dueTimes",clean.toString()).apply();schedule(c);return status(c);}
    private static PendingIntent alarm(Context c){return PendingIntent.getBroadcast(c,3701,new Intent(c,ReviewReminderReceiver.class).setAction(ACTION),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private static long earliest(Context c){try{JSONArray a=new JSONArray(prefs(c).getString("dueTimes","[]"));return a.length()>0?a.getLong(0):0;}catch(Exception ignored){return 0;}}
    static void schedule(Context c){channel(c);SharedPreferences p=prefs(c);AlarmManager am=c.getSystemService(AlarmManager.class);if(am==null)return;PendingIntent pending=alarm(c);am.cancel(pending);long first=earliest(c);if(!p.getBoolean("enabled",true)||!granted(c)||first<=0){p.edit().putLong("scheduledAt",0).apply();NotificationManagerCompat.from(c).cancel(3701);return;}
        long now=System.currentTimeMillis(),at=ReminderPolicy.next(now,first,p.getLong("lastSent",0),p.getString("countDay",""),p.getInt("count",0),TimeZone.getDefault());
        scheduleAt(c,am,pending,at);
    }
    private static void scheduleAt(Context c,AlarmManager am,PendingIntent pending,long at){try{am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);prefs(c).edit().putLong("scheduledAt",at).apply();}catch(SecurityException e){prefs(c).edit().putLong("scheduledAt",0).apply();}}
    @android.annotation.SuppressLint("MissingPermission") // granted() rechecks runtime permission; notify also catches revocation.
    static void receive(Context c){long now=System.currentTimeMillis();SharedPreferences p=prefs(c);long first=earliest(c);if(!p.getBoolean("enabled",true)||!granted(c)||first<=0){schedule(c);return;}
        if(foreground){AlarmManager am=c.getSystemService(AlarmManager.class);if(am!=null)scheduleAt(c,am,alarm(c),now+15*ReminderPolicy.MINUTE);return;}
        if(first>now||!ReminderPolicy.canSend(now,p.getLong("lastSent",0),p.getString("countDay",""),p.getInt("count",0),TimeZone.getDefault())){schedule(c);return;}
        Intent i=new Intent(c,MainActivity.class).putExtra(EXTRA,true).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open=PendingIntent.getActivity(c,3702,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        channel(c);
        NotificationCompat.Builder n=new NotificationCompat.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_review_notification).setContentTitle("다시 꺼내 볼 기억이 있어요").setContentText("짧게 복습하고, 내 단어로 만들어 보세요.").setContentIntent(open).setAutoCancel(true).setOnlyAlertOnce(true).setCategory(NotificationCompat.CATEGORY_REMINDER).setPriority(NotificationCompat.PRIORITY_DEFAULT);
        try{NotificationManagerCompat.from(c).notify(3701,n.build());String day=ReminderPolicy.day(now,TimeZone.getDefault());int count=day.equals(p.getString("countDay",""))?p.getInt("count",0):0;p.edit().putLong("lastSent",now).putString("countDay",day).putInt("count",count+1).apply();}catch(SecurityException ignored){/* Permission may be revoked between status and posting. */}
        schedule(c);
    }
}
