// Searching for an idiom as people say it (static/js/phrase-match.js).
import assert from "node:assert/strict";
import { test } from "node:test";

import { phrasePattern, saysPhrase } from "../../static/js/phrase-match.js";

test("a search finds an idiom by the words people use for its person slot", () => {
  assert.ok(saysPhrase("have someone's back", "got your back"));
  assert.ok(saysPhrase("have someone's back", "I’ve got your back"));
  assert.ok(saysPhrase("have someone's back", "we have each other's back"));
  assert.ok(saysPhrase("make up one's mind", "makes up her mind"));
  assert.ok(saysPhrase("spread oneself too thin", "spreading myself too thin"));
  assert.ok(saysPhrase("throw someone under the bus", "threw" ) === false);
  assert.ok(saysPhrase("throw someone under the bus", "throw him under the bus"));
  assert.ok(!saysPhrase("have someone's back", "back"));
  assert.ok(saysPhrase("make up one's mind", "making up my mind"));
  assert.ok(saysPhrase("make up one's mind", "I made up my mind"));
  assert.ok(saysPhrase("throw someone under the bus", "threw her under the bus"));
  assert.ok(saysPhrase("stick one's neck out", "sticking my neck out"));
  assert.ok(saysPhrase("cut one's losses", "cutting our losses"));
  assert.equal(phrasePattern("in the same boat"), null);
});
