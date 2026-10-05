#!/usr/bin/env python3
"""Capture actual isolated-emulator UI playback without an Actions artifact.

Run concurrently with NativeVoiceUiDemoTest. Only a matching, newly generated
nonce can start the capture handshake. No synthesized audio file is consumed.
The original recording and diagnostics remain on the disposable runner even
when the UI test or captured-audio gate fails.
"""

import argparse
import array
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
import uuid


READY_FILE = "files/voice-ui-demo-ready.json"
ACK_FILE = "files/voice-ui-demo-recording-started.txt"
END_FILE = "files/voice-ui-demo-recording-end.json"
MAX_MP4_BYTES = 4 * 1024 * 1024
CHUNK_BYTES = 6144
STOP_REQUESTED = False


class CaptureError(RuntimeError):
    pass


def request_stop(_signum, _frame):
    global STOP_REQUESTED
    STOP_REQUESTED = True


def emit(marker, value):
    print(marker + "=" + json.dumps(value, ensure_ascii=True, separators=(",", ":")), flush=True)


def valid_nonce(value):
    if not isinstance(value, str) or len(value) != 36:
        return False
    try:
        return str(uuid.UUID(value)) == value.lower()
    except ValueError:
        return False


def console_ok(result):
    lines = result.stdout.decode("utf-8", errors="replace").replace("\r", "").splitlines()
    return result.returncode == 0 and any(line.strip() == "OK" for line in lines) and not any(
        line.strip().startswith("KO") for line in lines
    )


