export interface ShapingInputPoint {
  x: number;
  y: number;
  timestamp: number;
}

export type ShapingMotion =
  | "stretch"
  | "compress"
  | "smooth-up"
  | "smooth-down"
  | "steady";

export interface SweptInputSample {
  profileY: number;
  deltaRadius: number;
  deltaHeight: number;
  durationSeconds: number;
  profileTravel: number;
  motion?: ShapingMotion;
}

export interface ShapingInputOptions {
  viewportWidth: number;
  viewportHeight?: number;
  profileCount: number;
  side: -1 | 1;
  minCutoff?: number;
  beta?: number;
  derivativeCutoff?: number;
  maxRadiusPerSecond?: number;
  maxHeightPerSecond?: number;
  maxProfileStep?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edgeStart: number, edgeEnd: number, value: number): number {
  const amount = clamp((value - edgeStart) / Math.max(0.0001, edgeEnd - edgeStart), 0, 1);
  return amount * amount * (3 - amount * 2);
}

/**
 * Keeps tiny cross-axis tremors quiet without reducing genuine diagonal input.
 * Once an axis contributes roughly one third of the path, it has full force.
 */
function componentWeight(component: number, otherComponent: number): number {
  const magnitude = Math.abs(component);
  const total = magnitude + Math.abs(otherComponent);
  if (magnitude < 0.2 || total < 0.2) return 0;
  return smoothstep(0.06, 0.32, magnitude / total);
}

/**
 * Chooses the dominant label shown by the studio guide. The actual deformation
 * remains two-dimensional: diagonal paths can change radius and height at once.
 */
export function classifyShapingMotion(
  deltaX: number,
  deltaY: number,
  side: -1 | 1
): ShapingMotion {
  const safeX = Number.isFinite(deltaX) ? deltaX : 0;
  const safeY = Number.isFinite(deltaY) ? deltaY : 0;
  const horizontal = Math.abs(safeX);
  const vertical = Math.abs(safeY);
  if (Math.max(horizontal, vertical) < 0.2) return "steady";
  if (horizontal >= vertical * 0.82) {
    return safeX * side >= 0 ? "stretch" : "compress";
  }
  return safeY < 0 ? "smooth-up" : "smooth-down";
}

function smoothingAlpha(cutoff: number, elapsedSeconds: number): number {
  const safeCutoff = Math.max(0.001, cutoff);
  const safeElapsed = clamp(elapsedSeconds, 1 / 240, 0.1);
  const tau = 1 / (Math.PI * 2 * safeCutoff);
  return 1 / (1 + tau / safeElapsed);
}

class LowPassFilter {
  private value = 0;
  private ready = false;

  reset(value: number) {
    this.value = Number.isFinite(value) ? value : 0;
    this.ready = true;
  }

  filter(value: number, alpha: number): number {
    const safeValue = Number.isFinite(value) ? value : this.value;
    if (!this.ready) {
      this.reset(safeValue);
      return this.value;
    }
    this.value = alpha * safeValue + (1 - alpha) * this.value;
    return this.value;
  }
}

/** Runtime-independent 1 EUR adaptive low-pass filter for touch coordinates. */
export class OneEuroFilter {
  private valueFilter = new LowPassFilter();
  private derivativeFilter = new LowPassFilter();
  private lastRaw = 0;
  private lastTimestamp = 0;
  private ready = false;

  constructor(
    private minCutoff = 2.35,
    private beta = 0.045,
    private derivativeCutoff = 1
  ) {}

  reset(value: number, timestamp: number) {
    const safeValue = Number.isFinite(value) ? value : 0;
    this.valueFilter.reset(safeValue);
    this.derivativeFilter.reset(0);
    this.lastRaw = safeValue;
    this.lastTimestamp = Number.isFinite(timestamp) ? timestamp : 0;
    this.ready = true;
  }

  filter(value: number, timestamp: number): number {
    if (!this.ready) {
      this.reset(value, timestamp);
      return Number.isFinite(value) ? value : 0;
    }

    const safeValue = Number.isFinite(value) ? value : this.lastRaw;
    const elapsedSeconds = normalizeElapsedSeconds(timestamp, this.lastTimestamp);
    const derivative = (safeValue - this.lastRaw) / elapsedSeconds;
    const filteredDerivative = this.derivativeFilter.filter(
      derivative,
      smoothingAlpha(this.derivativeCutoff, elapsedSeconds)
    );
    const cutoff = this.minCutoff + this.beta * Math.abs(filteredDerivative);
    const filtered = this.valueFilter.filter(
      safeValue,
      smoothingAlpha(cutoff, elapsedSeconds)
    );
    this.lastRaw = safeValue;
    this.lastTimestamp = normalizedTimestamp(timestamp, this.lastTimestamp, elapsedSeconds);
    return filtered;
  }
}

