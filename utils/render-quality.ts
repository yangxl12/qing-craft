import { QualityLevel } from "./settings";

const DPR_CAPS: Record<QualityLevel, number> = {
  low: 1,
  medium: 1.5,
  high: 2
};

/**
 * Keep render load aligned with the visible quality setting. Geometry detail is
 * selected inside PotteryEngine; this cap controls the second large cost: the
 * number of WebGL pixels rendered for each frame.
 */
export function resolveRenderDpr(devicePixelRatio: number, quality: QualityLevel): number {
  const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
  return Math.min(safeDpr, DPR_CAPS[quality] || DPR_CAPS.medium);
}
