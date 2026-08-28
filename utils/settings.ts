export type GuidanceLevel = "relaxed" | "necessary" | "free";
export type QualityLevel = "low" | "medium" | "high";
export type GuidanceHintKind = "teaching" | "risk" | "error";

export interface UserSettings {
  haptics: boolean;
  quality: QualityLevel;
  guidance: GuidanceLevel;
  reduceMotion: boolean;
}

export const SETTINGS_STORAGE_KEY = "palm-kiln-settings";

export const DEFAULT_SETTINGS: UserSettings = {
  haptics: true,
  quality: "medium",
  guidance: "relaxed",
  reduceMotion: false
};

const GUIDANCE_LEVELS: GuidanceLevel[] = ["relaxed", "necessary", "free"];
const QUALITY_LEVELS: QualityLevel[] = ["low", "medium", "high"];

export function normalizeSettings(value: unknown): UserSettings {
  const source = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const guidance = GUIDANCE_LEVELS.includes(source.guidance as GuidanceLevel)
    ? source.guidance as GuidanceLevel
    : DEFAULT_SETTINGS.guidance;
  const quality = QUALITY_LEVELS.includes(source.quality as QualityLevel)
    ? source.quality as QualityLevel
    : DEFAULT_SETTINGS.quality;
  return {
    haptics: typeof source.haptics === "boolean" ? source.haptics : DEFAULT_SETTINGS.haptics,
    quality,
    guidance,
    reduceMotion: typeof source.reduceMotion === "boolean"
      ? source.reduceMotion
      : DEFAULT_SETTINGS.reduceMotion
  };
}

export function loadSettings(): UserSettings {
  return normalizeSettings(wx.getStorageSync(SETTINGS_STORAGE_KEY));
}

export function saveSettings(settings: UserSettings): UserSettings {
  const normalized = normalizeSettings(settings);
  wx.setStorageSync(SETTINGS_STORAGE_KEY, normalized);
  return normalized;
}

export function shouldShowGuidance(
  guidance: GuidanceLevel,
  kind: GuidanceHintKind
): boolean {
  if (kind === "error" || kind === "risk") return true;
  return guidance === "relaxed";
}
