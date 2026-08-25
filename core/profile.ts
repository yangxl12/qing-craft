import { ShapingMotion, SweptInputSample } from "./shaping-input";

export type ShapingTool = "finger" | "collar" | "smooth";
export type ShapingForm = "curve" | "cone" | "square";

export interface SweptDeformationOptions {
  tool?: ShapingTool;
  form?: ShapingForm;
  relaxed?: boolean;
  sigma?: number;
}

export interface VerticalThrowingResult {
  profile: number[];
  height: number;
}

const MIN_RADIUS = 0.18;
const MAX_RADIUS = 1.25;
const MIN_WALL = 0.075;
const MIN_HEIGHT = 0.45;
const MAX_HEIGHT = 1.8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteRadius(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0.5, MIN_RADIUS, MAX_RADIUS);
}

/** Three pressure footprints inspired by the curve/cone/square ribs in the reference. */
export function shapingKernelWeight(
  distance: number,
  sigma: number,
  form: ShapingForm
): number {
  const safeDistance = Math.abs(Number.isFinite(distance) ? distance : 0);
  const safeSigma = clamp(Number.isFinite(sigma) ? sigma : 3.6, 1.5, 8);
  if (form === "cone") {
    return clamp(1 - safeDistance / (safeSigma * 2.15), 0, 1);
  }
  if (form === "square") {
    const plateau = safeSigma * 0.72;
    const edge = safeSigma * 1.9;
    if (safeDistance <= plateau) return 1;
    const progress = clamp((safeDistance - plateau) / Math.max(0.001, edge - plateau), 0, 1);
    return 1 - progress * progress * (3 - progress * 2);
  }
  return Math.exp(-(safeDistance * safeDistance) / (2 * safeSigma * safeSigma));
}

/** Kept for discrete buttons and compatibility with existing callers. */
export function profileDeltaFromDrag(deltaPixels: number, viewportWidth: number): number {
  if (!Number.isFinite(deltaPixels)) return 0;
  const safeWidth = Math.max(280, Number.isFinite(viewportWidth) ? viewportWidth : 0);
  const capped = clamp(deltaPixels, -14, 14);
  return capped * (0.34 / safeWidth);
}

export function approximateProfileVolume(profile: number[]): number {
  return profile.reduce((total, radius) => total + finiteRadius(radius) ** 2, 0);
}

/** Radius, bidirectional slope and curvature protection for both authoring modes. */
export function constrainSlopeAndCurvature(profile: number[], relaxed: boolean): number[] {
  if (!profile.length) return [];
  const next = profile.map(finiteRadius);
  const maxSlope = relaxed ? 0.075 : 0.125;
  const maxCurvature = relaxed ? 0.052 : 0.095;

  next[0] = Math.max(0.28, next[0]);
  if (next.length > 1) next[1] = Math.max(next[0] * 0.94, next[1]);

  const limitSlope = () => {
    for (let index = 1; index < next.length; index++) {
      const delta = next[index] - next[index - 1];
      if (Math.abs(delta) > maxSlope) {
        next[index] = next[index - 1] + Math.sign(delta) * maxSlope;
      }
    }
    for (let index = next.length - 2; index >= 0; index--) {
      const delta = next[index] - next[index + 1];
      if (Math.abs(delta) > maxSlope) {
        next[index] = next[index + 1] + Math.sign(delta) * maxSlope;
      }
    }
  };

  for (let pass = 0; pass < 3; pass++) {
    limitSlope();
    const source = next.slice();
    for (let index = 2; index < next.length - 2; index++) {
      const curvature = source[index - 1] - source[index] * 2 + source[index + 1];
      if (Math.abs(curvature) > maxCurvature) {
        next[index] =
          (source[index - 1] +
            source[index + 1] -
            Math.sign(curvature) * maxCurvature) /
          2;
      }
    }
  }
  limitSlope();
  return next.map(finiteRadius);
}

