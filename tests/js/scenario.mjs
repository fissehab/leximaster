// Run a scenario on the website's engine and print what it answers, for
// tests/test_backends_agree.py to compare with the local app:
//   node tests/js/scenario.mjs '<scenario JSON>'
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bootServer, fixtureSite } from "./harness.mjs";

const S = JSON.parse(process.argv[2]);
const { handle } = await bootServer();
const idOf = new Map(JSON.parse(readFileSync(join(fixtureSite(), "data", "index.json"), "utf8")).words.map(e => [e.k, e.i]));
const out = { pools: {} };
for (const lv of S.levels) {
  await handle("PATCH", "/api/settings", { word_levels: lv });
  for (const d of S.scopes) out.pools[`${lv}|${d}`] = (await handle("GET", `/api/flashcards?domain=${d}&n=1&shuffle=false`)).pool;
}
await handle("PATCH", "/api/settings", { word_levels: "2,3,4" });
for (const [k, stars] of S.save) await handle("PATCH", `/api/words/${idOf.get(k)}/state`, { stars });
const list = await handle("POST", "/api/lists", { name: "Scenario" });
for (const k of S.list) await handle("POST", `/api/lists/${list.id}/words`, { word_id: idOf.get(k) });
for (const [k, correct] of S.answers) await handle("POST", "/api/answer", { word_id: idOf.get(k), mode: "quiz", correct });
out.mine = (await handle("GET", "/api/flashcards?domain=mine&n=1")).pool;
out.refresh = (await handle("GET", "/api/refresh")).count;
const st = await handle("GET", "/api/stats");
out.words = Object.fromEntries(["mastered", "learning", "seen", "due", "overdue", "known"].map(k => [k, st.words[k]]));
out.forecast = st.forecast;
out.cards = Object.fromEntries(await Promise.all(S.answers.map(async ([k]) => {
  const s = (await handle("GET", `/api/words/${idOf.get(k)}`)).srs;
  return [k, s && { due: s.due, reps: s.reps, lapses: s.lapses, ease: s.ease }];
})));
console.log(JSON.stringify(out));
