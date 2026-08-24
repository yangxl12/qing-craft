export interface ShapingInputPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface SweptInputSample {
  profileY: number;
  deltaRadius: number;
  durationSeconds: number;
  profileTravel: number;
}

export interface ShapingInputOptions {
  viewportWidth: number;
  profileCount: number;
  side: -1 | 1;
  minCutoff?: number;
  beta?: number;
  derivativeCutoff?: number;
  maxRadiusPerSecond?: number;
  maxProfileStep?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
    private minCutoff = 1.55,
    private beta = 0.022,
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
  if (elapsed > 0.1) return 1 / 60;
  return clamp(elapsed, 1 / 240, 0.1);
}

function normalizedTimestamp(timestamp: number, previous: number, elapsedSeconds: number): number {
  if (!Number.isFinite(timestamp) || timestamp <= previous || timestamp - previous > 100) {
    return previous + elapsedSeconds * 1000;
  }
  return timestamp;
}

/**
 * Converts irregular touch events into a continuous, rate-limited sweep. Each
 * segment's radial intent is divided among its resampled points, so replaying
 * the same path at a higher event rate does not amplify the deformation.
 */
export class ShapingInputSession {
  private readonly xFilter: OneEuroFilter;
  private readonly yFilter: OneEuroFilter;
  private readonly viewportWidth: number;
  private readonly profileCount: number;
  private readonly side: -1 | 1;
  private readonly maxRadiusPerSecond: number;
  private readonly maxProfileStep: number;
  private lastRaw: ShapingInputPoint | null = null;
  private lastFiltered: { x: number; y: number; profileY: number } | null = null;
  private lastTimestamp = 0;
  private lastHorizontalDirection = 0;

  constructor(options: ShapingInputOptions) {
    this.viewportWidth = Math.max(280, options.viewportWidth || 0);
    this.profileCount = Math.max(2, Math.round(options.profileCount || 0));
    this.side = options.side;
    this.maxRadiusPerSecond = clamp(options.maxRadiusPerSecond ?? 0.28, 0.05, 1);
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
    const direction = Math.abs(rawDx) >= 0.2 ? Math.sign(rawDx) : 0;
    if (
      direction &&
      this.lastHorizontalDirection &&
      direction !== this.lastHorizontalDirection
    ) {
      // A direction reversal should not continue moving in the old direction.
      this.xFilter.reset(safePoint.x, safePoint.timestamp);
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
    const stableRawDx = horizontalVelocity < 4 ? 0 : rawDx;
    const requestedDelta = (stableRawDx * 0.34 * this.side) / this.viewportWidth;
    const segmentDelta = clamp(
      requestedDelta,
      -this.maxRadiusPerSecond * elapsedSeconds,
      this.maxRadiusPerSecond * elapsedSeconds
    );
    const samples: SweptInputSample[] = [];
    for (let index = 0; index < sampleCount; index++) {
      const amount = (index + 0.5) / sampleCount;
      samples.push({
        profileY: start.profileY + (nextProfileY - start.profileY) * amount,
        deltaRadius: segmentDelta / sampleCount,
        durationSeconds: elapsedSeconds / sampleCount,
        profileTravel: profileDistance / sampleCount
      });
    }

    this.lastRaw = safePoint;
    this.lastFiltered = { x: filteredX, y: filteredY, profileY: nextProfileY };
    this.lastTimestamp = normalizedTimestamp(
      safePoint.timestamp,
      this.lastTimestamp,
      elapsedSeconds
    );
    if (direction) this.lastHorizontalDirection = direction;
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
