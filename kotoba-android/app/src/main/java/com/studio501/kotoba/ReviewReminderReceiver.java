package com.studio501.kotoba;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class ReviewReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){if(ReviewReminders.ACTION.equals(intent.getAction()))ReviewReminders.receive(context);else ReviewReminders.schedule(context);}
}
