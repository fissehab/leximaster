"""Fact-check the "In the Bible" notes: verse references, Hebrew and Greek
words, names and events. Two passes through the Message Batches API (half
price): Haiku screens every note and flags errors it is sure of; Sonnet
re-checks each flag and, when the error is real, corrects the note with the
smallest change. Corrections are appended to data/cache/enrich.jsonl, so the
next build picks them up; every decision is kept in data/cache/bible_check.json.

    .venv/bin/python tools/check_bible.py screen            # Haiku pass
    .venv/bin/python tools/check_bible.py screen --sonnet --top 1000 --budget 0.55
    .venv/bin/python tools/check_bible.py verify [--budget 0.60]
    .venv/bin/python tools/check_bible.py apply
    .venv/bin/python build_dataset.py --stage assemble && .venv/bin/python tools/build_site.py

The spending cap (--budget, dollars) is checked against worst-case cost
before anything is sent.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from build_dataset import CACHE, ENRICH_CACHE, PRICES, WORDS_JSON, append_jsonl, norm_key, read_jsonl  # noqa: E402

HAIKU, SONNET = "claude-haiku-5-5", "claude-sonnet-5-5"
STATE = CACHE / "bible_check.json"
SCREEN_BATCH, VERIFY_BATCH = 15, 6
SCREEN_MAX, VERIFY_MAX = 3000, 3500

RULES = """Reference Bible: the Revised Standard Version (RSV), with its book names and verse numbering. Do not count differences in numbering between the RSV, the Hebrew text, the Septuagint or Catholic editions as errors, and do not count wording or style. An error is: a chapter:verse reference that does not exist or is not about what the note says it is about; a wrong Hebrew or Greek word, transliteration or meaning; a person, place or event mixed up with another; a false statement of fact."""

SCREEN_PROMPT = """You are checking short Bible study notes in a vocabulary app for factual errors. """ + RULES + """

Flag a note only when you are confident there is an error, and say exactly what is wrong and what is right. Most notes are correct; return an empty list when none has an error.

Notes:
"""

VERIFY_PROMPT = """An automatic check flagged possible factual errors in these Bible study notes from a vocabulary app. """ + RULES + """

For each note, decide whether the flagged problem is a real error (check it yourself; the flag may be wrong). If it is real, return the note corrected with the smallest change: keep every correct sentence word for word, and if you are unsure of the right reference, remove the wrong one rather than guess. If the flag is wrong, set real to false and note to "".

