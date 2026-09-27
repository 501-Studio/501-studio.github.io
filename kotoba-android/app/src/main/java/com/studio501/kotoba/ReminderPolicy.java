package com.studio501.kotoba;

import java.util.Calendar;
import java.util.TimeZone;

/** Pure scheduling policy; all milliseconds refer to wall-clock time in the user's timezone. */
final class ReminderPolicy {
    static final long MINUTE=60_000L, HOUR=60*MINUTE;
    static final int OPEN_HOUR=9, CLOSE_HOUR=22, DAILY_LIMIT=2;
    private ReminderPolicy(){}
    static String day(long at,TimeZone zone){Calendar c=Calendar.getInstance(zone);c.setTimeInMillis(at);return c.get(Calendar.YEAR)+"-"+c.get(Calendar.MONTH)+"-"+c.get(Calendar.DAY_OF_MONTH);}
    static long next(long now,long earliestDue,long lastSent,String countDay,int count,TimeZone zone){
        if(earliestDue<=0)return 0;
        long t=Math.max(now+5*MINUTE,earliestDue);
        if(lastSent>0)t=Math.max(t,lastSent+4*HOUR);
        Calendar c=Calendar.getInstance(zone);c.setTimeInMillis(t);
        if(count>=DAILY_LIMIT&&day(t,zone).equals(countDay)){c.add(Calendar.DAY_OF_MONTH,1);atOpening(c);t=c.getTimeInMillis();}
        c.setTimeInMillis(t);
        if(c.get(Calendar.HOUR_OF_DAY)<OPEN_HOUR)atOpening(c);
        else if(c.get(Calendar.HOUR_OF_DAY)>=CLOSE_HOUR){c.add(Calendar.DAY_OF_MONTH,1);atOpening(c);}
        return c.getTimeInMillis();
    }
    static boolean canSend(long now,long lastSent,String countDay,int count,TimeZone zone){Calendar c=Calendar.getInstance(zone);c.setTimeInMillis(now);int h=c.get(Calendar.HOUR_OF_DAY);return h>=OPEN_HOUR&&h<CLOSE_HOUR&&(lastSent<=0||now-lastSent>=4*HOUR)&&(!day(now,zone).equals(countDay)||count<DAILY_LIMIT);}
    private static void atOpening(Calendar c){c.set(Calendar.HOUR_OF_DAY,OPEN_HOUR);c.set(Calendar.MINUTE,0);c.set(Calendar.SECOND,0);c.set(Calendar.MILLISECOND,0);}
}
