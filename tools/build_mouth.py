"""Build the real-mouth (MRI) clips for "How to say it".

    .venv/bin/python tools/build_mouth.py

From the clips cut out of the USC 75-Speaker Speech MRI Database (CC BY 4.0;
speaker sub009, American English) in data/cache/usc75/clips/, makes for each
sound a short clip around the moment the sound is made (±0.3 s), evenly lit,
denoised, 240 × 240, without sound, plus a still of that moment (the poster
the clip opens on). Writes them to static/mouth/<name>.<hash>.mp4|webp and
their list to static/js/mri.gen.js. Names carry a hash of the content and
existing files are kept, so a rebuild that changes nothing rewrites nothing.
Needs ffmpeg (with libx264 and libwebp).
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "cache" / "usc75" / "clips"
OUT = ROOT / "static" / "mouth"
GEN = ROOT / "static" / "js" / "mri.gen.js"
FPS = 65040 / 781          # the database's frame rate (83.3 per second)
HALF = 25                  # frames kept each side of the sound (0.3 s)
SIZE = 240

# Each clip: the frame where the sound is made, then outlines on that frame
# (240 × 240): the tongue's upper surface, and for th and v, where the top
# teeth are (teeth don't show in MRI). Traced by hand from the frames.
CLIPS = {
    "theta": {"frame": 85, "tongue": "M80,104 C88,99 100,97 112,96 C130,95 150,96 166,101 C180,106 190,116 195,130 L193,170",
              "teeth": "M80,80 L76,103 L84,104 L89,81 Z"},
    "r": {"frame": 51, "tongue": "M108,112 C106,100 110,92 118,92 C132,93 150,98 166,106 C180,114 190,124 194,140 L192,175"},
    "l": {"frame": 55, "tongue": "M82,104 C86,99 94,98 104,100 C122,103 144,100 162,103 C178,108 190,118 196,134 L194,172"},
    "v": {"frame": 60, "tongue": "M96,124 C98,114 108,110 120,108 C140,105 160,104 174,110 C186,116 194,126 196,140 L194,175",
          "teeth": "M80,80 L75,104 L83,106 L89,82 Z"},
    "w": {"frame": 60, "tongue": "M100,124 C104,114 114,110 126,108 C146,106 164,108 178,116 C190,124 196,136 196,150 L194,178"},
    "bit": {"frame": 44, "tongue": "M98,112 C100,100 110,95 124,94 C140,94 152,100 162,112 C170,124 174,140 174,160"},
    "bat": {"frame": 48, "tongue": "M98,130 C102,118 112,111 126,108 C142,106 156,112 166,124 C174,136 178,150 180,172"},
}


def run(*args: str, capture: bool = False) -> bytes:
    return subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def levels(src: Path, first: int, last: int) -> tuple[int, int]:
    """The 1st and 99th percentile of brightness over the kept frames: one
    setting for the whole clip, so it doesn't flicker."""
    raw = run("-i", str(src), "-vf", f"select='between(n\\,{first}\\,{last})',format=gray", "-vsync", "0",
              "-f", "rawvideo", "-", capture=True)
    counts = [raw.count(bytes([v])) for v in range(256)]
    total, seen, lo, hi = sum(counts), 0, 0, 255
    for v, c in enumerate(counts):
        if seen < total * .01 <= seen + c:
            lo = v
        if seen < total * .99 <= seen + c:
            hi = v
        seen += c
    return lo, max(hi, lo + 1)


def build(name: str, spec: dict) -> dict:
    src = SRC / f"{name}.mp4"
    first, last = max(0, spec["frame"] - HALF), spec["frame"] + HALF
    lo, hi = levels(src, first, last)
    look = (f"format=gray,lutyuv=y='clip((val-{lo})*255/{hi - lo},0,255)',hqdn3d=3:3:4:4,"
            f"scale={SIZE}:{SIZE}:flags=lanczos")
    tmp_mp4, tmp_webp = OUT / f".{name}.mp4", OUT / f".{name}.webp"
    run("-i", str(src), "-vf", f"select='between(n\\,{first}\\,{last})',setpts=N/({FPS}*TB),{look},format=yuv420p",
        "-r", f"{FPS}", "-an", "-c:v", "libx264", "-profile:v", "main", "-level", "3.0", "-crf", "28",
        "-preset", "veryslow", "-g", "999", "-movflags", "+faststart", "-map_metadata", "-1",
        "-fflags", "+bitexact", "-flags:v", "+bitexact", str(tmp_mp4))
    run("-i", str(src), "-vf", f"select='eq(n\\,{spec['frame']})',{look}", "-frames:v", "1",
        "-c:v", "libwebp", "-quality", "70", "-map_metadata", "-1", "-fflags", "+bitexact", str(tmp_webp))
    out = {}
    for tmp, ext, key in ((tmp_mp4, "mp4", "src"), (tmp_webp, "webp", "poster")):
        data = tmp.read_bytes()
        final = OUT / f"{name}.{hashlib.sha256(data).hexdigest()[:8]}.{ext}"
        if not final.exists():
            final.write_bytes(data)
        tmp.unlink()
        out[key] = f"static/mouth/{final.name}"
    out["at"] = round((spec["frame"] - first) / FPS, 3)
    for k in ("tongue", "teeth"):
        if spec.get(k):
            out[k] = spec[k]
    return out


def main() -> None:
    if not SRC.exists():
        sys.exit(f"No clips in {SRC.relative_to(ROOT)}: see the docstring.")
    OUT.mkdir(parents=True, exist_ok=True)
    clips = {name: build(name, spec) for name, spec in CLIPS.items()}
    used = {Path(c[k]).name for c in clips.values() for k in ("src", "poster")}
    for old in OUT.iterdir():
        if old.name not in used:
            old.unlink()
    GEN.write_text("// Generated by tools/build_mouth.py: the real-mouth (MRI) clips. Do not edit.\n"
                   f"export const CLIPS = {json.dumps(clips, indent=2)};\n", encoding="utf-8")
    size = sum((OUT / n).stat().st_size for n in used)
    print(f"{len(clips)} clips, {size / 1024:.0f} KB in static/mouth/")


if __name__ == "__main__":
    main()
