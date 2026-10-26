"""Label the Bible names in seeds/domain_bible.txt as a person, a place or a
people, and note the everyday American meaning of names that became ordinary
words ("Goliath", "Judas", "Samaritan"). Writes seeds/names/bible.txt, which
the builder reads; review it by hand like any seed file.

    .venv/bin/python tools/classify_names.py            # names not yet labeled
    .venv/bin/python tools/classify_names.py --all      # relabel every name
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from build_dataset import SEEDS, anthropic_client, model_id, norm_key  # noqa: E402

MODEL = "claude-sonnet-5-5"
BATCH = 60
OUT = SEEDS / "names" / "bible.txt"
HEADER = """\
# Bible names: name | kind | everyday meaning
# kind is person (a man, woman, angel, God or a god), place (a city, land,
# river, mountain) or people (a nation, tribe or group). The everyday meaning
# is filled only for names Americans use as ordinary words today.
"""

SCHEMA = {
    "type": "object",
    "properties": {"names": {"type": "array", "items": {
        "type": "object",
        "properties": {"name": {"type": "string"},
                       "kind": {"type": "string", "enum": ["person", "place", "people"]},
                       "everyday": {"type": "string"}},
        "required": ["name", "kind", "everyday"],
        "additionalProperties": False}}},
    "required": ["names"],
    "additionalProperties": False,
}

PROMPT = """For each Bible name below, give:
- kind: "person" (a man, woman, angel, God, or a pagan god), "place" (a city, land, region, river, mountain, valley), or "people" (a nation, tribe, or group, including words like "Egyptian" or "Pharisee"). When a name is several of these (Judah is a man, a tribe and a land), choose the one a reader of the Bible most often means.
- everyday: if Americans today use the name as an ordinary English word or in a common expression with a non-biblical meaning, write that meaning as a short dictionary definition (e.g. Goliath: "a person or thing of great size or power, especially an opponent"; Judas: "a person who betrays a friend"; Samaritan: "a person who helps a stranger in need", Jezebel: "a shameless, scheming woman"). Otherwise an empty string. Do not include meanings that merely restate the biblical figure, and do not include brand names or modern personal names.

Return every name exactly as given, in the same order.

Names:
"""


def bible_names() -> list[str]:
    lines = (SEEDS / "domain_bible.txt").read_text(encoding="utf-8").splitlines()
    out, on = [], False
    for line in lines:
        if line.startswith("# People and places"):
            on = True
        elif line.startswith("# ") and on and not line.startswith("# (World"):
            break
        elif on and line.strip() and not line.startswith("#"):
            out.append(line.split("|")[0].strip())
    return out


def read_labels() -> dict[str, tuple[str, str, str]]:
    if not OUT.exists():
        return {}
    out = {}
    for line in OUT.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            parts = [p.strip() for p in line.split("|")] + ["", ""]
            out[norm_key(parts[0])] = (parts[0], parts[1], parts[2])
    return out


async def label(client, names: list[str]) -> list[dict]:
    resp = await client.messages.create(
        model=model_id(MODEL), max_tokens=8000,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": PROMPT + "\n".join(names)}])
    text = next((b.text for b in resp.content if b.type == "text"), "")
    u = resp.usage
    print(f"  {len(names)} names · in {u.input_tokens} out {u.output_tokens}", flush=True)
    return json.loads(text)["names"]


async def main() -> int:
    names = bible_names()
    labels = {} if "--all" in sys.argv else read_labels()
    todo = [n for n in names if norm_key(n) not in labels]
    print(f"{len(names)} names, {len(todo)} to label")
    _, client = anthropic_client()
    sem = asyncio.Semaphore(6)

    async def run(chunk):
        async with sem:
            return await label(client, chunk)

    results = await asyncio.gather(*(run(todo[i:i + BATCH]) for i in range(0, len(todo), BATCH)))
    wanted = {norm_key(n) for n in todo}
    for r in (x for batch in results for x in batch):
        k = norm_key(r["name"])
        if k in wanted:
            labels[k] = (r["name"].strip(), r["kind"], r["everyday"].strip().rstrip("."))
    missing = [n for n in names if norm_key(n) not in labels]
    rows = [labels[norm_key(n)] for n in names if norm_key(n) in labels]
    OUT.write_text(HEADER + "".join(f"{n} | {k} | {e}\n".replace(" | \n", "\n") for n, k, e in rows),
                   encoding="utf-8")
    print(f"wrote {len(rows)} labels to {OUT.relative_to(ROOT)}; missing {len(missing)}: {missing[:20]}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
