"""Even out the American recordings (data/audio/, from Wikimedia Commons) so
every word plays at the same loudness and no browser clips its first sound.

    .venv/bin/python tools/audio_norm.py            # new or changed recordings (resumable)
    .venv/bin/python tools/audio_norm.py --force    # all of them again
    .venv/bin/python tools/audio_norm.py --report   # the clipped recordings, worst first

For each data/audio/<name>.(m4a|mp3): soften hard clipping (adeclip) when the
recording is clipped, a 5 ms fade-in, peak limiting where a few sharp peaks
would keep the word from the target loudness, two-pass EBU R128 loudness
normalization to -20 LUFS integrated with true peaks at most -1.5 dBTP, 120 ms
of silence before the word, AAC .m4a with the index at the front
(+faststart). The result goes to data/audio_norm/<name>.<hash8>.m4a, the hash
being of its content, so a changed recording gets a new URL and no cache can
serve the old one. data/cache/audio_norm.json maps each source file (as
words.json names it, "audio/<name>.m4a") to its processed file;
tools/build_site.py publishes those.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SRC = DATA / "audio"
OUT = DATA / "audio_norm"
MANIFEST = DATA / "cache" / "audio_norm.json"
TARGET_I, TARGET_TP, TARGET_LRA = -20.0, -1.5, 11.0
LEAD_MS, FADE_S = 120, 0.005
RATE, BITRATE = 44100, "80k"
VERSION = 2               # bump to reprocess everything after changing the chain
MAX_LIMIT_DB = 10.0        # at most this much peak limiting; beyond it, quieter is better than squashed
CLIP_LEVEL, CLIP_RUN = 0.985, 3   # a run of 3+ samples this close to full scale is a clipped peak


def signature(src: Path) -> str:
    st = src.stat()
    return f"{VERSION}:{st.st_size}:{int(st.st_mtime)}"


def samples(src: Path):
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(src), "-f", "f32le", "-ac", "1", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def clipped_runs(x) -> int:
    """How many runs of CLIP_RUN or more consecutive samples sit at (almost)
    full scale: the flat tops of a clipped waveform."""
    import numpy as np
    hot = np.abs(x) >= CLIP_LEVEL
    if not hot.any():
        return 0
    edges = np.diff(np.concatenate([[0], hot.astype(np.int8), [0]]))
    starts, ends = np.where(edges == 1)[0], np.where(edges == -1)[0]
    return int(((ends - starts) >= CLIP_RUN).sum())


def measure(src: Path, pre: str, loops: int = 0) -> dict:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-stream_loop", str(loops), "-i", str(src), "-af",
                        f"{pre}loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=json",
                        "-f", "null", "-"], capture_output=True, text=True, check=True)
    err = r.stderr
    return json.loads(err[err.rindex("{"):err.rindex("}") + 1])


def process(src: Path) -> dict:
    x = samples(src)
    clips = clipped_runs(x)
    peak = float(abs(x).max()) if len(x) else 0.0
    pre = ("adeclip," if clips else "") + f"afade=t=in:st=0:d={FADE_S},"
    m = first = measure(src, pre)
    limited = 0.0
    if m["input_i"] != "-inf":
        # A few sharp peaks (plosives) would keep a linear gain from reaching
        # the target: limit them first, by just what the gain needs.
        excess = (TARGET_I - float(m["input_i"])) + float(m["input_tp"]) - TARGET_TP
        if excess > 0.3:
            limited = min(excess + 1.5, MAX_LIMIT_DB)   # margin: the limiter sees samples, not true peaks
            lim = 10 ** ((-3 - limited) / 20)
            pre += (f"volume={-(float(m['input_tp']) + 3):.2f}dB,"
                    f"alimiter=limit={lim:.4f}:attack=5:release=50:level=0,")
            m = measure(src, pre)
    if m["input_i"] == "-inf":
        # Shorter than one 400 ms loudness block: measure it played four
        # times over, then apply that gain (peaks kept under the ceiling).
        m = measure(src, pre, loops=3)
        gain = min(TARGET_I - float(m["input_i"]), TARGET_TP - float(m["input_tp"]))
        ln = f"volume={gain:.2f}dB"
    else:
        ln = (f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:measured_I={m['input_i']}:"
              f"measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:"
              f"offset={m['target_offset']}:linear=true:print_format=json")
    chain = f"{pre}{ln},aresample={RATE},adelay={LEAD_MS}:all=1"
    with tempfile.TemporaryDirectory() as tmp:
        dst = Path(tmp) / "out.m4a"
        r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", str(src), "-af", chain,
                            "-ac", "1", "-ar", str(RATE), "-c:a", "aac", "-b:a", BITRATE,
                            "-map_metadata", "-1", "-movflags", "+faststart", str(dst)],
                           capture_output=True, text=True, check=True)
        err = r.stderr
        if "{" in err:
            out = json.loads(err[err.rindex("{"):err.rindex("}") + 1])
        else:   # the short-clip path: a plain gain
            out = {"output_i": TARGET_I, "output_tp": float(m["input_tp"]) + gain, "normalization_type": "gain"}
        data = dst.read_bytes()
    name = f"{src.stem}.{hashlib.sha256(data).hexdigest()[:8]}.m4a"
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_bytes(data)
    return {"file": f"audio/{name}", "sig": signature(src), "in_i": float(first["input_i"]),
            "in_tp": float(first["input_tp"]), "limited_db": round(limited, 1), "out_i": float(out["output_i"]), "out_tp": float(out["output_tp"]),
            "type": out["normalization_type"], "peak": round(peak, 4), "clipped_runs": clips}


def load() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}


def save(m: dict) -> None:
    MANIFEST.write_text(json.dumps(m, ensure_ascii=False, indent=0), encoding="utf-8")


def run(force: bool = False) -> int:
    m = load()
    srcs = sorted(p for p in SRC.iterdir() if p.suffix in (".m4a", ".mp3"))
    todo = [p for p in srcs if force or f"audio/{p.name}" not in m
            or m[f"audio/{p.name}"].get("sig") != signature(p)
            or not (DATA / "audio_norm" / Path(m[f"audio/{p.name}"]["file"]).name).exists()]
    print(f"{len(todo):,} of {len(srcs):,} recordings to process", flush=True)
    failed = []

    def one(p: Path):
        try:
            return p, process(p)
        except Exception as e:  # a broken source is reported, not fatal
            return p, e

    with ThreadPoolExecutor(max_workers=8) as pool:
        for n, (p, res) in enumerate(pool.map(one, todo), start=1):
            if isinstance(res, Exception):
                failed.append((p.name, str(res)[:200]))
                continue
            old = m.get(f"audio/{p.name}")
            if old and old["file"] != res["file"]:
                (DATA / "audio_norm" / Path(old["file"]).name).unlink(missing_ok=True)
            m[f"audio/{p.name}"] = res
            if n % 500 == 0:
                save(m)
                print(f"  {n:,}/{len(todo):,}", flush=True)
    # Forget recordings no longer in data/audio, and files nothing names.
    live = {f"audio/{p.name}" for p in srcs}
    for k in [k for k in m if k not in live]:
        del m[k]
    keep = {Path(v["file"]).name for v in m.values()}
    for f in OUT.glob("*.m4a"):
        if f.name not in keep:
            f.unlink()
    save(m)
    for name, err in failed:
        print(f"  failed: {name}: {err}")
    return 1 if failed else 0


def report() -> int:
    m = load()
    rows = sorted(((v["clipped_runs"], k, v) for k, v in m.items() if v["clipped_runs"]), reverse=True)
    print(f"{len(rows)} of {len(m)} recordings have clipped peaks (runs of {CLIP_RUN}+ samples ≥ {CLIP_LEVEL})")
    for runs, k, v in rows:
        print(f"  {runs:4d}  {k}  in {v['in_i']:.1f} LUFS / {v['in_tp']:+.1f} dBTP → {v['out_i']:.1f} / {v['out_tp']:+.1f}")
    off = [(k, v["out_i"]) for k, v in m.items() if abs(v["out_i"] - TARGET_I) > 1.0]
    print(f"{len(off)} recordings more than 1 LU from {TARGET_I} LUFS")
    return 0


if __name__ == "__main__":
    if "--report" in sys.argv:
        sys.exit(report())
    sys.exit(run(force="--force" in sys.argv))