export function constrainProfile(profile: number[], relaxed: boolean): number[] {
  return constrainSlopeAndCurvature(profile, relaxed);
}

function fairingPass(
  profile: number[],
  weights: number[],
  amount: number,
  rangeStart: number,
  rangeEnd: number
): number[] {
  const next = profile.slice();
  for (
    let index = Math.max(1, rangeStart);
    index <= Math.min(profile.length - 2, rangeEnd);
    index++
  ) {
    const structuralProtection = index < 2 || index > profile.length - 3 ? 0.22 : 1;
    const influence = clamp(weights[index], 0, 1) * structuralProtection;
    const previous2 = profile[Math.max(0, index - 2)];
    const previous = profile[index - 1];
    const current = profile[index];
    const following = profile[index + 1];
    const following2 = profile[Math.min(profile.length - 1, index + 2)];
    // A five-point bell filter removes the alternating dents left by repeated
    // finger pushes while retaining broad shoulders, bellies and foot rings.
    const fairRadius =
      (previous2 + previous * 4 + current * 6 + following * 4 + following2) / 16;
    next[index] = current + (fairRadius - current) * amount * influence;
  }
  return next;
}

/** Local, weighted curve fairing with bounded volume compensation. */
export function smoothProfileRange(
  profile: number[],
  centerStart: number,
  centerEnd: number,
  strength = 0.16,
  relaxed = true,
  sigma = 3.4
): number[] {
  if (profile.length < 3) return constrainSlopeAndCurvature(profile, relaxed);
  const safeStart = clamp(Math.min(centerStart, centerEnd), 0, profile.length - 1);
  const safeEnd = clamp(Math.max(centerStart, centerEnd), 0, profile.length - 1);
  const safeSigma = clamp(sigma, 1.5, 8);
  const rangeStart = Math.max(0, Math.floor(safeStart - safeSigma * 2));
  const rangeEnd = Math.min(profile.length - 1, Math.ceil(safeEnd + safeSigma * 2));
  const weights = profile.map((_, index) => {
    const distance = index < safeStart ? safeStart - index : index > safeEnd ? index - safeEnd : 0;
    return index < rangeStart || index > rangeEnd
      ? 0
      : Math.exp(-(distance * distance) / (2 * safeSigma * safeSigma));
  });
  const source = profile.map(finiteRadius);
  const beforeVolume = approximateProfileVolume(source.slice(rangeStart, rangeEnd + 1));
  const passStrength = clamp(strength, 0, 0.38);
  const fairingAmount = clamp(passStrength * 2.35, 0, 0.72);
  let next = fairingPass(source, weights, fairingAmount, rangeStart, rangeEnd);

  const afterVolume = approximateProfileVolume(next.slice(rangeStart, rangeEnd + 1));
  const volumeScale = clamp(
    Math.sqrt(beforeVolume / Math.max(afterVolume, 1e-6)),
    0.992,
    1.008
  );
  for (let index = rangeStart; index <= rangeEnd; index++) {
    const structuralProtection = index < 2 || index > profile.length - 3 ? 0.18 : 1;
    const correction = 1 + (volumeScale - 1) * weights[index] * structuralProtection;
    next[index] *= correction;
  }
  return constrainSlopeAndCurvature(next, relaxed);
}

/**
 * Raises or compresses the whole vessel while gently polishing its silhouette.
 * Pure vertical pulls approximate conservation of clay volume; diagonal pulls
 * relax that compensation so both hand directions remain visibly responsive.
 */
