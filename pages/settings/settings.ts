import {
  DEFAULT_SETTINGS,
  GuidanceLevel,
  loadSettings,
  QualityLevel,
  saveSettings,
  UserSettings
} from "../../utils/settings";

Page({
  data: {
    settings: { ...DEFAULT_SETTINGS } as UserSettings
  },
  onLoad() {
    this.setData({ settings: loadSettings() });
  },
  toggle(e: WechatMiniprogramTouchEvent) {
    const key = e.currentTarget.dataset.key as "haptics" | "reduceMotion";
    if (key !== "haptics" && key !== "reduceMotion") return;
    const value = typeof e.detail?.value === "boolean"
      ? e.detail.value
      : !this.data.settings[key];
    const settings = saveSettings({ ...this.data.settings, [key]:value });
    this.setData({ settings });
  },
  setValue(e: WechatMiniprogramTouchEvent) {
    const key = e.currentTarget.dataset.key;
    const value = e.currentTarget.dataset.value;
    let settings: UserSettings;
    if (key === "guidance") {
      settings = saveSettings({ ...this.data.settings, guidance:value as GuidanceLevel });
    } else if (key === "quality") {
      settings = saveSettings({ ...this.data.settings, quality:value as QualityLevel });
    } else {
      return;
    }
    this.setData({ settings });
  }
});
