// Idioms are listed with a slot for the person ("have someone's back",
// "make up one's mind"), but people search for what they say: "got your
// back", "I've got your back", "makes up her mind". phrasePattern() turns
// such a headword into a pattern those searches match. No DOM (tested in Node).

const POSS = "(?:my|your|his|her|its|our|their|one's|someone's|each other's|one another's|[a-z]+'s)";
const OBJ = "(?:me|you|him|her|it|us|them|one|someone|somebody|[a-z]+)";
const SELF = "(?:myself|yourself|himself|herself|itself|ourselves|yourselves|themselves|oneself)";
const HAVE = "(?:have|has|had|having|'ve|got|have got|has got|'ve got)";
const SLOT = /(?:^|\s)(?:one's|someone's|someone|oneself)(?=\s|$)/;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Past forms of the verbs idioms start with most.
const IRREGULAR = { make: "made", take: "took|taken", get: "got|gotten", give: "gave|given", go: "went|gone",
  keep: "kept", hold: "held", bite: "bit|bitten", throw: "threw|thrown", stick: "stuck", hang: "hung",
  leave: "left", pay: "paid", hear: "heard", lose: "lost", break: "broke|broken", see: "saw|seen",
  run: "ran", come: "came", bring: "brought", catch: "caught", tell: "told", say: "said", feel: "felt",
  stand: "stood", find: "found", sit: "sat", win: "won", eat: "ate|eaten", fall: "fell|fallen",
  spin: "spun", beat: "beaten", lead: "led", meet: "met", buy: "bought", do: "did|done|does" };

/** A verb and its forms: talk(s|ed|ing), make/making/made, stop/stopping. */
function verbForms(t) {
  const out = [`${esc(t)}(?:s|es|d|ed|ing)?`];
  if (/e$/.test(t)) out.push(`${esc(t.slice(0, -1))}ing`);
  if (/[^aeiou]y$/.test(t)) out.push(`${esc(t.slice(0, -1))}(?:ies|ied)`);
  if (/^[^aeiou]*[aeiou][bdgklmnprt]$/.test(t)) out.push(`${esc(t)}${t.at(-1)}(?:ed|ing)`);
  if (IRREGULAR[t]) out.push(IRREGULAR[t]);
  return `(?:${out.join("|")})`;
}

/** A RegExp for a headword with a person slot, or null if it has none. */
export function phrasePattern(word) {
  const w = word.toLowerCase().replace(/[‘’]/g, "'");
  if (!SLOT.test(w)) return null;
  const parts = w.split(/\s+/).map((t, i) => {
    if (t === "one's" || t === "someone's") return POSS;
    if (t === "someone") return OBJ;
    if (t === "oneself") return SELF;
    if (i === 0 && t === "have") return HAVE;
    if (i === 0) return verbForms(t);
    return esc(t);
  });
  return new RegExp(`(?:^|\\s)${parts.join("\\s+")}(?=$|[\\s.,!?])`);
}

/** Does the search (lowercased) say this slot headword in a real form? */
export function saysPhrase(word, query) {
  const re = phrasePattern(word);
  return !!re && re.test(query.toLowerCase().replace(/[‘’]/g, "'").trim());
}
