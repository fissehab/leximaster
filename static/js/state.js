// App-wide state shared between modules.
import { api } from "./api.js";

export const settings = { accent: "us", autoplay: "1", speech_rate: "0.9", session_minutes: "15", new_per_day: "12",
                          word_levels: "2,3,4" };

export async function loadSettings() {
  Object.assign(settings, await api.get("/api/settings"));
  return settings;
}

export async function saveSettings(patch) {
  Object.assign(settings, await api.patch("/api/settings", patch));
  return settings;
}

// Study focus (Settings → Study, and the scope menu in Daily review): what
// Daily review and Home's count study ("" everything, "everyday", "core",
// a Bible track), and the scope every practice tab is set to when it changes.
// Kept in this browser.
const FOCUS_KEY = "lexi-review-track";
const PRACTICE_TABS = ["flashcards", "matching", "shooter", "rush", "typeit", "quiz", "listen", "pronounce"];
export function studyFocus() {
  try { return localStorage.getItem(FOCUS_KEY) || ""; } catch (e) { return ""; }
}
export function setStudyFocus(value) {
  try { localStorage.setItem(FOCUS_KEY, value); } catch (e) { return; }
  for (const tab of PRACTICE_TABS) saveFilter(tab, { ...loadFilter(tab), domain: value });
}

// Practice filters (scope / rating / list), remembered separately for each
// tab; a tab not used yet starts from the study focus.
const NO_FILTER = { stars: "", list_id: "", domain: "" };
export function loadFilter(tab) {
  try {
    const saved = localStorage.getItem(`lexi-filter-${tab}`);
    return { ...NO_FILTER, domain: studyFocus(), ...JSON.parse(saved || "{}") };
  } catch (e) { return { ...NO_FILTER }; }
}
export function saveFilter(tab, filter) {
  try { localStorage.setItem(`lexi-filter-${tab}`, JSON.stringify(filter)); } catch (e) { /* storage unavailable */ }
}