/** Protects the filter and rate limiter from repeated, reversed or stale timestamps. */
export function normalizeElapsedSeconds(timestamp: number, previousTimestamp: number): number {
  if (!Number.isFinite(previousTimestamp) || previousTimestamp <= 0) return 1 / 60;
  if (!Number.isFinite(timestamp)) return 1 / 60;
  const elapsed = (timestamp - previousTimestamp) / 1000;
  if (elapsed <= 0) return 1 / 120;
  // A busy phone can occasionally miss several touch frames. Preserve up to
  // 250 ms of real hand travel so the clay catches up instead of feeling
  // suddenly numb; larger gaps are treated as an app/background discontinuity.
  if (elapsed > 0.25) return 1 / 60;
  return clamp(elapsed, 1 / 240, 0.25);
}

function normalizedTimestamp(timestamp: number, previous: number, elapsedSeconds: number): number {
  if (!Number.isFinite(timestamp) || timestamp <= previous || timestamp - previous > 250) {
    return previous + elapsedSeconds * 1000;
  }
  return timestamp;
}

/**
 * Converts irregular touch events into a continuous, rate-limited 2D sweep.
 * Each segment's radial and vertical intent is divided among its resampled
 * points, so replaying at a higher event rate does not amplify deformation.
 */
export class ShapingInputSession {
  private readonly xFilter: OneEuroFilter;
  private readonly yFilter: OneEuroFilter;
  private readonly viewportWidth: number;
  private readonly viewportHeight: number;
  private readonly profileCount: number;
  private readonly side: -1 | 1;
  private readonly maxRadiusPerSecond: number;
  private readonly maxHeightPerSecond: number;
  private readonly maxProfileStep: number;
  private lastRaw: ShapingInputPoint | null = null;
  private lastFiltered: { x: number; y: number; profileY: number } | null = null;
  private lastTimestamp = 0;
  private lastHorizontalDirection = 0;
  private lastVerticalDirection = 0;
  private lastMotion: ShapingMotion = "steady";

  constructor(options: ShapingInputOptions) {
    this.viewportWidth = Math.max(280, options.viewportWidth || 0);
    this.viewportHeight = Math.max(
      320,
      options.viewportHeight || this.viewportWidth * 1.35
    );
    this.profileCount = Math.max(2, Math.round(options.profileCount || 0));
    this.side = options.side;
    this.maxRadiusPerSecond = clamp(options.maxRadiusPerSecond ?? 0.9, 0.05, 2);
    this.maxHeightPerSecond = clamp(options.maxHeightPerSecond ?? 1.35, 0.08, 2.4);
    this.maxProfileStep = clamp(options.maxProfileStep ?? 0.5, 0.2, 2);
    this.xFilter = new OneEuroFilter(
      options.minCutoff,
      options.beta,
      options.derivativeCutoff
    );
    this.yFilter = new OneEuroFilter(
      options.minCutoff,
      options.beta,
      options.derivativeCutoff
    );
  }

  begin(point: ShapingInputPoint, profileY: number) {
    const safePoint = this.safePoint(point, 0);
    const safeProfile = clamp(
      Number.isFinite(profileY) ? profileY : 0,
      0,
      this.profileCount - 1
    );
    this.xFilter.reset(safePoint.x, safePoint.timestamp);
    this.yFilter.reset(safePoint.y, safePoint.timestamp);
    this.lastRaw = safePoint;
    this.lastFiltered = { x: safePoint.x, y: safePoint.y, profileY: safeProfile };
    this.lastTimestamp = safePoint.timestamp;
    this.lastHorizontalDirection = 0;
    this.lastVerticalDirection = 0;
    this.lastMotion = "steady";
  }