export function applyVerticalThrowing(
  profile: number[],
  height: number,
  samples: SweptInputSample[],
  relaxed = true
): VerticalThrowingResult {
  const source = constrainSlopeAndCurvature(profile, relaxed);
  const safeHeight = clamp(Number.isFinite(height) ? height : 1.1, MIN_HEIGHT, MAX_HEIGHT);
  const requestedHeightDelta = samples.reduce((total, sample) => {
    const delta = Number.isFinite(sample.deltaHeight) ? sample.deltaHeight : 0;
    return total + delta;
  }, 0);
  const nextHeight = clamp(safeHeight + requestedHeightDelta, MIN_HEIGHT, MAX_HEIGHT);
  const appliedHeightDelta = nextHeight - safeHeight;
  if (!source.length || Math.abs(appliedHeightDelta) < 1e-8) {
    return { profile: source, height: safeHeight };
  }

  const radialIntent = samples.reduce((total, sample) => {
    const delta = Number.isFinite(sample.deltaRadius) ? sample.deltaRadius : 0;
    return total + Math.abs(delta);
  }, 0);
  const heightIntent = samples.reduce((total, sample) => {
    const delta = Number.isFinite(sample.deltaHeight) ? sample.deltaHeight : 0;
    return total + Math.abs(delta);
  }, 0);
  const radialShare = radialIntent / Math.max(radialIntent + heightIntent, 1e-6);
  // Pure vertical throwing conserves clay volume. On a deliberate diagonal,
  // relax that coupling so the horizontal hand intent stays visibly present.
  const volumeCoupling = clamp(1 - radialShare * 2.5, 0.08, 1);
  const uniformScale = Math.sqrt(safeHeight / nextHeight);
  const responsiveScale = 1 + (uniformScale - 1) * volumeCoupling;
  let next = source.map((radius) => radius * responsiveScale);
  const targetClayVolume = approximateProfileVolume(next) * nextHeight;

  const verticalSamples = samples.filter((sample) => {
    if (!Number.isFinite(sample.profileY)) return false;
    const motion = sample.motion as ShapingMotion | undefined;
    return (
      Math.abs(Number.isFinite(sample.deltaHeight) ? sample.deltaHeight : 0) > 1e-8 ||
      motion === "smooth-up" ||
      motion === "smooth-down"
    );
  });
  const verticalDuration = verticalSamples.reduce((total, sample) => {
    if (!Number.isFinite(sample.deltaHeight) || Math.abs(sample.deltaHeight) < 1e-8) {
      return total;
    }
    return total + clamp(sample.durationSeconds || 0, 0, 0.1);
  }, 0);
  const verticalTravel = verticalSamples.reduce(
    (total, sample) => total + clamp(sample.profileTravel || 0, 0, source.length),
    0
  );
  const strokeStart = verticalSamples.length
    ? verticalSamples.reduce(
        (minimum, sample) => Math.min(minimum, clamp(sample.profileY, 0, source.length - 1)),
        source.length - 1
      )
    : 0;
  const strokeEnd = verticalSamples.length
    ? verticalSamples.reduce(
        (maximum, sample) => Math.max(maximum, clamp(sample.profileY, 0, source.length - 1)),
        0
      )
    : source.length - 1;
  const strokeDirection = verticalSamples.reduce((direction, sample) => {
    const delta = Number.isFinite(sample.deltaHeight) ? sample.deltaHeight : 0;
    if (Math.abs(delta) > 1e-8) return direction + delta;
    return direction + (sample.motion === "smooth-up" ? 0.001 : sample.motion === "smooth-down" ? -0.001 : 0);
  }, 0);
  const heightRatio = Math.abs(appliedHeightDelta) / Math.max(safeHeight, MIN_HEIGHT);
  const smoothingStrength = clamp(
    heightRatio * 4.8 + verticalDuration * 0.32 + verticalTravel * 0.0045,
    0.02,
    0.3
  );
  const smoothingPasses = Math.round(
    clamp(Math.ceil(verticalTravel / 9 + heightRatio / 0.045), 1, 3)
  );
  const lead = 4.2;
  const trail = 1.4;
  const rangeStart = strokeDirection < 0 ? strokeStart - lead : strokeStart - trail;
  const rangeEnd = strokeDirection > 0 ? strokeEnd + lead : strokeEnd + trail;
  for (let pass = 0; pass < smoothingPasses; pass++) {
    next = smoothProfileRange(next, rangeStart, rangeEnd, smoothingStrength, relaxed, 4.4);
  }
  // Rotation and water also soften the untouched silhouette a little, but this
  // pass stays deliberately weak so an intentional shoulder is not erased.
  next = smoothProfileRange(
    next,
    0,
    source.length - 1,
    clamp(heightRatio * 0.32, 0.004, 0.03),
    relaxed,
    5.2
  );

  // A small final correction prevents repeated pulls from creating or losing
  // noticeable material after the smoothing passes.
  const resultingClayVolume = approximateProfileVolume(next) * nextHeight;
  const volumeCorrection = clamp(
    Math.sqrt(targetClayVolume / Math.max(resultingClayVolume, 1e-6)),
    0.975,
    1.025
  );
  next = constrainSlopeAndCurvature(
    next.map((radius) => radius * volumeCorrection),
    relaxed
  );
  return { profile: next, height: nextHeight };
}