def pcm_stats(data):
    """Measure decoded PCM only; timestamps are inspected separately."""
    samples = array.array("h")
    samples.frombytes(data[:len(data) // 2 * 2])
    if sys.byteorder != "little":
        samples.byteswap()
    count = len(samples)
    peak = max((abs(value) for value in samples), default=0)
    rms = math.sqrt(sum(value * value for value in samples) / count) if count else 0
    signal_count = sum(abs(value) >= 64 for value in samples)
    return {"present": True, "decodeSucceeded": True, "sampleCount": count,
            "sampleRateHz": 16000, "decodedSeconds": round(count / 16000, 6),
            "peakPcm16": peak, "rmsPcm16": round(rms, 3), "signalSampleCount": signal_count,
            "nonSilent": count > 0 and rms >= 20 and peak >= 128 and signal_count >= 1600}


def summarize_audio_timeline(value, sample_rate):
    """Compare actual packet clocks with decoder frame sample counts.

    A container packet duration can include a timestamp gap. It must not be
    treated as that many decoded audio samples or as verified silence.
    """
    combined = value.get("packets_and_frames")
    if isinstance(combined, list):
        packets = [item for item in combined if isinstance(item, dict) and item.get("type") == "packet"]
        frames = [item for item in combined if isinstance(item, dict) and item.get("type") == "frame"]
    else:
        packets, frames = value.get("packets", []), value.get("frames", [])
    if not isinstance(packets, list) or not isinstance(frames, list) or len(packets) + len(frames) > 30000:
        raise CaptureError("Audio packet/frame list exceeded the evidence bound or had an invalid shape.")

    def finite_number(item, keys):
        for key in keys:
            try:
                number = float(item[key])
            except (KeyError, TypeError, ValueError):
                continue
            if math.isfinite(number):
                return number
        return None

    packet_starts, packet_ends = [], []
    packet_bytes, packet_duration_sum = 0, 0.0
    for packet in packets:
        if not isinstance(packet, dict):
            continue
        try:
            packet_bytes += max(0, int(packet.get("size", 0)))
        except (TypeError, ValueError):
            pass
        start = finite_number(packet, ("pts_time", "dts_time"))
        duration = finite_number(packet, ("duration_time",))
        if duration is not None and duration >= 0:
            packet_duration_sum += duration
        if start is not None:
            packet_starts.append(start)
            packet_ends.append(start + max(0, duration or 0))

    frame_starts, frame_ends = [], []
    decoded_samples, decoded_duration, usable_sample_frames = 0, 0.0, 0
    gaps, first_gaps, overlaps = [], [], 0
    previous_end = None
    # Vorbis/WebM millisecond timestamps can differ by under one millisecond
    # from their decoded sample clock. Report gaps above 2 ms separately.
    gap_threshold = 0.002
    for index, frame in enumerate(frames):
        if not isinstance(frame, dict):
            continue
        try:
            count = int(frame.get("nb_samples", 0))
            rate = int(frame.get("sample_rate", sample_rate))
        except (TypeError, ValueError):
            continue
        if count <= 0 or rate <= 0:
            continue
        usable_sample_frames += 1
        decoded_samples += count
        duration = count / rate
        decoded_duration += duration
        start = finite_number(frame, ("pts_time", "best_effort_timestamp_time", "pkt_dts_time"))
        if start is None:
            continue
        end = start + duration
        frame_starts.append(start)
        frame_ends.append(end)
        if previous_end is not None:
            gap = start - previous_end
            if gap > gap_threshold:
                gaps.append(gap)
                if len(first_gaps) < 4:
                    first_gaps.append({"beforeFrameIndex": index, "startSeconds": round(start, 6),
                                       "gapSeconds": round(gap, 6)})
            elif gap < -gap_threshold:
                overlaps += 1
        previous_end = end
    if not packet_starts or not frame_starts or not usable_sample_frames:
        raise CaptureError("Audio inspection found no usable packet clock and decoded-frame sample evidence.")
    frame_span = max(frame_ends) - min(frame_starts)
    return {"present": True, "inspectionSucceeded": True, "streamSampleRateHz": sample_rate,
            "packetCount": len(packets), "timedPacketCount": len(packet_starts),
            "encodedPacketBytes": packet_bytes,
            "firstPacketTimestampSeconds": round(min(packet_starts), 6),
            "lastPacketEndSeconds": round(max(packet_ends), 6),
            "packetClockSpanSeconds": round(max(packet_ends) - min(packet_starts), 6),
            "packetDurationSumSeconds": round(packet_duration_sum, 6),
            "frameCount": len(frames), "sampleBearingFrameCount": usable_sample_frames,
            "timedSampleBearingFrameCount": len(frame_starts), "decodedFrameSampleCount": decoded_samples,
            "decodedFrameDurationSeconds": round(decoded_duration, 6),
            "firstFrameTimestampSeconds": round(min(frame_starts), 6),
            "lastFrameEndSeconds": round(max(frame_ends), 6),
            "frameClockSpanSeconds": round(frame_span, 6),
            "clockSpanMinusDecodedDurationSeconds": round(frame_span - decoded_duration, 6),
            "frameGapThresholdSeconds": gap_threshold, "frameGapCount": len(gaps),
            "frameGapAtLeast100msCount": sum(gap >= 0.1 for gap in gaps),
            "frameGapTotalSeconds": round(sum(gaps), 6),
            "frameGapMaxSeconds": round(max(gaps, default=0), 6),
            "frameOverlapCount": overlaps, "firstFrameGaps": first_gaps,
            "timestampGapsEstablishSilence": False}


class Capture:
    def __init__(self, args):
        self.args = args
        self.output = args.output_dir.resolve()
        self.output.mkdir(parents=True, exist_ok=True)
        observer = self.output / "observer-ready.json"
        if observer.is_file():
            observer.unlink()
        self.adb = [args.adb] + (["-s", args.serial] if args.serial else [])
        self.nonce = None
        self.host_started = False
        self.guest_process = None
        self.guest_log = None
        self.raw_path = None
        self.host_name = None
        self.guest_path = None
        self.started_at = None
        self.locations = []
        self.report = {
            "schemaVersion": 1,
            "status": "CAPTURE_NOT_STARTED",
            "recorder": None,
            "videoCapturePerformed": False,
            "recorderLiveVerifiedBeforeAck": False,
            "terminalMarkerReceived": False,
            "capturedAudioPresent": False,
            "capturedAudioNonSilent": False,
            "audioCaptureGatePassed": False,
            "mp4Verified": False,
            "videoCreated": False,
            "capturedAudioVerified": False,
            "videoExportVerified": False,
            "captureTimelineVerified": False,
            "videoExported": False,
            "syntheticAudioMuxPerformed": False,
            "physicalAudibilityVerified": False,
            "speechIdentityVerified": False,
            "cacheUploadPerformed": False,
            "artifactUploadPerformed": False,
            "commands": [],
            "diagnostics": [],
        }
        for name in ("GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_SHA"):
            value = os.environ.get(name, "")
            if re.fullmatch(r"[A-Za-z0-9-]{1,64}", value):
                self.report[name] = value

    def run(self, arguments, timeout=12, record=False, input_bytes=None):
        try:
            result = subprocess.run(arguments, input=input_bytes, capture_output=True, timeout=timeout)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise CaptureError(f"Command unavailable or timed out: {arguments[0]} ({type(error).__name__})") from error
        if record and len(self.report["commands"]) < 24:
            self.report["commands"].append({
                "argv": arguments,
                "exitCode": result.returncode,
                "stdout": result.stdout.decode("utf-8", errors="replace")[-2500:],
                "stderr": result.stderr.decode("utf-8", errors="replace")[-1500:],
            })
        return result

    def adb_run(self, arguments, **kwargs):
        return self.run(self.adb + arguments, **kwargs)

    def read_marker(self, name):
        try:
            result = self.adb_run(["exec-out", "run-as", self.args.package, "cat", name], timeout=5)
        except CaptureError:
            return None
        if result.returncode != 0 or len(result.stdout) > 8192:
            return None
        try:
            value = json.loads(result.stdout)
            return value if isinstance(value, dict) else None
        except (ValueError, UnicodeDecodeError):
            return None

    def discover(self):
        # The console's own failed-start response specifies this help grammar.
        # Neither "screenrecord help" nor "screenrecord start --help" is valid.
        help_result = self.adb_run(["emu", "help", "screenrecord"], record=True)
        start_help = self.adb_run(["emu", "help", "screenrecord", "start"], record=True)
        self.host_help = (help_result.stdout + help_result.stderr + start_help.stdout + start_help.stderr).decode(
            "utf-8", errors="replace"
        )
        help_file = self.output / "emulator-screenrecord-help.txt"
        help_file.write_text(self.host_help[:32768], encoding="utf-8")
        accepted_start_help = start_help.stdout.decode("utf-8", errors="replace") if console_ok(start_help) else ""
        accepted_help = help_result.stdout.decode("utf-8", errors="replace") if console_ok(help_result) else ""
        self.report["emulatorScreenrecordHelpInspected"] = True
        self.report["emulatorScreenrecordHelpAccepted"] = console_ok(help_result)
        self.report["emulatorScreenrecordStartHelpAccepted"] = console_ok(start_help)
        self.report["emulatorScreenrecordHelpFile"] = str(help_file)
        self.report["hostRecorderTimeLimitAdvertised"] = bool(re.search(r"(?<![\w-])--time-limit(?![\w-])", accepted_start_help))
        self.report["hostRecorderSizeAdvertised"] = bool(re.search(r"(?<![\w-])--size(?![\w-])", accepted_start_help))
        self.report["hostRecorderBitRateAdvertised"] = bool(re.search(r"(?<![\w-])--bit-rate(?![\w-])", accepted_start_help))
        self.report["hostRecorderFpsAdvertised"] = bool(re.search(r"(?<![\w-])--fps(?![\w-])", accepted_start_help))
        self.report["hostRecorderStatusAdvertised"] = bool(re.search(r"(?m)^\s*status\b", accepted_help))
        # Request a smaller capture only when this console accepts and advertises
        # all options. Actual source dimensions are independently checked below.
        self.report["hostCaptureSizeOverrideApplied"] = False
        avd = self.adb_run(["emu", "avd", "name"], record=True)
        avd_lines = avd.stdout.decode("utf-8", errors="replace").replace("\r", "").splitlines()
        avd_name = next((line.strip() for line in avd_lines if re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", line.strip()) and line.strip() != "OK"), None)
        roots = [Path.cwd(), self.output]
        avd_roots = [Path.home() / ".android" / "avd"]
        if os.environ.get("ANDROID_AVD_HOME"):
            avd_roots.append(Path(os.environ["ANDROID_AVD_HOME"]))
        for key in ("ANDROID_USER_HOME", "ANDROID_EMULATOR_HOME"):
            if os.environ.get(key):
                avd_roots.append(Path(os.environ[key]) / "avd")
        audio_flags = []
        # Inspect only emulator processes; never print their full command lines.
        if Path("/proc").exists():
            for entry in Path("/proc").iterdir():
                if not entry.name.isdigit():
                    continue
                try:
                    command = (entry / "cmdline").read_bytes().split(b"\0")
                    executable = Path(command[0].decode(errors="replace")).name
                    if executable == "emulator" or executable.startswith("qemu-system-"):
                        roots.append((entry / "cwd").resolve())
                        audio_flags.extend(arg.decode() for arg in command if arg in (b"-noaudio", b"-no-audio"))
                except (OSError, ValueError):
                    continue
        self.report["emulatorAudioDisabledByFlag"] = bool(audio_flags)
        for avd_root in avd_roots:
            directories = [avd_root / (avd_name + ".avd")] if avd_name else []
            try:
                directories.extend(avd_root.glob("*.avd"))
            except OSError:
                pass
            for directory in directories:
                roots.extend([directory, directory / "console_out"])
        self.locations = list(dict.fromkeys(root.resolve() for root in roots))
        self.report["ffmpegAvailable"] = shutil.which(self.args.ffmpeg) is not None
        self.report["ffprobeAvailable"] = shutil.which(self.args.ffprobe) is not None

    def validate_guest(self):
        serial = self.adb_run(["get-serialno"], timeout=5, record=True)
        serial_text = serial.stdout.decode(errors="replace").strip()
        if serial.returncode != 0 or not re.fullmatch(r"emulator-[0-9]+", serial_text):
            raise CaptureError("Capture requires an actual adb emulator serial, never a physical device.")
        kernel = self.adb_run(["shell", "getprop", "ro.kernel.qemu"], timeout=5, record=True)
        sdk = self.adb_run(["shell", "getprop", "ro.build.version.sdk"], timeout=5, record=True)
        if kernel.returncode != 0 or kernel.stdout.strip() != b"1" or sdk.returncode != 0 or sdk.stdout.strip() != b"36":
            raise CaptureError("Capture requires the disposable Android API 36 emulator guest.")
        self.report.update({"isolatedEmulatorVerified": True, "guestSerial": serial_text, "guestApi": 36})

    def await_ready(self, initial):
        initial_nonce = initial.get("nonce") if initial else None
        self.report["preexistingReadyMarkerIgnored"] = initial is not None
        observer = {"schemaVersion": 1, "phase": "WAITING_FOR_NEW_READY", "pid": os.getpid(),
                    "initialReadyPresent": initial is not None}
        (self.output / "observer-ready.json").write_text(json.dumps(observer) + "\n", encoding="utf-8")
        deadline = time.monotonic() + self.args.ready_timeout
        while time.monotonic() < deadline and not STOP_REQUESTED:
            marker = self.read_marker(READY_FILE)
            if marker and marker.get("schemaVersion") == 1 and marker.get("phase") == "READY_TO_RECORD":
                nonce = marker.get("nonce")
                if valid_nonce(nonce) and nonce != initial_nonce:
                    self.nonce = nonce
                    self.report["nonce"] = nonce
                    return
            time.sleep(0.25)
        raise CaptureError("No new valid READY_TO_RECORD nonce received before the bounded readiness deadline.")

    def find_host_file(self):
        for location in self.locations:
            candidate = location / self.host_name
            try:
                if candidate.is_file():
                    return candidate
            except OSError:
                continue
        return None

    def start_host(self):
        self.host_name = "voice-ui-demo-" + self.nonce + ".webm"
        arguments = ["emu", "screenrecord", "start"]
        if self.report["hostRecorderTimeLimitAdvertised"]:
            arguments.extend(["--time-limit", str(self.args.max_duration)])
        if all(self.report.get(key) is True for key in
               ("hostRecorderSizeAdvertised", "hostRecorderBitRateAdvertised", "hostRecorderFpsAdvertised")):
            arguments.extend(["--size", "432x960", "--bit-rate", "400000", "--fps", "15"])
            self.report["hostCaptureRequestedOptions"] = {"videoSize": [432, 960], "bitRateBitsPerSecond": 400000, "framesPerSecond": 15}
        arguments.append(self.host_name)
        result = self.adb_run(arguments, record=True)
        if not console_ok(result):
            self.report["diagnostics"].append("Host recorder did not confirm start with OK.")
            return False
        self.host_started = True
        self.started_at = time.monotonic()
        status_ok = None
        if self.report["hostRecorderStatusAdvertised"]:
            status = self.adb_run(["emu", "screenrecord", "status"], record=True)
            body = status.stdout.decode(errors="replace").lower()
            status_ok = console_ok(status) and bool(re.search(r"\b(recording|running|active)\b", body)) and not bool(
                re.search(r"\b(not|stopped|inactive)\b", body)
            )
        previous = None
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and not STOP_REQUESTED:
            candidate = self.find_host_file()
            if candidate:
                try:
                    size = candidate.stat().st_size
                    with candidate.open("rb") as source:
                        signature = source.read(4) == b"\x1a\x45\xdf\xa3"
                    if signature and previous is not None and size > previous > 0 and status_ok is not False:
                        self.raw_path = candidate
                        self.report["hostLiveEvidence"] = {
                            "startCommandAccepted": True,
                            "webmHeaderVerified": True,
                            "fileGrowthObserved": True,
                            "statusQueryVerified": status_ok,
                        }
                        self.report["recorder"] = "emulator-host-webm"
                        return True
                    previous = size
                except OSError:
                    pass
            time.sleep(0.4)
        self.report["diagnostics"].append("Host recorder live output could not be verified; no acknowledgement was sent for this attempt.")
        self.stop_host()
        if self.raw_path is None:
            self.raw_path = self.find_host_file()
        return False

    def stop_host(self):
        if not self.host_started:
            return
        try:
            result = self.adb_run(["emu", "screenrecord", "stop"], record=True)
            if not console_ok(result):
                self.adb_run(["emu", "screenrecord", "stop", self.host_name], record=True)
        except CaptureError as error:
            self.report["diagnostics"].append(str(error))
        finally:
            self.host_started = False

    def start_guest(self):
        self.guest_path = "/sdcard/voice-ui-demo-" + self.nonce + ".mp4"
        self.guest_log = (self.output / ("guest-recorder-" + self.nonce + ".log")).open("wb")
        command = self.adb + ["shell", "screenrecord", "--time-limit", str(self.args.max_duration),
                              "--size", "540x960", "--bit-rate", "400000", self.guest_path]
        try:
            self.guest_process = subprocess.Popen(command, stdout=self.guest_log, stderr=subprocess.STDOUT)
        except OSError as error:
            raise CaptureError("Fallback guest screenrecord could not be started.") from error
        self.started_at = time.monotonic()
        previous = None
        deadline = time.monotonic() + 9
        while time.monotonic() < deadline and not STOP_REQUESTED and self.guest_process.poll() is None:
            size_result = self.adb_run(["shell", "stat", "-c", "%s", self.guest_path], timeout=5)
            size_text = size_result.stdout.decode(errors="replace").strip()
            size = int(size_text) if size_result.returncode == 0 and size_text.isdigit() else 0
            if previous is not None and size > previous > 0:
                header = self.adb_run(["exec-out", "head", "-c", "16", self.guest_path], timeout=5)
                if header.returncode == 0 and header.stdout[4:8] == b"ftyp":
                    self.report["guestLiveEvidence"] = {
                        "adbChildRunning": self.guest_process.poll() is None,
                        "mp4HeaderVerified": True,
                        "fileGrowthObserved": True,
                    }
                    self.report["recorder"] = "adb-guest-screenrecord-silent"
                    self.report["diagnostics"].append("Guest screenrecord captures video only; captured audio is absent.")
                    return True
            previous = size
            time.sleep(0.4)
        raise CaptureError("Fallback guest recorder did not produce verified live MP4 output before acknowledgement.")

    def acknowledge(self):
        result = self.adb_run(["shell", "-T", "run-as", self.args.package, "tee", ACK_FILE],
                              input_bytes=self.nonce.encode("ascii"), timeout=5, record=True)
        verify = self.adb_run(["exec-out", "run-as", self.args.package, "cat", ACK_FILE], timeout=5)
        if result.returncode != 0 or verify.returncode != 0 or verify.stdout != self.nonce.encode("ascii"):
            raise CaptureError("Recorder nonce acknowledgement could not be written and read back exactly.")
        self.report["recorderLiveVerifiedBeforeAck"] = True
        self.report["videoCapturePerformed"] = True

    def await_end(self):
        deadline = self.started_at + self.args.max_duration
        next_host_check = time.monotonic()
        host_checks = []
        self.report["recorderLivenessLost"] = False
        while time.monotonic() < deadline and not STOP_REQUESTED:
            marker = self.read_marker(END_FILE)
            if marker and marker.get("phase") == "END_RECORDING" and marker.get("nonce") == self.nonce:
                self.report["terminalMarkerReceived"] = True
                self.report["recordingElapsedAtEndSeconds"] = round(time.monotonic() - self.started_at, 3)
                self.report["terminalMarker"] = {
                    key: marker[key] for key in ("phase", "nonce", "status", "reportFile")
                    if isinstance(marker.get(key), str) and len(marker[key]) <= 160
                }
                return
            if self.guest_process and self.guest_process.poll() is not None:
                self.report["recorderLivenessLost"] = True
                self.report["diagnostics"].append("Guest recorder exited before the UI terminal marker.")
                return
            if self.host_started and time.monotonic() >= next_host_check:
                next_host_check = time.monotonic() + 5
                observation = {"elapsedSeconds": round(time.monotonic() - self.started_at, 3)}
                candidate = self.find_host_file()
                try:
                    observation["recordedFileBytes"] = candidate.stat().st_size if candidate else 0
                except OSError:
                    observation["recordedFileBytes"] = 0
                if self.report["hostRecorderStatusAdvertised"]:
                    status = self.adb_run(["emu", "screenrecord", "status"], timeout=5)
                    body = status.stdout.decode(errors="replace").lower()
                    active = console_ok(status) and bool(re.search(r"\b(recording|running|active)\b", body)) and not bool(
                        re.search(r"\b(not|stopped|inactive)\b", body)
                    )
                    observation["statusActive"] = active
                    if not active:
                        self.report["recorderLivenessLost"] = True
                        self.report["diagnostics"].append("Host recorder status lost liveness before the matching UI terminal marker.")
                host_checks.append(observation)
                self.report["hostRecorderDuringUi"] = host_checks
                if self.report["recorderLivenessLost"]:
                    return
            time.sleep(0.25)
        self.report["diagnostics"].append("Recording duration deadline or interruption reached before the matching UI terminal marker.")

    def stop_guest(self):
        if not self.guest_process:
            return
        try:
            pids = self.adb_run(["shell", "pidof", "screenrecord"], timeout=5)
            for pid in pids.stdout.decode(errors="replace").split():
                if not pid.isdigit():
                    continue
                cmdline = self.adb_run(["exec-out", "cat", "/proc/" + pid + "/cmdline"], timeout=5)
                if self.guest_path.encode("ascii") in cmdline.stdout.split(b"\0"):
                    self.adb_run(["shell", "kill", "-2", pid], timeout=5, record=True)
            try:
                self.guest_process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                self.guest_process.terminate()
                self.guest_process.wait(timeout=5)
                self.report["diagnostics"].append("ADB recorder transport needed termination; MP4 validity must be checked independently.")
        except (CaptureError, subprocess.TimeoutExpired) as error:
            self.report["diagnostics"].append(str(error))
        finally:
            if self.guest_log:
                self.guest_log.close()
        target = self.output / ("raw-guest-" + self.nonce + ".mp4")
        try:
            result = self.adb_run(["pull", self.guest_path, str(target)], timeout=15, record=True)
            if result.returncode == 0 and target.is_file() and target.stat().st_size > 0:
                self.raw_path = target
        except CaptureError as error:
            self.report["diagnostics"].append(str(error))

    def retain_source(self):
        if not self.raw_path or not self.raw_path.is_file() or self.raw_path.stat().st_size == 0:
            raise CaptureError("No nonempty recording file was discovered from either actual recorder.")
        target = self.output / ("raw-capture-" + self.nonce + self.raw_path.suffix)
        if self.raw_path.resolve() != target.resolve():
            # Stop was already requested. Wait for bounded final container writes.
            previous = -1
            for _ in range(10):
                size = self.raw_path.stat().st_size
                if size == previous:
                    break
                previous = size
                time.sleep(0.3)
            shutil.copyfile(self.raw_path, target)
        self.raw_path = target
        self.report["rawRecordingFile"] = str(target)
        self.report["rawRecordingBytes"] = target.stat().st_size

    def probe(self, path):
        result = self.run([self.args.ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)], timeout=20, record=True)
        if result.returncode != 0 or len(result.stdout) > 128 * 1024:
            raise CaptureError("ffprobe could not validate the actual recorded container.")
        try:
            value = json.loads(result.stdout)
        except ValueError as error:
            raise CaptureError("ffprobe returned invalid JSON.") from error
        streams = value.get("streams", [])
        if not isinstance(streams, list) or not any(stream.get("codec_type") == "video" for stream in streams):
            raise CaptureError("The actual recording has no video stream.")
        try:
            duration = float(value.get("format", {}).get("duration", 0))
        except (TypeError, ValueError):
            duration = 0
        if not math.isfinite(duration) or duration <= 0:
            raise CaptureError("The actual recording has no positive finite duration.")
        return {"durationSeconds": duration, "streams": [
            {key: stream[key] for key in ("index", "codec_type", "codec_name", "width", "height", "sample_rate", "channels",
                                         "channel_layout", "time_base", "start_time", "duration", "nb_frames", "bit_rate") if key in stream}
            for stream in streams
        ]}

    def video_timeline(self, path):
        result = self.run([self.args.ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries",
                           "packet=pts_time,duration_time", "-of", "json", str(path)], timeout=25)
        if result.returncode != 0 or len(result.stdout) > 5 * 1024 * 1024:
            raise CaptureError("Actual video packet timestamps could not be inspected within the evidence bound.")
        try:
            packets = json.loads(result.stdout).get("packets", [])
        except (ValueError, AttributeError) as error:
            raise CaptureError("Video packet timestamps were not valid JSON.") from error
        starts, ends = [], []
        for packet in packets:
            try:
                start = float(packet["pts_time"])
                duration = float(packet.get("duration_time", 0))
            except (KeyError, TypeError, ValueError):
                continue
            if math.isfinite(start) and start >= 0 and math.isfinite(duration) and duration >= 0:
                starts.append(start)
                ends.append(start + duration)
        if not starts:
            raise CaptureError("The actual recording had no usable video packet timestamps.")
        return {"packetCount": len(starts), "firstTimestampSeconds": round(min(starts), 3),
                "lastPacketEndSeconds": round(max(ends), 3), "coverageSeconds": round(max(ends) - min(starts), 3)}

    def audio_timeline(self, path, audio_stream, label):
        if not audio_stream:
            return {"present": False, "inspectionSucceeded": False}
        try:
            result = self.run([self.args.ffprobe, "-v", "error", "-select_streams", "a:0",
                               "-show_packets", "-show_frames", "-show_entries",
                               "packet=type,pts_time,dts_time,duration_time,size:frame=type,pts_time,best_effort_timestamp_time,pkt_dts_time,nb_samples,sample_rate",
                               "-of", "json", str(path)], timeout=45)
            if result.returncode != 0 or len(result.stdout) > 5 * 1024 * 1024:
                detail = result.stderr.decode("utf-8", errors="replace")[-300:]
                raise CaptureError("Audio packet/frame inspection failed or exceeded the evidence bound: " + detail)
            value = json.loads(result.stdout)
            if not isinstance(value, dict):
                raise CaptureError("Audio packet/frame inspection returned an invalid JSON object.")
            sample_rate = int(audio_stream.get("sample_rate", 0))
            if not 1 <= sample_rate <= 384000:
                raise CaptureError("Audio stream sample rate was unavailable or outside the diagnostic bound.")
            summary = summarize_audio_timeline(value, sample_rate)
            detail_file = self.output / (label + "-audio-packets-and-frames-" + self.nonce + ".json")
            detail_file.write_bytes(result.stdout)
            summary["packetFrameDetailFile"] = str(detail_file)
            return summary
        except (CaptureError, OSError, ValueError, TypeError) as error:
            # These diagnostics must not discard a genuine video or alter its
            # independent source-and-MP4 amplitude gate.
            message = str(error)[:400]
            self.report["diagnostics"].append(label + " audio timeline diagnostic: " + message)
            return {"present": True, "inspectionSucceeded": False, "error": message}

    def audio_stats(self, path, has_audio, channel_index=None):
        if not has_audio:
            return {"present": False, "nonSilent": False, "sampleCount": 0}
        command = [self.args.ffmpeg, "-v", "error", "-i", str(path), "-map", "0:a:0", "-t", str(self.args.max_duration)]
        if channel_index is not None:
            # Select an actual channel for diagnostics only. Do not amplify,
            # fill timestamp gaps, or use this result to replace the mono gate.
            command.extend(["-af", "pan=mono|c0=c" + str(channel_index)])
        command.extend(["-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1"])
        result = self.run(command, timeout=45)
        if result.returncode != 0 or len(result.stdout) > (self.args.max_duration * 16000 + 16000) * 2:
            return {"present": True, "nonSilent": False, "decodeSucceeded": False, "sampleCount": 0}
        return pcm_stats(result.stdout)

    def source_channel_stats(self, path, audio_stream):
        if not audio_stream:
            return []
        try:
            count = int(audio_stream.get("channels", 0))
        except (TypeError, ValueError):
            count = 0
        diagnostics = []
        # Mono already has an independent decoded measurement. Inspect at most
        # two real channels when the original capture has multiple channels.
        for channel in range(min(count, 2)) if count > 1 else ():
            try:
                stats = self.audio_stats(path, True, channel)
            except CaptureError as error:
                stats = {"present": True, "nonSilent": False, "decodeSucceeded": False, "error": str(error)[:400]}
            diagnostics.append({"channelIndex": channel, **stats})
        return diagnostics

    def convert_and_export(self):
        if not self.report["ffmpegAvailable"] or not self.report["ffprobeAvailable"]:
            raise CaptureError("ffmpeg and ffprobe must already be available; the original recording was retained.")
        source = self.probe(self.raw_path)
        self.report["sourceProbe"] = source
        requested = self.report.get("hostCaptureRequestedOptions")
        if requested and self.report.get("recorder") == "emulator-host-webm":
            video = next((stream for stream in source["streams"] if stream.get("codec_type") == "video"), {})
            observed_size = [video.get("width"), video.get("height")]
            self.report["hostCaptureObservedVideoSize"] = observed_size
            self.report["hostCaptureSizeOverrideApplied"] = observed_size == requested["videoSize"]
            if not self.report["hostCaptureSizeOverrideApplied"]:
                raise CaptureError("Host recording dimensions do not match the accepted requested size; original recording retained.")
        source_timeline = self.video_timeline(self.raw_path)
        self.report["sourceVideoTimeline"] = source_timeline
        source_audio_stream = next((stream for stream in source["streams"] if stream.get("codec_type") == "audio"), None)
        has_audio = source_audio_stream is not None
        self.report["sourceAudio"] = self.audio_stats(self.raw_path, has_audio)
        self.report["sourceAudioTimeline"] = self.audio_timeline(self.raw_path, source_audio_stream, "source")
        self.report["sourceAudioChannels"] = self.source_channel_stats(self.raw_path, source_audio_stream)
        duration = min(source["durationSeconds"], self.args.max_duration)
        target = self.output / ("voice-ui-demo-" + self.nonce + ".mp4")
        audio_rate = 32000 if has_audio else 0
        rate = max(60000, min(450000, int(MAX_MP4_BYTES * 0.84 * 8 / duration) - audio_rate))
        for attempt in range(2):
            command = [self.args.ffmpeg, "-v", "error", "-y", "-i", str(self.raw_path), "-map", "0:v:0"]
            if has_audio:
                command.extend(["-map", "0:a:0", "-c:a", "aac", "-b:a", "32k", "-ac", "1"])
            else:
                command.append("-an")
            command.extend(["-t", str(duration), "-vf", "scale=540:960:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=15",
                            "-c:v", "libx264", "-preset", "veryfast", "-b:v", str(rate), "-maxrate", str(rate),
                            "-bufsize", str(rate * 2), "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target)])
            result = self.run(command, timeout=120, record=True)
            if result.returncode != 0 or not target.is_file():
                raise CaptureError("Actual-stream MP4 conversion failed; the original recording was retained.")
            if 0 < target.stat().st_size <= MAX_MP4_BYTES:
                break
            rate = max(40000, int(rate * 0.6))
        if not 0 < target.stat().st_size <= MAX_MP4_BYTES:
            raise CaptureError("Actual MP4 exceeded the 4 MiB export ceiling after two bounded conversion attempts.")
        probe = self.probe(target)
        target_timeline = self.video_timeline(target)
        self.report["mp4VideoTimeline"] = target_timeline
        mp4_audio_stream = next((stream for stream in probe["streams"] if stream.get("codec_type") == "audio"), None)
        audio = self.audio_stats(target, mp4_audio_stream is not None)
        self.report["mp4AudioTimeline"] = self.audio_timeline(target, mp4_audio_stream, "mp4")
        expected_coverage = self.report.get("recordingElapsedAtEndSeconds")
        self.report["captureTimelineToleranceSeconds"] = 2
        self.report["captureTimelineVerified"] = bool(
            self.report["terminalMarkerReceived"] and not self.report.get("recorderLivenessLost", True)
            and isinstance(expected_coverage, (int, float)) and expected_coverage > 0
            and source_timeline["coverageSeconds"] + 2 >= expected_coverage
            and target_timeline["coverageSeconds"] + 2 >= expected_coverage
        )
        if not self.report["captureTimelineVerified"]:
            self.report["diagnostics"].append("Recorded video timestamps did not establish complete start-to-terminal UI coverage within 2 seconds.")
        self.report.update({"mp4File": str(target), "mp4Probe": probe, "mp4Audio": audio, "mp4Verified": True,
                            "videoCreated": True,
                            "capturedAudioPresent": has_audio and audio["present"],
                            "capturedAudioNonSilent": self.report["sourceAudio"]["nonSilent"] and audio["nonSilent"]})
        self.report["audioCaptureGatePassed"] = self.report["capturedAudioPresent"] and self.report["capturedAudioNonSilent"]
        self.report["capturedAudioVerified"] = self.report["audioCaptureGatePassed"]
        data = target.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        chunk_count = (len(data) + CHUNK_BYTES - 1) // CHUNK_BYTES
        metadata = {"schemaVersion": 1, "nonce": self.nonce, "filename": target.name, "encoding": "base64",
                    "byteCount": len(data), "sha256": digest, "chunkCount": chunk_count, "chunkBytes": CHUNK_BYTES}
        self.report["videoExport"] = metadata
        payloads = [base64.b64encode(data[index * CHUNK_BYTES:(index + 1) * CHUNK_BYTES]).decode("ascii")
                    for index in range(chunk_count)]
        reconstructed = b"".join(base64.b64decode(payload, validate=True) for payload in payloads)
        if len(reconstructed) != len(data) or hashlib.sha256(reconstructed).hexdigest() != digest:
            raise CaptureError("Base64 payload failed local size and SHA-256 reconstruction before export.")
        self.report["videoExportVerified"] = True
        self.report["videoExportVerificationScope"] = "runner-payload-only; downloaded logs require independent reconstruction"
        emit("KOTOBA_UI_DEMO_VIDEO_META_JSON", metadata)
        for index, payload in enumerate(payloads):
            emit("KOTOBA_UI_DEMO_VIDEO_CHUNK_JSON", {"schemaVersion": 1, "nonce": self.nonce, "index": index,
                                                   "base64": payload})
        emit("KOTOBA_UI_DEMO_VIDEO_END_JSON", {"schemaVersion": 1, "nonce": self.nonce, "sha256": digest,
                                             "byteCount": len(data), "chunkCount": chunk_count})
        self.report["videoExported"] = True

    def execute(self):
        try:
            self.validate_guest()
            # Baseline before help discovery: the concurrently running helper may
            # become ready while emulator capabilities are being inspected.
            initial_ready = self.read_marker(READY_FILE)
            self.discover()
            self.await_ready(initial_ready)
            if not self.start_host():
                self.start_guest()
            self.acknowledge()
            self.await_end()
        except CaptureError as error:
            self.report["diagnostics"].append(str(error))
        finally:
            self.stop_host()
            self.stop_guest()
        try:
            self.retain_source()
            self.convert_and_export()
        except (CaptureError, OSError) as error:
            self.report["diagnostics"].append(str(error))
        self.report["interrupted"] = STOP_REQUESTED
        if self.report["videoExported"]:
            self.report["status"] = "CAPTURED_WITH_VERIFIED_AUDIO" if self.report["audioCaptureGatePassed"] else "CAPTURED_WITHOUT_VERIFIED_AUDIO"
        else:
            self.report["status"] = "CAPTURE_ERROR"
        full_diagnostics = self.output / "capture-diagnostics.json"
        full_diagnostics.write_text(json.dumps(self.report, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        self.report["diagnosticReportFile"] = str(full_diagnostics)
        # Keep the one-line report within the existing bounded JSON evidence gate.
        if len(json.dumps(self.report, ensure_ascii=True)) > 18000:
            commands = self.report["commands"]
            self.report["commands"] = commands[:4] + commands[-6:] if len(commands) > 10 else commands
            for command in self.report["commands"]:
                command["stdout"] = command["stdout"][-600:]
                command["stderr"] = command["stderr"][-300:]
            self.report["diagnosticReportTruncated"] = True
        path = self.output / "capture-report.json"
        path.write_text(json.dumps(self.report, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        emit("KOTOBA_UI_DEMO_CAPTURE_JSON", self.report)
        ok = self.report["videoExported"] and self.report["recorderLiveVerifiedBeforeAck"] and self.report["captureTimelineVerified"]
        if self.args.require_audio:
            ok = ok and self.report["audioCaptureGatePassed"]
        return 0 if ok else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--package", default="com.studio501.kotoba.debug")
    parser.add_argument("--serial")
    parser.add_argument("--adb", default="adb")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--ready-timeout", type=int, default=150)
    parser.add_argument("--max-duration", type=int, default=90)
    parser.add_argument("--require-audio", action="store_true")
    args = parser.parse_args()
    if args.package != "com.studio501.kotoba.debug":
        parser.error("capture is restricted to com.studio501.kotoba.debug")
    if args.serial and not re.fullmatch(r"emulator-[0-9]+", args.serial):
        parser.error("--serial must identify an emulator")
    required_environment = {"GITHUB_ACTIONS": "true", "GITHUB_REPOSITORY": "501-Studio/501-studio.github.io", "RUNNER_OS": "Linux"}
    if any(os.environ.get(key) != value for key, value in required_environment.items()):
        parser.error("capture runs only in this repository's standard Linux GitHub Actions environment")
    if not 1 <= args.ready_timeout <= 150 or not 10 <= args.max_duration <= 90:
        parser.error("readiness must be 1..150 seconds and capture duration 10..90 seconds")
    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, request_stop)
    return Capture(args).execute()


if __name__ == "__main__":
    raise SystemExit(main())
