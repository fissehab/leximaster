"""The website (static/js/local/server.js, run in Node by tests/js/scenario.mjs)
and the local app (FastAPI) give the same answers for the same scenario on
the 200 sample words: practice pools for every scope and word level, My
words, words to refresh, answers' scheduling and the Progress counts. Skipped
without Node 22.15+ (module.registerHooks)."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app import db

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")


def _node_ok() -> bool:
    if not NODE:
        return False
    out = subprocess.run([NODE, "-e", "process.stdout.write(String(typeof require('node:module').registerHooks))"],
                         capture_output=True, text=True)
    return out.stdout.strip() == "function"


SCOPES = ["", "everyday", "core", "mine", "refresh", "idioms"]


@pytest.mark.skipif(not _node_ok(), reason="needs Node 22.15+")
def test_the_website_and_the_local_app_agree(client, tmp_path):
    import sys
    sys.path.insert(0, str(ROOT / "tests" / "js"))
    from fixture_site import sample_words
    with db.tx() as c:   # the levels a real build gives, as the website's sample site has them
        for w in sample_words():
            c.execute("UPDATE words SET level=? WHERE key=?", (w["level"], w["key"]))
        keys = [r["key"] for r in c.execute("SELECT key FROM words WHERE is_custom=0 ORDER BY key")]
    scenario = {"levels": ["2,3,4", "1,2,3,4,5"], "scopes": SCOPES,
                "save": [[keys[3], 3], [keys[9], 1]], "list": [keys[12], keys[15]],
                "answers": [[keys[20], True], [keys[20], False], [keys[21], False], [keys[22], True],
                            [keys[23], True], [keys[23], True], [keys[24], False], [keys[24], True]]}
    env = {**__import__("os").environ, "LEXI_SITE": str(tmp_path / "site")}
    subprocess.run([str(ROOT / ".venv/bin/python") if (ROOT / ".venv/bin/python").exists() else "python",
                    str(ROOT / "tests/js/fixture_site.py"), env["LEXI_SITE"]], check=True)
    js = json.loads(subprocess.run([NODE, str(ROOT / "tests/js/scenario.mjs"), json.dumps(scenario)], env=env,
                                   capture_output=True, text=True, check=True, timeout=120).stdout)

    with db.tx() as c:
        id_of = {r["key"]: r["id"] for r in c.execute("SELECT id, key FROM words")}
    py = {"pools": {}}
    for lv in scenario["levels"]:
        client.patch("/api/settings", json={"word_levels": lv})
        for d in SCOPES:
            py["pools"][f"{lv}|{d}"] = client.get("/api/flashcards", params={"domain": d, "n": 1, "shuffle": False}).json()["pool"]
    client.patch("/api/settings", json={"word_levels": "2,3,4"})
    for k, stars in scenario["save"]:
        client.patch(f"/api/words/{id_of[k]}/state", json={"stars": stars})
    lid = client.post("/api/lists", json={"name": "Scenario"}).json()["id"]
    for k in scenario["list"]:
        client.post(f"/api/lists/{lid}/words", json={"word_id": id_of[k]})
    for k, ok in scenario["answers"]:
        client.post("/api/answer", json={"word_id": id_of[k], "mode": "quiz", "correct": ok})
    py["mine"] = client.get("/api/flashcards", params={"domain": "mine", "n": 1}).json()["pool"]
    py["refresh"] = client.get("/api/refresh").json()["count"]
    st = client.get("/api/stats").json()
    py["words"] = {k: st["words"][k] for k in ("mastered", "learning", "seen", "due", "overdue", "known")}
    py["forecast"] = st["forecast"]
    py["cards"] = {}
    for k, _ in scenario["answers"]:
        s = client.get(f"/api/words/{id_of[k]}").json()["srs"]
        py["cards"][k] = s and {"due": s["due"], "reps": s["reps"], "lapses": s["lapses"], "ease": s["ease"]}

    assert js == py