/** Applies one frame's path samples as a single swept deformation. */
export function applySweptDeformation(
  profile: number[],
  samples: SweptInputSample[],
  options: SweptDeformationOptions = {}
): number[] {
  const tool = options.tool || "finger";
  const form = options.form || "curve";
  const relaxed = options.relaxed !== false;
  const sigma = clamp(
    options.sigma ?? (tool === "collar" ? 4.5 : tool === "smooth" ? 3.4 : 3.6),
    1.5,
    8
  );
  const source = profile.map(finiteRadius);
  if (!samples.length || !source.length) return source;
  const delta = Array(source.length).fill(0) as number[];
  let minY = source.length - 1;
  let maxY = 0;
  let totalDuration = 0;
  let totalTravel = 0;
  let totalRadialIntent = 0;
  let smoothMinY = source.length - 1;
  let smoothMaxY = 0;
  let smoothDuration = 0;
  let smoothTravel = 0;
  let smoothHeightIntent = 0;
  let smoothDirection = 0;

  for (const sample of samples) {
    if (!Number.isFinite(sample.profileY)) continue;
    const profileY = clamp(sample.profileY, 0, source.length - 1);
    minY = Math.min(minY, profileY);
    maxY = Math.max(maxY, profileY);
    totalDuration += clamp(sample.durationSeconds || 0, 0, 0.1);
    totalTravel += clamp(sample.profileTravel || 0, 0, source.length);
    totalRadialIntent += Math.abs(sample.deltaRadius || 0);
    const motion = sample.motion as ShapingMotion | undefined;
    const heightDelta = Number.isFinite(sample.deltaHeight) ? sample.deltaHeight : 0;
    const directionalSmooth = motion === "smooth-up" || motion === "smooth-down";
    const smoothSample = tool === "smooth" || directionalSmooth || Math.abs(heightDelta) > 1e-8;
    if (smoothSample) {
      smoothMinY = Math.min(smoothMinY, profileY);
      smoothMaxY = Math.max(smoothMaxY, profileY);
      smoothDuration += clamp(sample.durationSeconds || 0, 0, 0.1);
      smoothTravel += clamp(sample.profileTravel || 0, 0, source.length);
      smoothHeightIntent += Math.abs(heightDelta);
      if (heightDelta > 0 || motion === "smooth-up") {
        smoothDirection += sample.profileTravel || Math.abs(heightDelta) * 10 || 0.01;
      } else if (heightDelta < 0 || motion === "smooth-down") {
        smoothDirection -= sample.profileTravel || Math.abs(heightDelta) * 10 || 0.01;
      }
    }
    let radialDelta = Number.isFinite(sample.deltaRadius) ? sample.deltaRadius : 0;
    if (tool === "smooth") radialDelta = 0;
    if (tool === "collar") {
      radialDelta = -Math.max(
        Math.abs(radialDelta) * 0.82,
        clamp(sample.profileTravel || 0, 0, 2) * 0.00072
      );
    }
    for (let index = 0; index < source.length; index++) {
      const distance = index - profileY;
      let weight =
        tool === "finger"
          ? shapingKernelWeight(distance, sigma, form)
          : Math.exp(-(distance * distance) / (2 * sigma * sigma));
      if (tool === "collar" && distance > 0) weight *= 1.16;
      delta[index] += radialDelta * weight;
    }
  }

  let next = source.map((radius, index) => radius + delta[index]);
  const mostlyVertical = totalTravel > 0.3 && totalRadialIntent < totalTravel * 0.00035;
  const smoothingStrength =
    tool === "smooth"
      ? clamp(totalDuration * 1.25 + totalTravel * 0.01, 0.018, 0.34)
      : tool === "collar"
        ? clamp(totalDuration * 0.25, 0, 0.05)
        : smoothDuration > 0
          ? clamp(
              smoothDuration * 1.2 + smoothTravel * 0.009 + smoothHeightIntent * 1.15,
              0.016,
              0.3
            )
        : mostlyVertical
          ? clamp(totalDuration * 0.28 + totalTravel * 0.0012, 0, 0.055)
          : 0;
  next = constrainSlopeAndCurvature(next, relaxed);
  if (smoothingStrength > 0) {
    const directional = smoothMinY <= smoothMaxY;
    const rangeStart = directional ? smoothMinY : minY;
    const rangeEnd = directional ? smoothMaxY : maxY;
    if (rangeStart <= rangeEnd) {
      const lead = sigma * 0.72;
      const trail = sigma * 0.18;
      const start =
        smoothDirection < 0 ? rangeStart - lead : rangeStart - trail;
      const end = smoothDirection > 0 ? rangeEnd + lead : rangeEnd + trail;
      next = smoothProfileRange(next, start, end, smoothingStrength, relaxed, sigma);
    }
  }
  if (tool === "finger" && totalRadialIntent > 0 && minY <= maxY) {
    // A wet rotating wall yields around the fingertip instead of leaving a
    // single pinched ring. This light finishing pass keeps inward/outward
    // pushes responsive while blending their edges into the side curve.
    const radialFairing = clamp(
      totalDuration * 0.08 + totalRadialIntent * 1.25,
      0.006,
      0.075
    );
    next = smoothProfileRange(next, minY, maxY, radialFairing, relaxed, sigma * 0.9);
  }
  return next;
}

