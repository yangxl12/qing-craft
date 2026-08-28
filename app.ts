import { loadSettings, saveSettings } from "./utils/settings";

App({
  onLaunch() {
    // Normalize legacy preferences once. The former `sound` flag is deliberately
    // dropped until an actual ambience engine exists.
    saveSettings(loadSettings());
  }
});
