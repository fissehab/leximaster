"""Word ids on the site stay put from build to build (tools/build_site.word_ids)."""
import json

from tools.build_site import IDS, word_ids


def test_adding_and_removing_words_keeps_every_other_id(tmp_path):
    ledger = tmp_path / "ids.json"
    words = [{"key": k} for k in ["apple", "cat", "dog", "zebra"]]
    first = word_ids(words, ledger)
    assert first == {"apple": 1, "cat": 2, "dog": 3, "zebra": 4}
    # "bat" sorts between apple and cat; "dog" is removed.
    second = word_ids([{"key": k} for k in ["apple", "bat", "cat", "zebra"]], ledger)
    assert second == {"apple": 1, "bat": 5, "cat": 2, "zebra": 4}
    # dog comes back with its old id; its id was never reused.
    third = word_ids([{"key": k} for k in ["dog", "eel"]], ledger)
    assert third == {"dog": 3, "eel": 6}


def test_committed_ledger_is_well_formed():
    ledger = json.loads(IDS.read_text(encoding="utf-8"))
    ids = list(ledger["ids"].values())
    assert len(ids) == len(set(ids)), "two words share an id"
    assert max(ids) < ledger["next"] < 10_000_000
