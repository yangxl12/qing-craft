export const POTTERY_VERTICAL_FOV = 0.62;
export const POTTERY_BASE_SCREEN_Y = 0.74;
// Deep zoom magnifies a local patch of the surface for fine-tuning (and later
// manual carving); the engine adds a shape-aware floor on top of this bound.
export const POTTERY_MIN_ZOOM_FACTOR = 0.12;
export const POTTERY_MAX_ZOOM_FACTOR = 4;
// Between these zoom factors the orbit focus eases from the wheel contact
// line towards the body center so a magnified view can reach every region.
export const POTTERY_DETAIL_FOCUS_START = 0.55;
export const POTTERY_DETAIL_FOCUS_END = 0.24;
// The controls sit at the sides, so a lifted form can safely use more of the
// clear center column before the camera starts pulling back.
export const POTTERY_MANIPULATION_VERTICAL_FILL = 0.72;
// The whole sphere is reachable: passing over the mouth or under the foot
// flips the piece completely upside down. potteryOrbitUpVector keeps lookAt
// stable across the poles, so the pitch never has to stop at the horizon.
export const POTTERY_MIN_PITCH = -Math.PI;
export const POTTERY_MAX_PITCH = Math.PI;
export const POTTERY_TURNTABLE_PERIOD_MS = 60000 / 38;

export type PotteryRotationState = "idle" | "shaping" | "orbit" | "reduced";

