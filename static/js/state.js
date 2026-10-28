// App-wide state shared between modules.
import { api } from "./api.js";

export const settings = { accent: "us", autoplay: "1", speech_rate: "0.9", session_minutes: "15", new_per_day: "12",
                          word_levels: "1,2,3,4,5" };

export async function loadSettings() {
  Object.assign(settings, await api.get("/api/settings"));
  return settings;
}

export async function saveSettings(patch) {
  Object.assign(settings, await api.patch("/api/settings", patch));
  return settings;
}

// Practice filters (scope / rating / list), remembered separately for each tab.
const NO_FILTER = { stars: "", list_id: "", domain: "" };
export function loadFilter(tab) {
  try { return { ...NO_FILTER, ...JSON.parse(localStorage.getItem(`lexi-filter-${tab}`) || "{}") }; }
  catch (e) { return { ...NO_FILTER }; }
}
export function saveFilter(tab, filter) {
  try { localStorage.setItem(`lexi-filter-${tab}`, JSON.stringify(filter)); } catch (e) { /* storage unavailable */ }
}