  push(point: ShapingInputPoint, profileAtCanvasY: (canvasY: number) => number): SweptInputSample[] {
    if (!this.lastRaw || !this.lastFiltered) {
      const safe = this.safePoint(point, 0);
      this.begin(safe, profileAtCanvasY(safe.y));
      return [];
    }

    const safePoint = this.safePoint(point, this.lastTimestamp);
    const elapsedSeconds = normalizeElapsedSeconds(safePoint.timestamp, this.lastTimestamp);
    const rawDx = safePoint.x - this.lastRaw.x;
    const rawDy = safePoint.y - this.lastRaw.y;
    const motion = classifyShapingMotion(rawDx, rawDy, this.side);
    const horizontalMotion = motion === "stretch" || motion === "compress";
    const verticalMotion = motion === "smooth-up" || motion === "smooth-down";
    const previousWasHorizontal =
      this.lastMotion === "stretch" || this.lastMotion === "compress";
    const previousWasVertical =
      this.lastMotion === "smooth-up" || this.lastMotion === "smooth-down";
    const horizontalDirection = Math.abs(rawDx) >= 0.2 ? Math.sign(rawDx) : 0;
    const verticalDirection = Math.abs(rawDy) >= 0.2 ? Math.sign(rawDy) : 0;
    if (
      horizontalDirection &&
      this.lastHorizontalDirection &&
      horizontalDirection !== this.lastHorizontalDirection
    ) {
      // A direction reversal should not continue moving in the old direction.
      this.xFilter.reset(safePoint.x, safePoint.timestamp);
    }
    if (
      verticalDirection &&
      this.lastVerticalDirection &&
      verticalDirection !== this.lastVerticalDirection
    ) {
      this.yFilter.reset(safePoint.y, safePoint.timestamp);
    }

    // Once the hand has travelled vertically to a new working height, the
    // first inward/outward push must act exactly there. Without this axis
    // handoff the Y low-pass filter trails behind and makes the clay feel as if
    // it is being touched below the finger. The mirrored reset keeps a new
    // vertical sweep from inheriting stale horizontal momentum as well.
    if (horizontalMotion && previousWasVertical) {
      const contactProfileY = clamp(
        profileAtCanvasY(safePoint.y),
        0,
        this.profileCount - 1
      );
      this.yFilter.reset(safePoint.y, safePoint.timestamp);
      this.lastFiltered = {
        x: this.lastFiltered.x,
        y: safePoint.y,
        profileY: contactProfileY
      };
    } else if (verticalMotion && previousWasHorizontal) {
      this.xFilter.reset(safePoint.x, safePoint.timestamp);
      this.lastFiltered = {
        x: safePoint.x,
        y: this.lastFiltered.y,
        profileY: this.lastFiltered.profileY
      };
    }

    const filteredX = this.xFilter.filter(safePoint.x, safePoint.timestamp);
    const filteredY = this.yFilter.filter(safePoint.y, safePoint.timestamp);
    const nextProfileY = clamp(
      profileAtCanvasY(filteredY),
      0,
      this.profileCount - 1
    );
    const start = this.lastFiltered;
    const profileDistance = Math.abs(nextProfileY - start.profileY);
    const pixelDistance = Math.hypot(filteredX - start.x, filteredY - start.y);
    const sampleCount = clamp(
      Math.max(
        1,
        Math.ceil(profileDistance / this.maxProfileStep),
        Math.ceil(pixelDistance / 18)
      ),
      1,
      96
    );

    const horizontalVelocity = Math.abs(rawDx) / Math.max(elapsedSeconds, 1 / 240);
    const verticalVelocity = Math.abs(rawDy) / Math.max(elapsedSeconds, 1 / 240);
    const stableRawDx =
      horizontalVelocity < 4 ? 0 : rawDx * componentWeight(rawDx, rawDy);
    const stableRawDy =
      verticalVelocity < 4 ? 0 : rawDy * componentWeight(rawDy, rawDx);
    const requestedRadiusDelta = (stableRawDx * 0.9 * this.side) / this.viewportWidth;
    const requestedHeightDelta = (-stableRawDy * 1.65) / this.viewportHeight;
    const segmentRadiusDelta = clamp(
      requestedRadiusDelta,
      -this.maxRadiusPerSecond * elapsedSeconds,
      this.maxRadiusPerSecond * elapsedSeconds
    );
    const segmentHeightDelta = clamp(
      requestedHeightDelta,
      -this.maxHeightPerSecond * elapsedSeconds,
      this.maxHeightPerSecond * elapsedSeconds
    );
    const samples: SweptInputSample[] = [];
    for (let index = 0; index < sampleCount; index++) {
      const amount = (index + 0.5) / sampleCount;
      samples.push({
        profileY: start.profileY + (nextProfileY - start.profileY) * amount,
        deltaRadius: segmentRadiusDelta / sampleCount,
        deltaHeight: segmentHeightDelta / sampleCount,
        durationSeconds: elapsedSeconds / sampleCount,
        profileTravel: profileDistance / sampleCount,
        motion
      });
    }

    this.lastRaw = safePoint;
    this.lastFiltered = { x: filteredX, y: filteredY, profileY: nextProfileY };
    this.lastTimestamp = normalizedTimestamp(
      safePoint.timestamp,
      this.lastTimestamp,
      elapsedSeconds
    );
    if (horizontalDirection) this.lastHorizontalDirection = horizontalDirection;
    if (verticalDirection) this.lastVerticalDirection = verticalDirection;
    if (motion !== "steady") this.lastMotion = motion;
    return samples;
  }

  private safePoint(point: ShapingInputPoint, previousTimestamp: number): ShapingInputPoint {
    const timestamp = Number.isFinite(point.timestamp)
      ? point.timestamp
      : previousTimestamp + 1000 / 60;
    return {
      x: Number.isFinite(point.x) ? point.x : this.lastRaw?.x || 0,
      y: Number.isFinite(point.y) ? point.y : this.lastRaw?.y || 0,
      timestamp
    };
  }
}