export interface PotteryTurntableFrame {
  angle: number;
  rpm: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Keeps long-running turntable and gesture angles numerically stable. */
export function normalizePotteryYaw(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const turn = Math.PI * 2;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

/**
 * Keeps vertical orbit continuous after every full turn. Pitch represents a
 * periodic orientation, so wrapping it is equivalent to the same camera pose
 * without the old hard stop at -PI/PI.
 */
export function normalizePotteryPitch(angle: number): number {
  return normalizePotteryYaw(angle);
}

/** Short screens keep the contact line clear of the process rail and tray. */
export function calculatePotteryBaseScreenY(viewportHeight: number): number {
  const safeHeight = Number.isFinite(viewportHeight) ? viewportHeight : 812;
  return clamp(0.72 + ((safeHeight - 568) / (932 - 568)) * 0.03, 0.72, 0.75);
}

/** Aligns the WebGL foot with the measured center contact line of the CSS turntable. */
export function calculatePotteryBaseScreenYFromLayout(
  canvasTop: number,
  canvasHeight: number,
  contactLineY: number,
): number {
  const safeHeight = Number.isFinite(canvasHeight)
    ? Math.max(1, canvasHeight)
    : 1;
  if (!Number.isFinite(canvasTop) || !Number.isFinite(contactLineY)) {
    return POTTERY_BASE_SCREEN_Y;
  }
  return clamp((contactLineY - canvasTop) / safeHeight, 0.6, 0.93);
}

/** Wider clay has a lower target RPM so its edge keeps a controllable speed. */
export function calculatePotteryTargetRpm(
  maxRadius: number,
  state: PotteryRotationState,
): number {
  if (state === "reduced") return 0;
  const width = clamp((maxRadius - 0.55) / (1.1 - 0.55), 0, 1);
  if (state === "shaping") return 30 + (22 - 30) * width;
  if (state === "orbit") return 24 + (18 - 24) * width;
  return 44 + (32 - 44) * width;
}

export function potteryRpmToPeriodMs(rpm: number): number {
  return rpm > 0 ? 60000 / rpm : 0;
}

/**
 * One canvas-width of horizontal travel reveals a complete 360-degree orbit,
 * and one canvas-height of vertical travel pitches the camera half a turn, so
 * a continued drag keeps flipping past the mouth or foot into a fully
 * upside-down view. The mapping uses CSS pixels so it feels consistent
 * across device DPRs.
 */
export function calculatePotteryOrbitDelta(
  dx: number,
  dy: number,
  viewportWidth: number,
  viewportHeight: number,
): { yaw: number; pitch: number } {
  const safeDx = Number.isFinite(dx) ? dx : 0;
  const safeDy = Number.isFinite(dy) ? dy : 0;
  return {
    yaw: (safeDx / Math.max(1, viewportWidth)) * Math.PI * 2,
    pitch: (safeDy / Math.max(1, viewportHeight)) * Math.PI,
  };
}

/**
 * Camera up vector for the spherical orbit. Tilting the up vector together
 * with the pitch lets lookAt pass smoothly over the top and bottom poles, so
 * the piece can be viewed fully flipped instead of stopping at the horizon.
 */
export function potteryOrbitUpVector(pitch: number, yaw: number): number[] {
  const safePitch = Number.isFinite(pitch) ? pitch : 0;
  const safeYaw = Number.isFinite(yaw) ? yaw : 0;
  return [
    -Math.sin(safePitch) * Math.sin(safeYaw),
    Math.cos(safePitch),
    -Math.sin(safePitch) * Math.cos(safeYaw),
  ];
}

export interface PotteryScreenTangent {
  x: number;
  y: number;
}

/**
 * Converts a finger drag into surface (u, v) movement by inverting the
 * on-screen projection of the surface tangents, so a pattern follows the
 * finger at any camera angle, zoom or turntable rotation — including fully
 * flipped views. Returns zero movement when the local projection is
 * degenerate (grazing the silhouette) instead of jumping the pattern.
 */
export function solvePotterySurfaceDrag(
  dx: number,
  dy: number,
  uTangent: PotteryScreenTangent,
  vTangent: PotteryScreenTangent,
): { du: number; dv: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { du: 0, dv: 0 };
  const determinant = uTangent.x * vTangent.y - vTangent.x * uTangent.y;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-4) {
    return { du: 0, dv: 0 };
  }
  const du = (dx * vTangent.y - dy * vTangent.x) / determinant;
  const dv = (uTangent.x * dy - uTangent.y * dx) / determinant;
  const limit = 0.4;
  return {
    du: clamp(du, -limit, limit),
    dv: clamp(dv, -limit, limit),
  };
}

/** Pinch-out enlarges the piece; pinch-in reduces it, with useful safe limits. */
export function calculatePotteryZoomFactor(
  current: number,
  pinchScale: number,
): number {
  const safeCurrent = Number.isFinite(current) ? current : 1;
  if (!Number.isFinite(pinchScale) || pinchScale <= 0) {
    return clamp(safeCurrent, POTTERY_MIN_ZOOM_FACTOR, POTTERY_MAX_ZOOM_FACTOR);
  }
  const stableScale = clamp(pinchScale, 0.75, 1.34);
  return clamp(
    safeCurrent / stableScale,
    POTTERY_MIN_ZOOM_FACTOR,
    POTTERY_MAX_ZOOM_FACTOR,
  );
}

/** Advances by elapsed time so the wheel speed is independent of frame rate. */
export function advancePotteryTurntable(
  angle: number,
  elapsedMilliseconds: number,
  rpm = 60000 / POTTERY_TURNTABLE_PERIOD_MS,
): number {
  const safeElapsed = Number.isFinite(elapsedMilliseconds)
    ? Math.max(0, elapsedMilliseconds)
    : 0;
  return normalizePotteryYaw(
    angle + (Math.PI * 2 * safeElapsed * Math.max(0, rpm)) / 60000,
  );
}

/** Smooth target-speed changes while preserving frame-rate-independent angle. */
export function advancePotteryTurntableFrame(
  angle: number,
  currentRpm: number,
  targetRpm: number,
  elapsedMilliseconds: number,
): PotteryTurntableFrame {
  const elapsed = clamp(
    Number.isFinite(elapsedMilliseconds) ? elapsedMilliseconds : 0,
    0,
    50,
  );
  const safeCurrent = Math.max(0, Number.isFinite(currentRpm) ? currentRpm : 0);
  const safeTarget = Math.max(0, Number.isFinite(targetRpm) ? targetRpm : 0);
  if (!elapsed) return { angle: normalizePotteryYaw(angle), rpm: safeCurrent };
  const transitionMs = safeTarget < safeCurrent ? 270 : 410;
  const blend = 1 - Math.exp(-elapsed / transitionMs);
  const nextRpm = safeCurrent + (safeTarget - safeCurrent) * blend;
  return {
    angle: advancePotteryTurntable(
      angle,
      elapsed,
      (safeCurrent + nextRpm) * 0.5,
    ),
    rpm: Math.abs(nextRpm - safeTarget) < 0.01 ? safeTarget : nextRpm,
  };
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
  horizontalFill = 0.65,
): number {
  const safeRadius = Math.max(0.01, radius);
  const safeHeight = Math.max(0.01, height);
  const safeAspect = clamp(aspect, 0.35, 3);
  const tangent = Math.tan(POTTERY_VERTICAL_FOV / 2);
  const projectedHalfHeight =
    (safeHeight / 2) * Math.abs(Math.cos(pitch)) +
    safeRadius * Math.abs(Math.sin(pitch));
  const verticalDistance = projectedHalfHeight / (tangent * verticalFill);
  const horizontalDistance =
    safeRadius / (tangent * safeAspect * horizontalFill);
  return (
    Math.max(verticalDistance, horizontalDistance, safeRadius * 1.8) * 1.04
  );
}

/**
 * Keeps the piece at the same CSS-pixel scale when an editor drawer changes
 * the canvas height. Perspective projection is measured against viewport
 * height, so the camera distance must change by the same ratio.
 */
export function calculatePreservedPotteryCameraDistance(
  previousDistance: number,
  previousViewportHeight: number,
  nextViewportHeight: number,
): number {
  const safeDistance = Math.max(
    0.01,
    Number.isFinite(previousDistance) ? previousDistance : 0.01,
  );
  const previousHeight = Math.max(
    1,
    Number.isFinite(previousViewportHeight) ? previousViewportHeight : 1,
  );
  const nextHeight = Math.max(
    1,
    Number.isFinite(nextViewportHeight) ? nextViewportHeight : 1,
  );
  return safeDistance * (nextHeight / previousHeight);
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
  contactRadius = 0,
): number {
  const bottomY = -Math.max(0.01, height) / 2;
  const ndcY = 1 - clamp(baseScreenY, 0.55, 0.93) * 2;
  const projectionScale = 1 / Math.tan(POTTERY_VERTICAL_FOV / 2);
  // At near-polar views a fixed bottom contact line becomes geometrically
  // singular. Smoothly release that anchor and orbit around the clay's center;
  // returning to a working angle settles the foot back onto the wheel.
  const absolutePitch = Math.abs(pitch);
  const releaseProgress = clamp((absolutePitch - 0.82) / 0.34, 0, 1);
  const easedRelease =
    releaseProgress * releaseProgress * (3 - releaseProgress * 2);
  const anchorStrength = 1 - easedRelease;
  if (anchorStrength <= 0) return 0;
  const anchorPitch = clamp(pitch, -1.05, 1.05);
  const denominator =
    projectionScale * Math.cos(anchorPitch) + ndcY * Math.sin(anchorPitch);
  if (Math.abs(denominator) < 0.08) return 0;
  const safeContactRadius = Math.max(
    0,
    Number.isFinite(contactRadius) ? contactRadius : 0,
  );
  // Anchor the visible front edge of the foot, not its center axis. With an
  // elevated camera the front edge projects lower; ignoring it makes the pot
  // appear embedded in the wheel, especially after zooming in.
  const bottomRelativeToFocus =
    (ndcY * distance -
      ndcY * Math.cos(anchorPitch) * safeContactRadius +
      projectionScale * Math.sin(anchorPitch) * safeContactRadius) /
    denominator;
  return (bottomY - bottomRelativeToFocus) * anchorStrength;
}
