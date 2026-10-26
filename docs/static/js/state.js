// App-wide state shared between modules.
import { api } from "./api.js";

export const settings = { accent: "us", autoplay: "1", speech_rate: "0.9", session_minutes: "15", new_per_day: "12" };

export async function loadSettings() {
  Object.assign(settings, await api.get("/api/settings"));
  return settings;
}

export async function saveSettings(patch) {
  Object.assign(settings, await api.patch("/api/settings", patch));
  return settings;
}

// Practice filters (stars / list / domain) remembered across practice tabs.
export const practiceFilter = { stars: "", list_id: "", domain: "" };
