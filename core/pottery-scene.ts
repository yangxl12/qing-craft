export const POTTERY_VERTICAL_FOV = 0.62;
export const POTTERY_BASE_SCREEN_Y = 0.7;
export const POTTERY_MIN_ZOOM_FACTOR = 0.62;
export const POTTERY_MAX_ZOOM_FACTOR = 2.2;
export const POTTERY_MIN_PITCH = 0.035;
export const POTTERY_MAX_PITCH = 0.78;
export const POTTERY_TURNTABLE_PERIOD_MS = 18000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Keeps long-running turntable and gesture angles numerically stable. */
export function normalizePotteryYaw(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const turn = Math.PI * 2;
  return ((angle + Math.PI) % turn + turn) % turn - Math.PI;
}

/**
 * One canvas-width of horizontal travel reveals a complete 360-degree orbit.
 * The mapping uses CSS pixels so it feels consistent across device DPRs.
 */
export function calculatePotteryOrbitDelta(
  dx: number,
  dy: number,
  viewportWidth: number,
  viewportHeight: number
): { yaw: number; pitch: number } {
  const safeDx = Number.isFinite(dx) ? dx : 0;
  const safeDy = Number.isFinite(dy) ? dy : 0;
  return {
    yaw: (safeDx / Math.max(1, viewportWidth)) * Math.PI * 2,
    pitch: (safeDy / Math.max(1, viewportHeight)) * 1.35
  };
}

/** Pinch-out enlarges the piece; pinch-in reduces it, with useful safe limits. */
export function calculatePotteryZoomFactor(current: number, pinchScale: number): number {
  const safeCurrent = Number.isFinite(current) ? current : 1;
  if (!Number.isFinite(pinchScale) || pinchScale <= 0) {
    return clamp(safeCurrent, POTTERY_MIN_ZOOM_FACTOR, POTTERY_MAX_ZOOM_FACTOR);
  }
  const stableScale = clamp(pinchScale, 0.75, 1.34);
  return clamp(
    safeCurrent / stableScale,
    POTTERY_MIN_ZOOM_FACTOR,
    POTTERY_MAX_ZOOM_FACTOR
  );
}

/** Advances by elapsed time so the wheel speed is independent of frame rate. */
export function advancePotteryTurntable(angle: number, elapsedMilliseconds: number): number {
  const safeElapsed = Number.isFinite(elapsedMilliseconds)
    ? Math.max(0, elapsedMilliseconds)
    : 0;
  return normalizePotteryYaw(
    angle + (Math.PI * 2 * safeElapsed) / POTTERY_TURNTABLE_PERIOD_MS
  );
}

/** A squat piece needs a slightly higher eye line so its opening still reads. */
export function defaultPotteryPitch(radius: number, height: number): number {
  const proportion = height / Math.max(radius * 2, 0.01);
  const squatness = clamp((0.85 - proportion) / 0.7, 0, 1);
  return 0.18 + squatness * 0.08;
}

/**
 * Fits the real profile bounds into a portrait canvas instead of relying on a
 * single hard-coded camera distance for cups, bowls, vases and plates alike.
 */
export function calculatePotteryCameraDistance(
  radius: number,
  height: number,
  aspect: number,
  pitch: number,
  verticalFill = 0.43,
  horizontalFill = 0.65
): number {
  const safeRadius = Math.max(0.01, radius);
  const safeHeight = Math.max(0.01, height);
  const safeAspect = clamp(aspect, 0.35, 3);
  const tangent = Math.tan(POTTERY_VERTICAL_FOV / 2);
  const projectedHalfHeight =
    (safeHeight / 2) * Math.cos(pitch) + safeRadius * Math.sin(pitch);
  const verticalDistance = projectedHalfHeight / (tangent * verticalFill);
  const horizontalDistance = safeRadius / (tangent * safeAspect * horizontalFill);
  return Math.max(verticalDistance, horizontalDistance, safeRadius * 1.8) * 1.04;
}

/**
 * Places the center of the foot on the same visual contact line as the wheel.
 * This prevents wide, low plates from floating near the middle of the canvas
 * while taller cups happen to reach the wheel by accident.
 */
export function calculatePotteryFocusY(
  height: number,
  distance: number,
  pitch: number,
  baseScreenY = POTTERY_BASE_SCREEN_Y,
  contactRadius = 0
): number {
  const bottomY = -Math.max(0.01, height) / 2;
  const ndcY = 1 - clamp(baseScreenY, 0.55, 0.8) * 2;
  const projectionScale = 1 / Math.tan(POTTERY_VERTICAL_FOV / 2);
  const denominator = projectionScale * Math.cos(pitch) + ndcY * Math.sin(pitch);
  const safeContactRadius = Math.max(0, Number.isFinite(contactRadius) ? contactRadius : 0);
  // Anchor the visible front edge of the foot, not its center axis. With an
  // elevated camera the front edge projects lower; ignoring it makes the pot
  // appear embedded in the wheel, especially after zooming in.
  const bottomRelativeToFocus =
    (ndcY * distance -
      ndcY * Math.cos(pitch) * safeContactRadius +
      projectionScale * Math.sin(pitch) * safeContactRadius) /
    denominator;
  return bottomY - bottomRelativeToFocus;
}
