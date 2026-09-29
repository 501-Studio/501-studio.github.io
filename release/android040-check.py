"""Run the real Android tests with bounded, isolated emulator cleanup.
The previous action passed all tests but hung waiting for its emulator to exit.
Only this script's own emulator process group is terminated; test failures propagate.
"""
from pathlib import Path
import json,os,shutil,signal,subprocess,time,xml.etree.ElementTree as ET

QA=Path(os.environ.get('KOTOBA_EVIDENCE_DIR','/tmp/kotoba040-qa'))
QA.mkdir(parents=True,exist_ok=True)
SDK=Path(os.environ['ANDROID_HOME'])
ADB=str(SDK/'platform-tools/adb')
ENV=dict(os.environ,ANDROID_AVD_HOME='/tmp/kotoba040-avd')
Path(ENV['ANDROID_AVD_HOME']).mkdir(parents=True,exist_ok=True)
serial='emulator-5554'
report={'physicalVoiceAudibilityVerified':False,'testsCompleted':False,'cleanupEscalated':False}

def run(args,timeout=60,check=True,**kw):
    return subprocess.run(args,env=ENV,timeout=timeout,check=check,**kw)

def adb(*args,timeout=20,check=True):
    return run([ADB,'-s',serial,*args],timeout=timeout,check=check,capture_output=True,text=True,encoding='utf-8',errors='replace')

started=time.monotonic();emulator=None;emulator_log=None
try:
    manager=shutil.which('sdkmanager');avdmanager=shutil.which('avdmanager')
    assert manager and avdmanager,'Android command-line tools are missing'
    with (QA/'android-sdk.txt').open('w') as log:
        run([manager,'--install','emulator','system-images;android-35;google_apis;x86_64','platforms;android-35'],timeout=300,input='y\n'*200,text=True,stdout=log,stderr=subprocess.STDOUT)
        run([avdmanager,'create','avd','--force','-n','kotoba040-test','--package','system-images;android-35;google_apis;x86_64','--device','pixel_6'],timeout=60,input='no\n',text=True,stdout=log,stderr=subprocess.STDOUT)
    run([ADB,'start-server'],timeout=30)
    emulator_log=(QA/'emulator.txt').open('w')
    emulator=subprocess.Popen([str(SDK/'emulator/emulator'),'-avd','kotoba040-test','-port','5554','-no-window','-no-snapshot','-gpu','swiftshader_indirect','-noaudio','-no-boot-anim','-camera-back','none','-timezone','Asia/Seoul','-cores','2','-memory','2048'],env=ENV,start_new_session=True,stdout=emulator_log,stderr=subprocess.STDOUT)
    deadline=time.monotonic()+360
    while time.monotonic()<deadline:
        assert emulator.poll() is None,'Emulator exited before boot; see emulator.txt'
        try:
            if adb('shell','getprop','sys.boot_completed',timeout=10,check=False).stdout.strip()=='1':break
        except subprocess.TimeoutExpired:pass
        time.sleep(2)
    else:raise TimeoutError('Android emulator did not finish booting within six minutes')
    report['bootSeconds']=round(time.monotonic()-started,1)
    adb('shell','input','keyevent','82')
    for setting in ['window_animation_scale','transition_animation_scale','animator_duration_scale']:
        adb('shell','settings','put','global',setting,'0.0')
    with (QA/'android-connected.txt').open('w') as log:
        result=run(['gradle','-p','kotoba-android','--no-daemon','connectedDebugAndroidTest'],timeout=480,check=False,stdout=log,stderr=subprocess.STDOUT)
    result.check_returncode()
    xml_files=list(Path('kotoba-android/app/build/outputs/androidTest-results/connected').rglob('TEST-*.xml'))
    assert xml_files,'Native test runner did not emit JUnit results'
    suites=[ET.parse(p).getroot() for p in xml_files]
    report.update({key:sum(int(s.get(key,'0')) for s in suites) for key in ['tests','failures','errors','skipped']})
    assert report['tests']>=3 and report['failures']==0 and report['errors']==0 and report['skipped']==0,report
    report['testsCompleted']=True
    with (QA/'android.png').open('wb') as image:
        run([ADB,'-s',serial,'exec-out','screencap','-p'],timeout=20,stdout=image)
except BaseException as exc:
    report['error']=str(exc)
    raise
finally:
    if emulator is not None:
        try:
            result=adb('logcat','-d','-t','2500',timeout=15,check=False)
            (QA/'android-logcat.txt').write_text(result.stdout)
        except Exception as exc:report['logcatError']=str(exc)
        try:adb('emu','kill',timeout=5,check=False)
        except Exception:pass
        try:
            emulator.wait(timeout=5)
        except subprocess.TimeoutExpired:
            report['cleanupEscalated']=True
        # Handle the lingering emulator group even if the launcher itself exited.
        try:os.killpg(emulator.pid,signal.SIGTERM)
        except ProcessLookupError:pass
        try:emulator.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:os.killpg(emulator.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            emulator.wait(timeout=5)
        try:os.killpg(emulator.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        report['emulatorExitCode']=emulator.returncode
    if emulator_log is not None:emulator_log.close()
    report['elapsedSeconds']=round(time.monotonic()-started,1)
    (QA/'android-run.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
