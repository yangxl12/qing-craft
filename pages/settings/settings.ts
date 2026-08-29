import {
  DEFAULT_SETTINGS,
  loadSettings,
  QualityLevel,
  saveSettings,
  UserSettings
} from "../../utils/settings";

const QUALITY_OPTIONS = [
  { value:"low", label:"流畅" },
  { value:"medium", label:"均衡" },
  { value:"high", label:"精细" }
] as const;

Page({
  data: {
    settings: { ...DEFAULT_SETTINGS } as UserSettings,
    qualityOptions: QUALITY_OPTIONS,
    saveState: ""
  },
  saveTimer: undefined as ReturnType<typeof setTimeout> | undefined,

  onShow() {
    this.setData({ settings:loadSettings() });
  },

  onUnload() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
  },

  toggle(e: WechatMiniprogramTouchEvent) {
    const key = e.currentTarget.dataset.key as "haptics" | "reduceMotion";
    if (key !== "haptics" && key !== "reduceMotion") return;
    const value = typeof e.detail?.value === "boolean"
      ? e.detail.value
      : !this.data.settings[key];
    const label = key === "haptics" ? "轻触反馈" : "减少动态效果";
    this.persist({ ...this.data.settings, [key]:value }, `${label}已保存`);
  },

  setQuality(e: WechatMiniprogramTouchEvent) {
    const value = e.detail?.value as QualityLevel;
    if (!QUALITY_OPTIONS.some((option) => option.value === value)) return;
    this.persist({ ...this.data.settings, quality:value }, "画质偏好已保存");
  },

  persist(settings: UserSettings, saveState: string) {
    const saved = saveSettings(settings);
    this.setData({ settings:saved, saveState });
    if (saved.haptics) wx.vibrateShort({ type:"light" });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.setData({ saveState:"" });
      this.saveTimer = undefined;
    }, 1600);
  }
});
