from pathlib import Path
p=Path('kotoba-android/app/src/main/java/com/studio501/kotoba/AdsCoordinator.java')
s=p.read_text(encoding='utf-8')
old='import com.google.android.gms.ads.mediation.admob.AdMobAdapter;'
new='import com.google.ads.mediation.admob.AdMobAdapter;'
assert old in s or new in s
p.write_text(s.replace(old,new),encoding='utf-8')
print('Aligned AdMobAdapter import with play-services-ads 25.5.0')
