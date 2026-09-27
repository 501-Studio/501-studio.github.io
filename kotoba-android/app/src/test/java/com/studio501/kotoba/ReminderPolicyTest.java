package com.studio501.kotoba;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Calendar;
import java.util.TimeZone;
public class ReminderPolicyTest {
 final TimeZone zone=TimeZone.getTimeZone("Asia/Seoul");
 long at(int day,int hour,int minute){Calendar c=Calendar.getInstance(zone);c.clear();c.set(2026,8,day,hour,minute);return c.getTimeInMillis();}
 @Test public void noDueMeansNoAlarm(){assertEquals(0,ReminderPolicy.next(at(27,12,0),0,0,"",0,zone));}
 @Test public void overdueWaitsAtLeastFiveMinutes(){long now=at(27,12,0);assertEquals(now+5*ReminderPolicy.MINUTE,ReminderPolicy.next(now,now-1000,0,"",0,zone));}
 @Test public void futureDueIsNotEarly(){long now=at(27,12,0);assertEquals(at(27,14,0),ReminderPolicy.next(now,at(27,14,0),0,"",0,zone));}
 @Test public void morningQuietHours(){long now=at(27,6,0);assertEquals(at(27,9,0),ReminderPolicy.next(now,now,0,"",0,zone));}
 @Test public void nightQuietHours(){long now=at(27,22,0);assertEquals(at(28,9,0),ReminderPolicy.next(now,now,0,"",0,zone));}
 @Test public void justBeforeQuietBoundary(){long now=at(27,21,58);assertEquals(at(28,9,0),ReminderPolicy.next(now,now,0,"",0,zone));}
 @Test public void enforcesFourHourGap(){long now=at(27,14,0);assertEquals(at(27,17,0),ReminderPolicy.next(now,now,at(27,13,0),ReminderPolicy.day(now,zone),1,zone));}
 @Test public void dailyCapMovesToNextMorning(){long now=at(27,18,0);assertEquals(at(28,9,0),ReminderPolicy.next(now,now,at(27,13,0),ReminderPolicy.day(now,zone),2,zone));}
 @Test public void oldDayCountDoesNotBlock(){long now=at(28,12,0);assertEquals(now+5*ReminderPolicy.MINUTE,ReminderPolicy.next(now,now,at(27,13,0),ReminderPolicy.day(at(27,12,0),zone),2,zone));}
 @Test public void delayedAlarmsAreRechecked(){assertFalse(ReminderPolicy.canSend(at(27,23,0),0,"",0,zone));assertFalse(ReminderPolicy.canSend(at(27,8,59),0,"",0,zone));assertTrue(ReminderPolicy.canSend(at(27,9,0),0,"",0,zone));}
 @Test public void deliveredAlarmsCannotExceedCapOrGap(){long now=at(27,15,0);assertFalse(ReminderPolicy.canSend(now,at(27,14,0),ReminderPolicy.day(now,zone),1,zone));assertFalse(ReminderPolicy.canSend(now,at(27,10,0),ReminderPolicy.day(now,zone),2,zone));assertTrue(ReminderPolicy.canSend(now,at(27,10,0),ReminderPolicy.day(now,zone),1,zone));}
 @Test public void timezoneAffectsQuietWindow(){TimeZone tokyo=TimeZone.getTimeZone("Asia/Tokyo"),newyork=TimeZone.getTimeZone("America/New_York");long t=at(27,10,0);assertTrue(ReminderPolicy.canSend(t,0,"",0,tokyo));assertTrue(ReminderPolicy.canSend(t,0,"",0,newyork));assertNotEquals(ReminderPolicy.day(t,tokyo),ReminderPolicy.day(t,newyork));}
}