"""

SCREEN_SCHEMA = {"type": "object", "properties": {"flags": {"type": "array", "items": {
    "type": "object", "properties": {"id": {"type": "integer"}, "problem": {"type": "string"}},
    "required": ["id", "problem"], "additionalProperties": False}}},
    "required": ["flags"], "additionalProperties": False}
VERIFY_SCHEMA = {"type": "object", "properties": {"results": {"type": "array", "items": {
    "type": "object", "properties": {"id": {"type": "integer"}, "real": {"type": "boolean"},
                                     "why": {"type": "string"}, "note": {"type": "string"}},
    "required": ["id", "real", "why", "note"], "additionalProperties": False}}},
    "required": ["results"], "additionalProperties": False}


def batch_price(model: str) -> tuple[float, float]:
    """Dollars per million tokens, input and output, at the batch discount."""
    p = next(v for k, v in PRICES.items() if k in model)
    return p[0] / 2, p[1] / 2


def cost(model: str, inp: int, out: int) -> float:
    pi, po = batch_price(model)
    return (inp * pi + out * po) / 1e6


def load_state() -> dict:
    return json.loads(STATE.read_text()) if STATE.exists() else {"spent": 0.0, "flags": {}, "verdicts": {}}


def save_state(s: dict) -> None:
    STATE.write_text(json.dumps(s, ensure_ascii=False, indent=1))


def notes() -> list[dict]:
    """Every entry with a Bible note, most common words first."""
    words = json.loads(WORDS_JSON.read_text(encoding="utf-8"))["words"]
    words = sorted((w for w in words if (w.get("nuance") or {}).get("biblical_note")),
                   key=lambda w: w.get("freq_rank") or 10**6)
    return [{"key": w["key"], "word": w["word"], "note": w["nuance"]["biblical_note"]} for w in words]


def request(custom_id: str, model: str, max_tokens: int, schema: dict, text: str) -> dict:
    return {"custom_id": custom_id, "params": {
        "model": model, "max_tokens": max_tokens,
        "output_config": {"effort": "low", "format": {"type": "json_schema", "schema": schema}},
        "messages": [{"role": "user", "content": text}]}}


def run_batch(client, requests: list[dict], model: str) -> tuple[dict[str, dict], float]:
    """Send a batch, wait for it, return {custom_id: parsed JSON} and its cost."""
    b = client.messages.batches.create(requests=requests)
    print(f"batch {b.id}: {len(requests)} requests", flush=True)
    while b.processing_status != "ended":
        time.sleep(30)
        b = client.messages.batches.retrieve(b.id)
        c = b.request_counts
        print(f"  {c.succeeded} done · {c.processing} waiting · {c.errored} errors", flush=True)
    out, inp, outp = {}, 0, 0
    for r in client.messages.batches.results(b.id):
        if r.result.type != "succeeded":
            print(f"  {r.custom_id}: {r.result.type}", flush=True)
            continue
        m = r.result.message
        inp += m.usage.input_tokens
        outp += m.usage.output_tokens
        text = next((x.text for x in m.content if x.type == "text"), "")
        try:
            out[r.custom_id] = json.loads(text)
        except json.JSONDecodeError:
            print(f"  {r.custom_id}: unreadable answer ({m.stop_reason})", flush=True)
    spent = cost(model, inp, outp)
    print(f"  in {inp:,} · out {outp:,} tokens · ${spent:.3f}", flush=True)
    return out, spent


def worst_case(model: str, requests: list[dict]) -> float:
    inp = sum(len(r["params"]["messages"][0]["content"]) for r in requests) / 2.5  # generous chars→tokens
    return cost(model, int(inp), sum(r["params"]["max_tokens"] for r in requests))


def screen(client, budget: float, model: str = HAIKU, top: int = 0, max_tokens: int = SCREEN_MAX) -> int:
    """Haiku screens every note once; a second, stronger pass (--sonnet --top N)
    re-screens the N most common words and adds its flags."""
    s = load_state()
    done = s.setdefault("screened", {}).setdefault(model, [])
    todo = [n for n in notes() if n["key"] not in done and n["key"] not in s["verdicts"]]
    todo = todo[:top] if top else todo
    reqs, chunks = [], {}
    for i in range(0, len(todo), SCREEN_BATCH):
        chunk = todo[i:i + SCREEN_BATCH]
        cid = f"s{i}"
        chunks[cid] = chunk
        body = "\n\n".join(f"[{k}] {n['word']}: {n['note']}" for k, n in enumerate(chunk))
        reqs.append(request(cid, model, max_tokens, SCREEN_SCHEMA, SCREEN_PROMPT + body))
    worst = worst_case(model, reqs)
    print(f"{len(todo)} notes to screen; worst case ${worst:.2f}, budget ${budget:.2f}")
    if not reqs or worst > budget:
        return 1 if reqs else 0
    res, spent = run_batch(client, reqs, model)
    for cid, chunk in chunks.items():
        if cid not in res:
            continue
        flagged = {f["id"]: f["problem"] for f in res[cid]["flags"] if 0 <= f["id"] < len(chunk)}
        for k, n in enumerate(chunk):
            done.append(n["key"])
            if flagged.get(k) or not s["flags"].get(n["key"]):
                s["flags"][n["key"]] = flagged.get(k, "")
    s["spent"] += spent
    save_state(s)
    print(f"flagged {sum(1 for v in s['flags'].values() if v)} of {len(s['flags'])}; spent so far ${s['spent']:.3f}")
    return 0


def verify(client, budget: float) -> int:
    s = load_state()
    by_key = {n["key"]: n for n in notes()}
    todo = [k for k, v in s["flags"].items() if v and k not in s["verdicts"] and k in by_key]
    reqs, chunks = [], {}
    for i in range(0, len(todo), VERIFY_BATCH):
        chunk = todo[i:i + VERIFY_BATCH]
        body = "\n\n".join(f"[{j}] {by_key[k]['word']}: {by_key[k]['note']}\nFlag: {s['flags'][k]}"
                           for j, k in enumerate(chunk))
        r = request(f"v{i}", SONNET, VERIFY_MAX, VERIFY_SCHEMA, VERIFY_PROMPT + body)
        if worst_case(SONNET, reqs + [r]) > budget:
            break
        reqs.append(r)
        chunks[r["custom_id"]] = chunk
    print(f"{len(todo)} flags to verify; sending {sum(map(len, chunks.values()))} "
          f"(worst case ${worst_case(SONNET, reqs):.2f}, budget ${budget:.2f})")
    if not reqs:
        return 0
    res, spent = run_batch(client, reqs, SONNET)
    for cid, chunk in chunks.items():
        for r in (res.get(cid) or {}).get("results", []):
            if 0 <= r["id"] < len(chunk):
                k = chunk[r["id"]]
                s["verdicts"][k] = {"real": r["real"], "why": r["why"], "old": by_key[k]["note"],
                                    "note": r["note"].strip() if r["real"] else ""}
    s["spent"] += spent
    save_state(s)
    real = sum(1 for v in s["verdicts"].values() if v["real"])
    print(f"verified {len(s['verdicts'])}: {real} real errors; spent so far ${s['spent']:.3f}")
    return 0


def apply() -> int:
    s = load_state()
    cache = read_jsonl(ENRICH_CACHE)
    n = 0
    for k, v in s["verdicts"].items():
        rec = cache.get(k)
        if not (v["real"] and v["note"] and rec and rec.get("status") == "ok"):
            continue
        note = v["note"]
        head, _, rest = note.partition(": ")
        if rest and norm_key(head) == k:
            note = rest  # the model echoes the "word: note" input format
        if rec["nuance"].get("biblical_note") == note:
            continue
        rec["nuance"]["biblical_note"] = note
        append_jsonl(ENRICH_CACHE, {"key": k, "status": "ok", "nuance": rec["nuance"]})
        n += 1
    print(f"applied {n} corrected notes to {ENRICH_CACHE.relative_to(ROOT)}")
    return 0


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    budget = float(sys.argv[sys.argv.index("--budget") + 1]) if "--budget" in sys.argv else 0.30
    if cmd == "apply":
        return apply()
    if cmd not in ("screen", "verify"):
        sys.exit(__doc__)
    import anthropic
    client = anthropic.Anthropic(max_retries=6)
    if cmd == "verify":
        return verify(client, budget)
    if "--sonnet" in sys.argv:
        top = int(sys.argv[sys.argv.index("--top") + 1]) if "--top" in sys.argv else 0
        return screen(client, budget, SONNET, top, 1500)
    return screen(client, budget)


if __name__ == "__main__":
    sys.exit(main())