/** Keeps the previous wall thickness while the outer silhouette moves. */
export function synchronizeInnerWall(
  previousOuter: number[],
  nextOuter: number[],
  innerRadius: number[]
): number[] {
  return nextOuter.map((outer, index) => {
    const safeOuter = finiteRadius(outer);
    const previousInner = innerRadius[index];
    if (index < 2 || !Number.isFinite(previousInner) || previousInner <= 0.035) return 0;
    const previousWall = (previousOuter[index] || safeOuter) - previousInner;
    const wall = clamp(Number.isFinite(previousWall) ? previousWall : 0.11, MIN_WALL, 0.22);
    return clamp(safeOuter - wall, 0.035, Math.max(0.035, safeOuter - MIN_WALL));
  });
}

export function deformProfile(
  profile: number[],
  center: number,
  delta: number,
  strength = 0.12,
  relaxed = true
): number[] {
  const safeDelta = clamp(Number.isFinite(delta) ? delta : 0, -strength, strength);
  return applySweptDeformation(
    profile,
    [{
      profileY: center,
      deltaRadius: safeDelta,
      deltaHeight: 0,
      durationSeconds: 1 / 60,
      profileTravel: 0
    }],
    { tool: "finger", relaxed }
  );
}

export function smoothProfile(profile: number[]): number[] {
  return smoothProfileRange(profile, 0, Math.max(0, profile.length - 1), 0.2, true);
}
