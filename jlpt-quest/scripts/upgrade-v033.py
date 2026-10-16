#!/usr/bin/env python3
from pathlib import Path
import base64
import subprocess
import zlib

ROOT = Path(__file__).resolve().parents[2]
PARTS = ROOT / "jlpt-quest" / "scripts" / "v033-patch-parts"
MARKERS = [
    ("jlpt-quest/src/catalog.js", "export const CHAPTER_SIZE=30"),
    ("jlpt-quest/src/stroke-match.js", "export const MIN_SHAPE_SIMILARITY=.60"),
    ("jlpt-quest/src/course-engine.js", "export function classifyWord"),
    ("jlpt-quest/src/app.js", "data-action=\"known\""),
    ("jlpt-quest/package.json", '"version": "0.3.3"'),
    ("kotoba-android/app/build.gradle", "versionName '0.3.3'"),
]

def verified():
    return all(token in (ROOT / rel).read_text(encoding="utf-8") for rel, token in MARKERS)

if verified():
    print("Kotoba v0.3.3 migration already applied.")
    raise SystemExit(0)

payload = "".join((PARTS / f"part-{i:02d}.txt").read_text(encoding="utf-8") for i in range(7))
patch_bytes = zlib.decompress(base64.b85decode(payload.encode("ascii")))
proc = subprocess.run(
    ["patch", "-p1", "--forward", "--batch"],
    cwd=ROOT,
    input=patch_bytes,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
)
print(proc.stdout.decode("utf-8", errors="replace"))
if proc.returncode != 0:
    raise SystemExit(f"v0.3.3 patch failed with exit code {proc.returncode}")
if not verified():
    missing = [rel for rel, token in MARKERS if token not in (ROOT / rel).read_text(encoding="utf-8")]
    raise SystemExit("v0.3.3 migration verification failed: " + ", ".join(missing))
print("Kotoba v0.3.3 chapter/review migration applied and verified.")
