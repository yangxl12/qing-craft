export interface WindowMetricsInput {
  windowWidth?: number;
  statusBarHeight?: number;
}

export interface CapsuleMetricsInput {
  top?: number;
  bottom?: number;
  left?: number;
  height?: number;
}

export interface UiMetrics {
  statusBarHeight: number;
  navigationBarHeight: number;
  navigationTop: number;
  contentTop: number;
  capsulePadding: number;
  capsuleBottom: number;
}

export function calculateUiMetrics(
  windowInfo: WindowMetricsInput = {},
  capsule: CapsuleMetricsInput = {}
): UiMetrics {
  const windowWidth = positive(windowInfo.windowWidth, 375);
  const statusBarHeight = positive(windowInfo.statusBarHeight, 20);
  const capsuleHeight = positive(capsule.height, 32);
  const navigationBarHeight = Math.max(44, Math.round(capsuleHeight + 12));
  const capsuleTop = positive(capsule.top, statusBarHeight);
  const navigationTop = Math.max(
    statusBarHeight,
    Math.round(capsuleTop - (navigationBarHeight - capsuleHeight) / 2)
  );
  const capsuleBottom = positive(capsule.bottom, capsuleTop + capsuleHeight);
  const capsulePadding = capsule.left && capsule.left > 0
    ? Math.max(96, Math.round(windowWidth - capsule.left + 12))
    : 96;
  return {
    statusBarHeight,
    navigationBarHeight,
    navigationTop,
    contentTop:navigationTop + navigationBarHeight,
    capsulePadding,
    capsuleBottom
  };
}

export function resolveUiMetrics(): UiMetrics {
  let windowInfo: WindowMetricsInput = {};
  let capsule: CapsuleMetricsInput = {};
  try {
    windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    capsule = wx.getMenuButtonBoundingClientRect
      ? wx.getMenuButtonBoundingClientRect()
      : {};
  } catch (_error) {
    // Keep conservative defaults when the platform APIs are unavailable.
  }
  return calculateUiMetrics(windowInfo, capsule);
}

/** Places an overlay control below the native WeChat capsule button. */
export function calculateBelowCapsuleTop(
  statusBarHeight: number,
  capsuleBottom: number,
  gap = 12,
): number {
  const safeStatusBar = positive(statusBarHeight, 20);
  const safeCapsuleBottom = positive(capsuleBottom, safeStatusBar + 32);
  return Math.max(
    72,
    Math.round(safeCapsuleBottom + Math.max(8, gap)),
  );
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
