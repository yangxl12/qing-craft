import { clayColor, glazeColor, PotteryWork } from "./model";
import {
  borderRepeatCount,
  decorationColorHex,
  MAX_SEAL_MARK_CHARACTERS,
  MIN_DECORATION_SURFACE_V,
  motifShaderCode,
  SEAL_MARK_COLORS
} from "./decoration";
import { buildPotteryMesh } from "./pottery-mesh";
import {
  advancePotteryTurntableFrame,
  calculatePotteryOrbitDelta,
  calculatePotteryCameraDistance,
  calculatePotteryFocusY,
  calculatePreservedPotteryCameraDistance,
  calculatePotteryTargetRpm,
  calculatePotteryZoomFactor,
  defaultPotteryPitch,
  normalizePotteryPitch,
  normalizePotteryYaw,
  potteryOrbitUpVector,
  POTTERY_BASE_SCREEN_Y,
  POTTERY_DETAIL_FOCUS_END,
  POTTERY_DETAIL_FOCUS_START,
  POTTERY_MANIPULATION_VERTICAL_FILL,
  POTTERY_MAX_ZOOM_FACTOR,
  POTTERY_MIN_ZOOM_FACTOR,
  POTTERY_VERTICAL_FOV,
  PotteryRotationState,
  solvePotterySurfaceDrag
} from "./pottery-scene";

type GL = any;

interface LightingPreset {
  keyDirection: number[];
  fillDirection: number[];
  keyColor: number[];
  fillColor: number[];
  ambient: number[];
  keyIntensity: number;
  fillIntensity: number;
  exposure: number;
}

const LIGHTING: Record<string, LightingPreset> = {
  workshop: {
    keyDirection: [0.58, 0.76, 0.3],
    fillDirection: [-0.64, 0.22, 0.72],
    keyColor: [1, 0.91, 0.76],
    fillColor: [0.39, 0.53, 0.58],
    ambient: [0.2, 0.22, 0.2],
    keyIntensity: 1.04,
    fillIntensity: 0.2,
    exposure: 2.48
  },
  museum: {
    keyDirection: [-0.34, 0.91, 0.24],
    fillDirection: [0.5, 0.2, 0.84],
    keyColor: [1, 0.95, 0.86],
    fillColor: [0.32, 0.42, 0.5],
    ambient: [0.26, 0.265, 0.27],
    keyIntensity: 0.76,
    fillIntensity: 0.18,
    exposure: 2.2
  },
  window: {
    keyDirection: [-0.76, 0.62, 0.2],
    fillDirection: [0.64, 0.28, 0.7],
    keyColor: [1, 0.98, 0.9],
    fillColor: [0.49, 0.63, 0.72],
    ambient: [0.285, 0.295, 0.3],
    keyIntensity: 0.8,
    fillIntensity: 0.21,
    exposure: 2.35
  }
};

const CLAY_GRAIN: Record<string, number> = {
  porcelain: 0.4,
  stoneware: 0.76,
  red: 1
};

export const DECORATION_PORCELAIN_COLOR = "#c6d8ce";

export interface PotterySurfaceState {
  clayWetness: number;
  porcelainFinish: number;
}

export function potterySurfaceState(stageIndex: number): PotterySurfaceState {
  if (stageIndex === 0) return { clayWetness: 0.94, porcelainFinish: 0 };
  if (stageIndex === 1) return { clayWetness: 0.12, porcelainFinish: 1 };
  if (stageIndex === 2) return { clayWetness: 0.28, porcelainFinish: 0 };
  return { clayWetness: 0.06, porcelainFinish: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hexRgb(hex: string): number[] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255
  ];
}

function normalize(x: number, y: number, z: number): number[] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0
  ]);
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function lookAt(eye: number[], center: number[], up: number[]): Float32Array {
  const z = normalize(eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]);
  const x = normalize(
    up[1] * z[2] - up[2] * z[1],
    up[2] * z[0] - up[0] * z[2],
    up[0] * z[1] - up[1] * z[0]
  );
  const y = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0]
  ];
  return new Float32Array([
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -x[0] * eye[0] - x[1] * eye[1] - x[2] * eye[2],
    -y[0] * eye[0] - y[1] * eye[1] - y[2] * eye[2],
    -z[0] * eye[0] - z[1] * eye[1] - z[2] * eye[2],
    1
  ]);
}

function rotateY(angle: number): Float32Array {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return new Float32Array([
    cosine,
    0,
    -sine,
    0,
    0,
    1,
    0,
    0,
    sine,
    0,
    cosine,
    0,
    0,
    0,
    0,
    1
  ]);
}

/** 题款占器身总高的比例（正方形边长），0.26 约为一只手掌可覆的大小。 */
const SEAL_MARK_SIZE = 0.26;

const VS = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute float aCavity;
attribute float aDecorationSurface;
uniform mat4 uViewProjection;
uniform mat4 uModel;
uniform mediump float uHeight;
  varying vec3 vNormal;
  varying vec3 vPos;
  varying vec3 vObjectPos;
  varying vec3 vTangent;
  varying float vY;
  varying float vCavity;
  varying float vDecorationSurface;
  void main(){
    vec4 world = uModel * vec4(aPosition, 1.0);
    vPos = world.xyz;
    vObjectPos = aPosition;
    vNormal = mat3(uModel) * aNormal;
    vec3 objectTangent = vec3(-aPosition.z, 0.0, aPosition.x);
    if (dot(objectTangent, objectTangent) < 0.000001) objectTangent = vec3(1.0, 0.0, 0.0);
    vTangent = normalize(mat3(uModel) * objectTangent);
    vY = clamp(aPosition.y / uHeight + 0.5, 0.0, 1.0);
  vCavity = aCavity;
  vDecorationSurface = aDecorationSurface;
  gl_Position = uViewProjection * world;
}
`;

const FS = `
precision mediump float;
  varying vec3 vNormal;
  varying vec3 vPos;
  varying vec3 vObjectPos;
  varying vec3 vTangent;
  varying float vY;
  varying float vCavity;
  varying float vDecorationSurface;
uniform vec3 uBase;
uniform mediump float uHeight;
uniform vec3 uGlaze;
uniform vec3 uAccent;
uniform vec3 uCamera;
uniform vec3 uKeyDirection;
uniform vec3 uFillDirection;
uniform vec3 uKeyColor;
uniform vec3 uFillColor;
uniform vec3 uAmbient;
uniform float uKeyIntensity;
uniform float uFillIntensity;
uniform float uExposure;
  uniform float uGlazeMix;
  uniform float uPattern;
  uniform float uMethod;
uniform float uClayWetness;
uniform float uClayGrain;
uniform float uPorcelainFinish;
uniform vec4 uLayerA[13];
uniform vec4 uLayerB[13];
uniform vec4 uLayerC[13];
uniform float uFiredPreview;
uniform float uKilnSeed;
uniform float uMaxRadius;
uniform float uFootRadius;
uniform sampler2D uInscription;
uniform vec4 uInscriptionParams;
uniform vec3 uInscriptionColor;
uniform sampler2D uSeal;
uniform vec4 uSealRegion;
uniform vec2 uSealHalfSize;
uniform vec3 uSealColor;

float wrappedDistance(float value, float center){
  return abs(fract(value - center + 0.5) - 0.5);
}

vec2 rotatePoint(vec2 point, float angle){
  float cosine = cos(angle);
  float sine = sin(angle);
  return vec2(point.x * cosine - point.y * sine, point.x * sine + point.y * cosine);
}

float lineMask(float distanceValue, float width){
  return 1.0 - smoothstep(width, width + 0.055, distanceValue);
}

float stableAngle(vec2 point){
  // atan(0, 0) is undefined in GLSL ES and differs across mobile GPUs. Give
  // the exact center a deterministic positive-X direction without changing
  // any non-central sample.
  float atCenter = 1.0 - step(1e-8, dot(point, point));
  return atan(point.y, point.x + atCenter * 1e-4);
}

float decorationSurfaceMask(float surfaceCode){
  return 1.0 - step(.25, abs(vDecorationSurface - surfaceCode));
}

float decorationPointWindow(vec2 point){
  return 1.0 - smoothstep(.82, 1.08, max(abs(point.x), abs(point.y)));
}

float motifMask(float code, vec2 point){
  float radius = length(point);
  float angle = stableAngle(point);
  float mask = 0.0;
  if (code < 1.5) {
    float petals = abs(sin(angle * 4.0));
    mask = lineMask(abs(radius - (0.38 + petals * 0.24)), 0.08);
    mask = max(mask, 1.0 - smoothstep(0.14, 0.23, radius));
  } else if (code < 2.5) {
    float petals = abs(cos(angle * 5.0));
    mask = lineMask(abs(radius - (0.34 + petals * 0.3)), 0.09);
    mask = max(mask, lineMask(abs(radius - 0.22), 0.06));
  } else if (code < 3.5) {
    float branch = lineMask(abs(point.y - point.x * 0.38), 0.055);
    float blossoms = 1.0 - smoothstep(0.12, 0.2, min(length(point-vec2(-.38,-.14)), min(length(point-vec2(.05,.04)), length(point-vec2(.42,.2)))));
    mask = max(branch, blossoms);
  } else if (code < 4.5) {
    float stem = lineMask(abs(point.x), 0.07) * step(abs(point.y), .9);
    float joints = lineMask(abs(fract((point.y + 1.0) * 2.4) - .5), .075);
    float leaves = lineMask(abs(point.y - abs(point.x) * 1.7), .08) * step(.15, abs(point.x));
    mask = max(stem, max(joints, leaves));
  } else if (code < 5.5) {
    float body = 1.0 - smoothstep(.0, .14, abs(length(point * vec2(.72, 1.35)) - .48));
    float tail = lineMask(abs(abs(point.x + .55) - abs(point.y) * .75), .08) * step(-.9, point.x) * (1.0-step(-.38, point.x));
    mask = max(body, tail);
  } else if (code < 6.5) {
    float neck = lineMask(abs(point.x + sin(point.y * 2.2) * .18), .07) * step(-.1, point.y);
    float wings = lineMask(abs(abs(point.x) * .65 + point.y - .05), .075) * step(.15, abs(point.x));
    mask = max(neck, wings);
  } else if (code < 7.5) {
    float wings = lineMask(abs(abs(point.x) * .75 + abs(point.y) - .55), .1);
    mask = max(wings, lineMask(abs(point.x), .07));
  } else if (code < 8.5) {
    float wings = lineMask(abs(length(abs(point) - vec2(.34,.18)) - .25), .08);
    mask = max(wings, lineMask(abs(point.x), .055));
  } else if (code < 9.5) {
    float coil = lineMask(abs(radius - (.25 + angle * .075)), .085);
    mask = max(coil, lineMask(abs(point.y + sin(point.x * 5.0) * .18), .06));
  } else if (code < 10.5) {
    float cloudA = lineMask(abs(length(point - vec2(-.32,.02)) - .32), .075);
    float cloudB = lineMask(abs(length(point - vec2(.18,.12)) - .4), .075);
    mask = max(cloudA, max(cloudB, lineMask(abs(point.y + .28), .06) * step(-.55, point.x)));
  } else if (code < 11.5) {
    mask = lineMask(abs(point.y - sin(point.x * 5.5) * .22), .075);
    mask = max(mask, lineMask(abs(point.y + .38 - sin(point.x * 5.5 + 1.7) * .17), .055));
  } else if (code < 12.5) {
    float box = max(abs(point.x), abs(point.y));
    mask = lineMask(abs(box - .58), .07);
    mask = max(mask, lineMask(min(abs(point.x), abs(point.y)), .065) * step(box, .5));
  } else if (code < 13.5) {
    vec2 cell = abs(fract((point + 1.0) * 2.0) - .5);
    mask = lineMask(min(abs(cell.x - .32), abs(cell.y - .32)), .07);
  } else if (code < 14.5) {
    float head = lineMask(abs(length(point - vec2(0.0,.18)) - .38), .08);
    mask = max(head, lineMask(abs(abs(point.x) + point.y - .55), .07));
  } else if (code < 15.5) {
    float petal = lineMask(abs(abs(point.x) + abs(point.y + .05) * .72 - .58), .075);
    mask = max(petal, lineMask(abs(point.y + .58), .055));
  } else if (code < 16.5) {
    mask = lineMask(min(abs(abs(point.x) - .32), abs(abs(point.y) - .32)), .07);
  } else if (code < 17.5) {
    mask = lineMask(abs(length(point - vec2(0.0,.2)) - .34), .075);
    mask = max(mask, lineMask(abs(abs(point.x) + point.y - .52), .06));
  } else if (code < 18.5) {
    mask = lineMask(abs(abs(point.x) + abs(point.y) * .68 - .55), .07);
  } else if (code < 19.5) {
    mask = lineMask(abs(point.y - sin(point.x * 6.283) * .23), .07);
    mask = max(mask, lineMask(abs(point.y + .4 - sin(point.x * 6.283 + 1.4) * .17), .05));
  } else if (code < 20.5) {
    mask = lineMask(abs(point.y - sin(point.x * 5.2) * .32), .07);
    mask = max(mask, 1.0 - smoothstep(.11,.19,length(point-vec2(.12,.06))));
  } else {
    float dots = 1.0 - smoothstep(.15,.25,length(point));
    mask = dots;
  }
  return clamp(mask, 0.0, 1.0);
}

float decorationLayerMask(vec4 layerA, vec4 layerB, vec4 layerC){
  if (layerA.x < .5) return 0.0;
  float surfaceU = stableAngle(vObjectPos.xz) / 6.2831853 + .5;
  float density = mod(layerC.x, 32.0);
  float anchor = floor(layerC.x / 32.0);
  float rotation = (fract(layerA.z) * 1000.0 - 180.0) * .0174532925;
  float verticalDirection = sign(layerB.w);
  float verticalScale = max(.42, abs(layerB.w));
  vec2 point;
  if (anchor > 4.5) {
    float wantedCavity = anchor < 5.5 ? step(.52, vCavity) : (1.0 - step(-.62, normalize(vNormal).y));
    if (anchor > 5.5) wantedCavity *= 1.0 - step(.35, vCavity);
    point = vec2(
      -vObjectPos.x / max(.08, uMaxRadius * layerB.z * .72),
      vObjectPos.z / max(.08, uMaxRadius * verticalScale * .72)
    );
    point.y *= verticalDirection;
    point = rotatePoint(point, rotation);
    return motifMask(layerA.y, point) * wantedCavity;
  }

  float wallSurface = decorationSurfaceMask(1.0) * (1.0 - step(.48, vCavity));
  float baseSurface = decorationSurfaceMask(2.0);
  float copies = layerA.w < .5 ? 1.0 : layerA.w < 1.5 ? 2.0 : layerA.w < 2.5 ? 4.0 : max(6.0, density);
  float localU = fract((surfaceU - layerB.x) * copies + .5) - .5;
  float horizontalScale = layerA.w > 2.5 ? .82 : .17 * layerB.z * copies;
  // Express the existing cylindrical UV size in object-space units at the
  // foot. The base uses exactly the same two units, so crossing v=0 cannot
  // make a motif suddenly shrink, stretch or rotate.
  float layerHorizontalUnit = layerA.w > 2.5
    ? .82 * 6.2831853 * uFootRadius / copies
    : .17 * 6.2831853 * uFootRadius * layerB.z;
  float layerVerticalUnit = .16 * uHeight * verticalScale;
  vec2 wallPoint;
  if (layerB.y >= 0.0) {
    wallPoint = vec2(
      localU / max(.035, horizontalScale),
      (vY - layerB.y) / max(.035, .16 * verticalScale)
    );
  } else {
    float wallCopyCenterU = layerB.x + floor((surfaceU - layerB.x) * copies + .5) / copies;
    float wallOffsetU = fract(surfaceU - wallCopyCenterU + .5) - .5;
    float anchorS = layerB.y * uFootRadius;
    wallPoint = vec2(
      wallOffsetU * 6.2831853 * uFootRadius / max(.001, layerHorizontalUnit),
      (vY * uHeight - anchorS) / max(.001, layerVerticalUnit)
    );
  }
  wallPoint.y *= verticalDirection;
  wallPoint = rotatePoint(wallPoint, rotation);
  float wallWindow = layerB.y >= 0.0
    ? 1.0 - smoothstep(.72, 1.05, abs(wallPoint.y))
    : decorationPointWindow(wallPoint);
  float wallMark = motifMask(layerA.y, wallPoint) * wallSurface * wallWindow;

  // The base is a real Cartesian plane. Unwrap the wall downward along the
  // selected longitude: v=0 is the foot edge and v=-1 is the base center.
  // Using dot products in this local frame avoids atan's polar singularity,
  // which was the source of the former radial explosion.
  // Repetition belongs to a circumference and has no non-singular equivalent
  // at the center of a disk. Keep one fixed-orientation instance on the base;
  // using the fragment angle to choose a copy would recreate radial wedges.
  float baseCopyCenterU = layerB.x;
  float baseAngle = (baseCopyCenterU - .5) * 6.2831853;
  vec2 baseOutward = vec2(cos(baseAngle), sin(baseAngle));
  vec2 baseTangent = vec2(-baseOutward.y, baseOutward.x);
  float baseAnchorS = layerB.y >= 0.0
    ? layerB.y * uHeight
    : layerB.y * uFootRadius;
  vec2 basePoint = vec2(
    dot(vObjectPos.xz, baseTangent) / max(.001, layerHorizontalUnit),
    (dot(vObjectPos.xz, baseOutward) - uFootRadius - baseAnchorS) /
      max(.001, layerVerticalUnit)
  );
  basePoint.y *= verticalDirection;
  basePoint = rotatePoint(basePoint, rotation);
  float baseMark = motifMask(layerA.y, basePoint) *
    baseSurface * decorationPointWindow(basePoint);
  return max(wallMark, baseMark);
}

  float hash31(vec3 point){
    vec3 value = fract(point * 0.1031);
    value += dot(value, value.yzx + 33.33);
    return fract((value.x + value.y) * value.z);
  }

  float noise3(vec3 point){
    vec3 cell = floor(point);
    vec3 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));
    float lower = mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y);
    float upper = mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y);
    return mix(lower, upper, local.z);
  }

  void main(){
    // All marks are sampled in object space so their tiny irregularities rotate
    // with the clay instead of appearing painted onto the room.
    float angle = stableAngle(vObjectPos.xz);
    float surfaceU = angle / 6.2831853 + .5;
    float glazeMask = 1.0;
    if (uMethod == 1.0) glazeMask = smoothstep(0.48, 0.52, vY);
    else if (uMethod == 2.0) glazeMask = 0.78 + 0.14 * sin(vY * 31.0 + angle * 2.0);
    else if (uMethod == 3.0) glazeMask = smoothstep(-0.1, 0.22, sin(angle * 3.0 + vY * 13.0));
    float surfaceGlaze = clamp(uGlazeMix * glazeMask, 0.0, 1.0);
    float rawClay = 1.0 - smoothstep(0.08, 0.78, surfaceGlaze);
    float porcelainFinish = uPorcelainFinish * rawClay;
    float coarseClay = rawClay * (1.0 - porcelainFinish);
    float wetClay = coarseClay * uClayWetness;

    float clayCloud = noise3(vObjectPos * vec3(5.2, 8.4, 5.2) + vec3(3.1, 7.7, 1.4));
    float clayGrain = noise3(vObjectPos * vec3(38.0, 52.0, 38.0) + vec3(9.2, 2.4, 5.7));
    float secondGrain = noise3(vObjectPos * vec3(43.0, 47.0, 43.0) + vec3(1.3, 8.6, 4.1));

    vec3 geometricNormal = normalize(vNormal);
    vec3 tangent = normalize(vTangent - geometricNormal * dot(vTangent, geometricNormal));
    vec3 bitangent = normalize(cross(geometricNormal, tangent));
    float smoothSurface = max(surfaceGlaze, porcelainFinish * 0.94);
    float microRelief = mix(0.032 * uClayGrain, 0.0042, smoothSurface);
    vec3 normal = normalize(
      geometricNormal +
      tangent * (clayGrain - 0.5) * microRelief +
      bitangent * (secondGrain - 0.5) * microRelief
    );
    vec3 viewDirection = normalize(uCamera - vPos);
    vec3 keyDirection = normalize(uKeyDirection);
    vec3 fillDirection = normalize(uFillDirection);
    float key = max(dot(normal, keyDirection), 0.0);
    float fill = max(dot(normal, fillDirection), 0.0);

    vec3 material = mix(uBase, uGlaze, surfaceGlaze);
    // The decoration stage presents a refined jade-white porcelain blank. A
    // restrained cloudy variation keeps the surface from reading as plastic,
    // while the chosen clay no longer exposes its damp, granular appearance.
    float porcelainCloud =
      (clayCloud - 0.5) * 0.022 +
      (secondGrain - 0.5) * 0.006;
    vec3 porcelainBody = uBase * (1.0 + porcelainCloud);
    porcelainBody *= mix(vec3(0.965, 1.018, 0.988), vec3(1.022, 0.986, 1.008), vY);
    material = mix(material, porcelainBody, porcelainFinish);
    float reliefShade = 0.0;
    for (int layerIndex = 0; layerIndex < 13; layerIndex++) {
      vec4 layerA = uLayerA[layerIndex];
      vec4 layerB = uLayerB[layerIndex];
      vec4 layerC = uLayerC[layerIndex];
      float mark = decorationLayerMask(layerA, layerB, layerC);
      float kilnVariation = .93 + .07 * noise3(vObjectPos * 13.0 + vec3(uKilnSeed * .0001 + float(layerIndex)));
      mark *= mix(1.0, kilnVariation, uFiredPreview);
      vec3 markColor = layerC.yzw;
      if (layerA.z < .5) {
        material *= 1.0 - mark * mix(.1, .2, uFiredPreview);
        reliefShade = max(reliefShade, mark * .18);
      } else if (layerA.z < 1.5) {
        material = mix(material, markColor, mark * mix(.32, .48, uFiredPreview));
        reliefShade = max(reliefShade, mark * .08);
      } else if (layerA.z < 2.5) {
        material = mix(material, markColor, mark * mix(.68, .88, uFiredPreview));
      } else {
        material = mix(material, markColor, mark * mix(.78, .92, uFiredPreview));
      }
    }

    if (uInscriptionParams.z > .5) {
      vec2 inscriptionUv = vec2(.5);
      float inscriptionSurface = 0.0;
      if (uInscriptionParams.x < .5) {
        inscriptionUv = vec2(-vObjectPos.x, vObjectPos.z) / max(.08, uMaxRadius * .9) + .5;
        inscriptionSurface = (1.0 - step(-.62, normalize(vNormal).y)) * (1.0 - step(.35, vCavity));
      } else if (uInscriptionParams.x < 1.5) {
        inscriptionUv = vec2(vObjectPos.x, vObjectPos.z) / max(.08, uMaxRadius * 1.1) + .5;
        inscriptionSurface = step(.52, vCavity);
      } else {
        float inscriptionU = fract(surfaceU - .5 + .5);
        inscriptionUv = vec2((inscriptionU - .5) * 3.2 + .5, (vY - .08) / .24);
        inscriptionSurface = decorationSurfaceMask(1.0) * (1.0 - step(.48, vCavity));
      }
      float inscription = texture2D(uInscription, inscriptionUv).a * inscriptionSurface;
      if (uInscriptionParams.y > 1.5) {
        material *= 1.0 - inscription * .18;
        reliefShade = max(reliefShade, inscription * .15);
      } else {
        material = mix(material, uInscriptionColor, inscription * .94);
      }
    }

    if (uSealRegion.w > 0.0) {
      float sealWallSurface = decorationSurfaceMask(1.0) * (1.0 - step(.48, vCavity));
      float sealBaseSurface = decorationSurfaceMask(2.0);
      // On the wall the u axis runs against surfaceU so the engraved characters
      // read correctly. A negative center v continues through the foot edge.
      float sealDu = fract(uSealRegion.x - surfaceU + 0.5) - 0.5;
      float sealDv = vY - uSealRegion.y;
      vec2 sealWallUv;
      if (uSealRegion.y >= 0.0) {
        sealWallUv = vec2(
          sealDu / (uSealRegion.z * 2.0) + 0.5,
          sealDv / (uSealRegion.w * 2.0) + 0.5
        );
      } else {
        float sealAnchorS = uSealRegion.y * uFootRadius;
        sealWallUv = vec2(
          (sealDu * 6.2831853 * uFootRadius) / (uSealHalfSize.x * 2.0) + .5,
          (vY * uHeight - sealAnchorS) / (uSealHalfSize.y * 2.0) + .5
        );
      }
      float wallSeal = texture2D(uSeal, sealWallUv).a * sealWallSurface;

      float sealAngle = (uSealRegion.x - .5) * 6.2831853;
      vec2 sealOutward = vec2(cos(sealAngle), sin(sealAngle));
      vec2 sealTangent = vec2(-sealOutward.y, sealOutward.x);
      float sealBaseAnchorS = uSealRegion.y >= 0.0
        ? uSealRegion.y * uHeight
        : uSealRegion.y * uFootRadius;
      vec2 sealBaseUv = vec2(
        -dot(vObjectPos.xz, sealTangent) / (uSealHalfSize.x * 2.0) + .5,
        (dot(vObjectPos.xz, sealOutward) - uFootRadius - sealBaseAnchorS) /
          (uSealHalfSize.y * 2.0) + .5
      );
      float baseSeal = texture2D(uSeal, sealBaseUv).a * sealBaseSurface;
      float seal = max(wallSeal, baseSeal);
      material = mix(material, uSealColor, seal * 0.92);
    }

    // Wheel rings, cloudy slip and sparse mineral grains make raw clay read as
    // damp material. Their amplitude stays below the point where it looks like
    // a printed texture, especially on fine porcelain.
    float throwingRing = sin(vY * 164.0 + sin(angle * 5.0 + clayCloud * 2.2) * 1.05);
    float slipBand = sin(vY * 43.0 + angle * 1.7 + clayCloud * 2.4);
    float mineral = smoothstep(0.78, 0.96, clayGrain) * uClayGrain;
    float clayTone =
      1.0 +
      coarseClay * (
        throwingRing * 0.014 +
        (clayCloud - 0.5) * 0.075 * uClayGrain +
        slipBand * 0.012 * wetClay -
        mineral * 0.045
      );
    material *= clayTone;

    vec3 halfVector = normalize(keyDirection + viewDirection);
    vec3 fillHalfVector = normalize(fillDirection + viewDirection);
    float specularPower = mix(mix(20.0, 30.0, uClayWetness), 72.0, surfaceGlaze);
    specularPower = mix(specularPower, 58.0, porcelainFinish);
    float specular = pow(max(dot(normal, halfVector), 0.0), specularPower);
    specular *= mix(0.055 + uClayWetness * 0.095, 0.3, surfaceGlaze);
    specular = mix(
      specular,
      specular * 0.35 + pow(max(dot(normal, halfVector), 0.0), 92.0) * 0.2,
      porcelainFinish
    );
    specular *= mix(0.72, 1.16, clayGrain);
    float broadWetHighlight =
      pow(max(dot(normal, halfVector), 0.0), 7.0) * wetClay * 0.052 +
      pow(max(dot(normal, halfVector), 0.0), 11.0) * porcelainFinish * 0.082;
    float fillSpecular =
      pow(max(dot(normal, fillHalfVector), 0.0), mix(14.0, 52.0, surfaceGlaze)) *
      mix(0.025, 0.11, surfaceGlaze);
    fillSpecular = mix(
      fillSpecular,
      pow(max(dot(normal, fillHalfVector), 0.0), 28.0) * 0.085,
      porcelainFinish
    );
    float facing = max(dot(normal, viewDirection), 0.0);
    float fresnel = pow(1.0 - facing, 3.0) * mix(0.026 + wetClay * 0.024, 0.07, surfaceGlaze);
    fresnel = mix(fresnel, pow(1.0 - facing, 3.5) * 0.082, porcelainFinish);

    vec3 linearMaterial = pow(max(material, vec3(0.0)), vec3(2.2));
    float porcelainKey = clamp((dot(normal, keyDirection) + 0.28) / 1.28, 0.0, 1.0);
    float porcelainFill = clamp((dot(normal, fillDirection) + 0.18) / 1.18, 0.0, 1.0);
    float diffuseKey = mix(key, porcelainKey, porcelainFinish * 0.55);
    float diffuseFill = mix(fill, porcelainFill, porcelainFinish * 0.32);
    vec3 diffuseLight =
      uAmbient +
      uKeyColor * diffuseKey * uKeyIntensity +
      uFillColor * diffuseFill * uFillIntensity;
    float baseOcclusion = mix(0.8, 1.0, smoothstep(0.0, 0.18, vY));
    float cavityOcclusion = mix(1.0, 0.52, vCavity);
    vec3 linearColor = linearMaterial * diffuseLight * baseOcclusion * cavityOcclusion;
    linearColor *= 1.0 - reliefShade;
    linearColor += (
      uKeyColor * (specular + broadWetHighlight) +
      uFillColor * (fillSpecular + fresnel)
    ) * mix(1.0, 0.48, vCavity);
    linearColor +=
      pow(max(uBase, vec3(0.0)), vec3(2.2)) *
      pow(1.0 - facing, 2.4) *
      porcelainFinish *
      0.018 *
      (1.0 - vCavity * 0.7);
    linearColor += uKeyColor * smoothstep(0.9, 1.0, vY) * wetClay * 0.018;
    vec3 exposed = max(linearColor * uExposure, vec3(0.0));
  vec3 mapped = exposed / (vec3(1.0) + exposed);
  gl_FragColor = vec4(pow(mapped, vec3(1.0 / 2.2)), 1.0);
}
`;

export class PotteryEngine {
  private canvas: any;
  private gl: GL;
  private program: any;
  private vbo: any;
  private nbo: any;
  private cbo: any;
  private dbo: any;
  private ibo: any;
  private count = 0;
  private work: PotteryWork;
  private viewYaw = 0;
  private turntableAngle = 0;
  private pitch = 0.12;
  private zoomFactor = 1;
  private fitDistance = 0;
  private aspect = 1;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private meshRadius = 0.6;
  private meshHeight = 1.2;
  private frame = 0;
  private lastFrameTime = 0;
  private running = true;
  private autoRotate = true;
  private rotationState: PotteryRotationState = "idle";
  private currentRpm = 0;
  private targetRpm = 38;
  private baseScreenY = POTTERY_BASE_SCREEN_Y;
  private potteryCentered = false;
  private frameProcessor: (() => boolean) | null = null;
  private topologyKey = "";
  private positionByteLength = 0;
  private normalByteLength = 0;
  private lighting = "workshop";
  private geometrySignature = "";
  private viewProjectionMatrix: Float32Array | null = null;
  private modelMatrix: Float32Array | null = null;
  private inscriptionTexture: any;
  private inscriptionKey = "";
  private inscriptionTextureReady = false;
  private sealTexture: any;
  private sealKey = "";
  private sealTextureReady = false;
  private firedPreview = false;

  constructor(canvas: any, work: PotteryWork) {
    this.canvas = canvas;
    this.work = work;
    const gl = canvas.getContext("webgl", {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true
    });
    if (!gl) throw new Error("WEBGL_UNAVAILABLE");
    this.gl = gl;
    this.program = this.makeProgram(VS, FS);
    this.vbo = gl.createBuffer();
    this.nbo = gl.createBuffer();
    this.cbo = gl.createBuffer();
    this.dbo = gl.createBuffer();
    this.ibo = gl.createBuffer();
    this.inscriptionTexture = gl.createTexture();
    this.initializeInscriptionTexture();
    this.updateInscriptionTexture();
    this.sealTexture = gl.createTexture();
    this.initializeSealTexture();
    this.updateSealTexture();
    this.rebuild();
    this.targetRpm = calculatePotteryTargetRpm(this.meshRadius, "idle");
    this.currentRpm = this.targetRpm;
    this.pitch = defaultPotteryPitch(this.meshRadius, this.meshHeight);
    this.resetCameraFit();
    this.loop();
  }

  private makeProgram(vsSource: string, fsSource: string): any {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || "shader";
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    };
    const vertexShader = compile(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "link");
    }
    return program;
  }

  resize(width: number, height: number, dpr: number, preserveVisualScale = false) {
    const previousViewportHeight = this.viewportHeight;
    const previousFitDistance = this.fitDistance;
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    this.canvas.width = Math.max(1, Math.floor(safeWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(safeHeight * dpr));
    this.viewportWidth = safeWidth;
    this.viewportHeight = safeHeight;
    this.aspect = safeWidth / safeHeight;
    if (preserveVisualScale && previousViewportHeight > 1 && previousFitDistance > 0) {
      this.fitDistance = calculatePreservedPotteryCameraDistance(
        previousFitDistance,
        previousViewportHeight,
        safeHeight
      );
      this.applyZoomLimits();
    } else {
      this.resetCameraFit();
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.render();
  }

  update(work: PotteryWork, renderNow = true) {
    this.work = work;
    const signature = this.workGeometrySignature(work);
    if (signature !== this.geometrySignature) {
      this.rebuild();
      this.ensureCameraFit();
    }
    this.updateInscriptionTexture();
    this.updateSealTexture();
    if (renderNow) this.render();
  }

  setAutoRotate(value: boolean) {
    this.autoRotate = value;
    this.rotationState = value ? "idle" : "reduced";
    this.targetRpm = value ? calculatePotteryTargetRpm(this.meshRadius, "idle") : 0;
    this.currentRpm = this.targetRpm;
  }

  setRotationState(value: PotteryRotationState) {
    this.rotationState = value;
    this.targetRpm = this.autoRotate ? calculatePotteryTargetRpm(this.meshRadius, value) : 0;
    // The CSS wheel receives the same target in Studio.setWheelState. Applying
    // it immediately here keeps both angular velocities identical instead of
    // letting the clay coast while the visible wheel has already changed pace.
    this.currentRpm = this.targetRpm;
  }

  setBaseScreenY(value: number) {
    this.baseScreenY = clamp(value, 0.6, 0.93);
    this.render();
  }

  setPotteryCentered(value: boolean) {
    this.potteryCentered = value;
    this.render();
  }

  setFrameProcessor(processor: (() => boolean) | null) {
    this.frameProcessor = processor;
  }

  setLighting(value: string) {
    this.lighting = LIGHTING[value] ? value : "workshop";
    this.render();
  }

  setFiredPreview(value: boolean) {
    this.firedPreview = value;
    this.render();
  }

  private initializeInscriptionTexture() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.inscriptionTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
  }

  private updateInscriptionTexture() {
    const inscription = this.work.decorationComposition.inscription;
    const nextKey = inscription
      ? `${inscription.text}|${inscription.layoutId}|${inscription.typefaceId}`
      : "";
    if (nextKey === this.inscriptionKey) return;
    this.inscriptionKey = nextKey;
    this.inscriptionTextureReady = false;
    this.initializeInscriptionTexture();
    if (!inscription || !wx.createOffscreenCanvas) return;
    try {
      const canvas = wx.createOffscreenCanvas({ type:"2d", width:512, height:512 });
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, 512, 512);
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#ffffff";
      context.lineWidth = 13;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const family = inscription.typefaceId === "seal"
        ? '"STKaiti", "KaiTi", serif'
        : '"Songti SC", "STSong", serif';
      const cleanText = inscription.text.replace(/\n/g, "");
      const characters = Array.from(cleanText);
      const drawCharacter = (character: string, x: number, y: number, size: number) => {
        context.font = `${inscription.typefaceId === "seal" ? "bold " : ""}${size}px ${family}`;
        context.fillText(character, x, y);
      };

      if (inscription.layoutId === "round") {
        context.beginPath();
        context.arc(256, 256, 190, 0, Math.PI * 2);
        context.stroke();
        characters.slice(0, 8).forEach((character, index) => {
          const angle = -Math.PI / 2 + (index / Math.max(1, characters.length)) * Math.PI * 2;
          drawCharacter(character, 256 + Math.cos(angle) * 118, 256 + Math.sin(angle) * 118, 58);
        });
      } else if (inscription.layoutId === "horizontal") {
        const lines = inscription.text.split("\n").slice(0, 2);
        lines.forEach((line: string, index: number) => {
          context.font = `${index ? "48" : "64"}px ${family}`;
          context.fillText(line, 256, lines.length === 1 ? 256 : 205 + index * 112);
        });
      } else if (inscription.layoutId === "vertical") {
        characters.slice(0, 8).forEach((character, index) => {
          const column = index >= 4 ? 0 : 1;
          const row = index % 4;
          drawCharacter(character, 210 + column * 92, 118 + row * 92, 64);
        });
      } else {
        const columns = 2;
        const rows = inscription.layoutId === "square_2x3" ? 3 : 2;
        const visible = characters.slice(0, columns * rows);
        context.strokeRect(82, 82, 348, 348);
        visible.forEach((character, index) => {
          const column = index % columns;
          const row = Math.floor(index / columns);
          drawCharacter(character, 169 + column * 174, 169 + row * (348 / rows), rows === 3 ? 72 : 88);
        });
      }

      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.inscriptionTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      this.inscriptionTextureReady = true;
    } catch (_error) {
      this.inscriptionTextureReady = false;
    }
  }

  private initializeSealTexture() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sealTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
  }

  private updateSealTexture() {
    const seal = this.work.decorationComposition.sealMark;
    const nextKey = seal ? `${seal.text}|${seal.colorId}` : "";
    if (nextKey === this.sealKey) return;
    this.sealKey = nextKey;
    this.sealTextureReady = false;
    this.initializeSealTexture();
    if (!seal || !wx.createOffscreenCanvas) return;
    try {
      const canvas = wx.createOffscreenCanvas({ type: "2d", width: 512, height: 512 });
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, 512, 512);
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#ffffff";
      context.textAlign = "center";
      context.textBaseline = "middle";
      // 印面：外方框 + 满排字符。边框内缩，避免贴边被裁。
      context.lineWidth = 16;
      context.strokeRect(26, 26, 460, 460);
      const characters = Array.from(seal.text.replace(/\s/g, ""))
        .slice(0, MAX_SEAL_MARK_CHARACTERS);
      if (characters.length) {
        // 古代书写顺序：字自上而下，列自左而右；行数不少于列数，
        // 网格整体竖长，再把全部字数均分进整个正方形。
        const rows = Math.ceil(Math.sqrt(characters.length));
        const columns = Math.ceil(characters.length / rows);
        const cellWidth = 460 / columns;
        const cellHeight = 460 / rows;
        context.font = `bold ${Math.floor(Math.min(cellWidth, cellHeight) * 0.8)}px "STKaiti", "KaiTi", serif`;
        characters.forEach((character, index) => {
          const column = Math.floor(index / rows);
          const row = index % rows;
          context.fillText(
            character,
            26 + (column + 0.5) * cellWidth,
            26 + (row + 0.5) * cellHeight
          );
        });
      }
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.sealTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      this.sealTextureReady = true;
    } catch (_error) {
      this.sealTextureReady = false;
    }
  }

  private workGeometrySignature(work: PotteryWork): string {
    return `${work.height}|${work.outerRadius.join(",")}|${work.innerRadius.join(",")}`;
  }

  orbit(dx: number, dy: number) {
    const delta = calculatePotteryOrbitDelta(
      dx,
      dy,
      this.viewportWidth,
      this.viewportHeight
    );
    this.viewYaw = normalizePotteryYaw(this.viewYaw + delta.yaw);
    // Pitch is periodic rather than bounded: crossing a full turn wraps to the
    // equivalent orientation and the same-direction gesture can keep going.
    const nextPitch = normalizePotteryPitch(this.pitch + delta.pitch);
    if (nextPitch !== this.pitch) {
      this.pitch = nextPitch;
      this.resetCameraFit();
    }
    this.render();
  }

  dolly(scale: number) {
    this.zoomFactor = calculatePotteryZoomFactor(this.zoomFactor, scale);
    this.applyZoomLimits();
    this.render();
  }

  resetCamera() {
    this.viewYaw = 0;
    this.pitch = defaultPotteryPitch(this.meshRadius, this.meshHeight);
    this.zoomFactor = 1;
    this.resetCameraFit();
    this.render();
  }

  /** Maps a CSS-pixel y coordinate to a continuous profile coordinate. */
  profilePositionAtCanvasY(canvasY: number): number {
    const sampleCount = this.work.outerRadius.length;
    if (sampleCount <= 1) return 0;
    const distance = this.fitDistance * this.zoomFactor;
    const focusY = this.calculateFocusY(distance);
    const screenY = clamp(canvasY / this.viewportHeight, 0, 1);
    const ndcY = 1 - screenY * 2;
    const projectionScale = 1 / Math.tan(POTTERY_VERTICAL_FOV / 2);
    const denominator = projectionScale * Math.cos(this.pitch) + ndcY * Math.sin(this.pitch);
    const relativeY = Math.abs(denominator) < 1e-5 ? 0 : (ndcY * distance) / denominator;
    const modelY = focusY + relativeY;
    const profilePosition = clamp(modelY / this.meshHeight + 0.5, 0, 1);
    return profilePosition * (sampleCount - 1);
  }

  profileIndexAtCanvasY(canvasY: number): number {
    return Math.round(this.profilePositionAtCanvasY(canvasY));
  }

  /** Conservative silhouette hit test used to separate shaping from camera orbit. */
  hitTest(canvasX: number, canvasY: number): boolean {
    if (!Number.isFinite(canvasX) || !Number.isFinite(canvasY)) return false;
    const distance = this.fitDistance * this.zoomFactor;
    const top = this.projectModelY(this.meshHeight / 2, distance);
    const bottom = this.projectModelY(-this.meshHeight / 2, distance);
    const tangent = Math.tan(POTTERY_VERTICAL_FOV / 2);
    const verticalAllowance =
      (this.meshRadius * Math.abs(Math.sin(this.pitch))) / Math.max(distance * tangent, 0.01) *
        (this.viewportHeight / 2) +
      Math.max(12, this.viewportHeight * 0.018);
    const minY = Math.min(top, bottom) - verticalAllowance;
    const maxY = Math.max(top, bottom) + verticalAllowance;
    if (canvasY < minY || canvasY > maxY) return false;

    const profilePosition = this.profilePositionAtCanvasY(canvasY);
    const lowerIndex = Math.floor(profilePosition);
    const upperIndex = Math.min(this.work.outerRadius.length - 1, lowerIndex + 1);
    const blend = profilePosition - lowerIndex;
    const profileY =
      (profilePosition / Math.max(1, this.work.outerRadius.length - 1) - 0.5) *
      this.meshHeight;
    const focusY = this.calculateFocusY(distance);
    const relativeY = profileY - focusY;
    const radius =
      (this.work.outerRadius[lowerIndex] || this.meshRadius) * (1 - blend) +
      (this.work.outerRadius[upperIndex] || this.meshRadius) * blend;
    const closestDepth = Math.max(
      0.08,
      distance - relativeY * Math.sin(this.pitch) - radius * Math.cos(this.pitch)
    );
    const halfWidth =
      (radius / (closestDepth * tangent * this.aspect)) * (this.viewportWidth / 2);
    const horizontalAllowance = Math.max(14, this.viewportWidth * 0.035);
    return Math.abs(canvasX - this.viewportWidth / 2) <= halfWidth + horizontalAllowance;
  }

  /** Interpolated outer radius at normalized height v, for surface-sized marks. */
  private radiusAtHeight(v: number): number {
    const samples = this.work.outerRadius.length;
    const position = clamp(v * (samples - 1), 0, samples - 1);
    const lower = Math.floor(position);
    const upper = Math.min(samples - 1, lower + 1);
    const blend = position - lower;
    return (
      (this.work.outerRadius[lower] || this.meshRadius) * (1 - blend) +
      (this.work.outerRadius[upper] || this.meshRadius) * blend
    );
  }

  /**
   * Object-space position addressed by decoration coordinates. v=0 is the
   * foot edge; positive v climbs the wall and negative v travels radially
   * across the underside until v=-1 reaches the base center.
   */
  private surfaceObjectPosition(u: number, v: number): number[] {
    const samples = this.work.outerRadius.length;
    const safeV = clamp(v, MIN_DECORATION_SURFACE_V, 1);
    const theta = (u - 0.5) * Math.PI * 2;
    if (safeV < 0) {
      const baseRadius = this.radiusAtHeight(0) * (1 + safeV);
      return [
        Math.cos(theta) * baseRadius,
        -this.meshHeight / 2,
        Math.sin(theta) * baseRadius
      ];
    }
    const profilePosition = safeV * (samples - 1);
    const lower = Math.floor(profilePosition);
    const upper = Math.min(samples - 1, lower + 1);
    const blend = profilePosition - lower;
    const radius =
      (this.work.outerRadius[lower] || this.meshRadius) * (1 - blend) +
      (this.work.outerRadius[upper] || this.meshRadius) * blend;
    return [
      Math.cos(theta) * radius,
      (safeV - 0.5) * this.meshHeight,
      Math.sin(theta) * radius
    ];
  }

  /** Projects an outer-wall surface point to canvas CSS pixels at the last rendered camera. */
  private projectSurfacePoint(u: number, v: number): { x: number; y: number } | null {
    const viewProjection = this.viewProjectionMatrix;
    const model = this.modelMatrix;
    if (!viewProjection || !model) return null;
    const object = this.surfaceObjectPosition(u, v);
    const world = [
      model[0] * object[0] + model[4] * object[1] + model[8] * object[2] + model[12],
      model[1] * object[0] + model[5] * object[1] + model[9] * object[2] + model[13],
      model[2] * object[0] + model[6] * object[1] + model[10] * object[2] + model[14]
    ];
    const clipW =
      viewProjection[3] * world[0] +
      viewProjection[7] * world[1] +
      viewProjection[11] * world[2] +
      viewProjection[15];
    if (!Number.isFinite(clipW) || clipW <= 1e-6) return null;
    const clipX =
      viewProjection[0] * world[0] +
      viewProjection[4] * world[1] +
      viewProjection[8] * world[2] +
      viewProjection[12];
    const clipY =
      viewProjection[1] * world[0] +
      viewProjection[5] * world[1] +
      viewProjection[9] * world[2] +
      viewProjection[13];
    return {
      x: ((clipX / clipW) + 1) * 0.5 * this.viewportWidth,
      y: (1 - clipY / clipW) * 0.5 * this.viewportHeight
    };
  }

  /**
   * Converts a finger drag into surface (u, v) movement for the pattern at
   * (u, v), following the current on-screen projection of the clay so the
   * pattern tracks the finger at any viewpoint, zoom or turntable angle.
   * A single tangent solve drifts off the finger over a long drag on the
   * curved silhouette, so the solution is refined by re-projecting the moved
   * point and correcting the residual until the anchor lands on the finger.
   */
  surfaceDragDelta(u: number, v: number, dx: number, dy: number): { du: number; dv: number } {
    const base = this.projectSurfacePoint(u, v);
    if (!base) return { du: 0, dv: 0 };
    const targetX = base.x + dx;
    const targetY = base.y + dy;
    const step = 0.02;
    let currentU = u;
    let currentV = v;
    const freezeLongitude = v < -.9;
    for (let iteration = 0; iteration < 4; iteration++) {
      const current = this.projectSurfacePoint(currentU, currentV);
      if (!current) break;
      const residualX = targetX - current.x;
      const residualY = targetY - current.y;
      if (Math.abs(residualX) + Math.abs(residualY) < 0.2) break;
      const uNeighbor = this.projectSurfacePoint(currentU + step, currentV);
      // Use a one-sided derivative at the top edge. Sampling beyond v=1
      // produces a point that is not on the clay and can make the last strip
      // unreachable when the user drags back down.
      const vStep = currentV <= MIN_DECORATION_SURFACE_V + step
        ? step
        : currentV <= 0
          ? -step
          : currentV > 1 - step
            ? -step
            : step;
      const vNeighbor = this.projectSurfacePoint(currentU, currentV + vStep);
      if (!uNeighbor || !vNeighbor) break;
      const uTangent = {
        x:(uNeighbor.x - current.x) / step,
        y:(uNeighbor.y - current.y) / step
      };
      const vTangent = {
        x:(vNeighbor.x - current.x) / vStep,
        y:(vNeighbor.y - current.y) / vStep
      };
      const radialLengthSquared =
        vTangent.x * vTangent.x + vTangent.y * vTangent.y;
      const radialCorrection = radialLengthSquared > 1e-6
        ? {
            du:0,
            dv:clamp(
              (residualX * vTangent.x + residualY * vTangent.y) /
                radialLengthSquared,
              -.4,
              .4
            )
          }
        : { du:0, dv:0 };
      // Longitude becomes numerically meaningless as the base radius tends to
      // zero. Freeze it in the central ten percent and solve only the radial
      // axis so a tiny finger move cannot spin the mark through several turns.
      let correction = freezeLongitude || currentV < -.9
        ? radialCorrection
        : solvePotterySurfaceDrag(residualX, residualY, uTangent, vTangent);
      if (!correction.du && !correction.dv) {
        // At the exact base center every longitude is the same point, so the U
        // tangent vanishes. Preserve the incoming longitude and solve the
        // remaining one-dimensional radial motion to let the mark move out
        // again instead of becoming permanently stuck there.
        correction = radialCorrection;
      }
      if (!correction.du && !correction.dv) break;
      const requestedV = currentV + correction.dv;
      const nextV = clamp(requestedV, MIN_DECORATION_SURFACE_V, 1);
      const hitVerticalEdge = Math.abs(nextV - requestedV) > 1e-9;
      let appliedDu = correction.du;
      if (hitVerticalEdge && Math.abs(correction.dv) > 1e-9) {
        // Stop on the exact edge along the solved surface path. Reusing the
        // full U correction after V was clamped would turn the unreachable
        // downward residual into a sudden trip around the circumference.
        const edgeFraction = clamp((nextV - currentV) / correction.dv, 0, 1);
        appliedDu *= edgeFraction;
      }
      currentU += appliedDu;
      currentV = nextV;
      if (hitVerticalEdge) break;
    }
    return { du: currentU - u, dv: currentV - v };
  }

  /**
   * Resolves a canvas point to the outer-wall surface coordinates under it
   * with a few Newton steps on the projected surface, so tapping places a
   * stamp correctly at any viewpoint. Returns null when the surface cannot
   * be resolved reliably.
   */
  screenToSurface(x: number, y: number): { u: number; v: number } | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const samples = this.work.outerRadius.length;
    let v = clamp(this.profilePositionAtCanvasY(y) / Math.max(1, samples - 1), 0, 1);
    // Start on the side facing the camera; past a pole the visible front is on
    // the opposite side of the orbit. The model rotation maps an object angle
    // theta to world theta + turntableAngle, so subtract it back to get the
    // object-space starting point for the refinement below.
    const facingTheta =
      Math.PI / 2 - this.viewYaw + (Math.cos(this.pitch) < 0 ? Math.PI : 0);
    let u = (facingTheta - this.turntableAngle) / (Math.PI * 2) + 0.5;
    for (let iteration = 0; iteration < 4; iteration++) {
      const projected = this.projectSurfacePoint(u, v);
      if (!projected) return null;
      const correction = this.surfaceDragDelta(
        u,
        v,
        x - projected.x,
        y - projected.y
      );
      if (!correction.du && !correction.dv) break;
      u += correction.du;
      v = clamp(v + correction.dv, MIN_DECORATION_SURFACE_V, 1);
    }
    return {
      u: ((u % 1) + 1) % 1,
      v: clamp(v, MIN_DECORATION_SURFACE_V, 1)
    };
  }

  destroy() {
    this.running = false;
    this.frameProcessor = null;
    if (this.frame && this.canvas.cancelAnimationFrame) {
      this.canvas.cancelAnimationFrame(this.frame);
    }
    const gl = this.gl;
    gl.deleteBuffer(this.vbo);
    gl.deleteBuffer(this.nbo);
    gl.deleteBuffer(this.cbo);
    gl.deleteBuffer(this.dbo);
    gl.deleteBuffer(this.ibo);
    gl.deleteTexture(this.inscriptionTexture);
    gl.deleteTexture(this.sealTexture);
    gl.deleteProgram(this.program);
  }

  private rebuild() {
    const settings = wx.getStorageSync("palm-kiln-settings") || {};
    const radialSegments = settings.quality === "low" ? 48 : settings.quality === "high" ? 88 : 64;
    const mesh = buildPotteryMesh(
      this.work.outerRadius,
      this.work.innerRadius,
      this.work.height,
      radialSegments
    );
    this.meshRadius = mesh.radius;
    this.meshHeight = mesh.height;
    this.geometrySignature = this.workGeometrySignature(this.work);

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    if (mesh.positions.byteLength === this.positionByteLength && gl.bufferSubData) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.positions);
    } else {
      gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);
      this.positionByteLength = mesh.positions.byteLength;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nbo);
    if (mesh.normals.byteLength === this.normalByteLength && gl.bufferSubData) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.normals);
    } else {
      gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.DYNAMIC_DRAW);
      this.normalByteLength = mesh.normals.byteLength;
    }
    if (mesh.topologyKey !== this.topologyKey) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.cavity, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.decorationSurface, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      this.topologyKey = mesh.topologyKey;
    }
    this.count = mesh.indices.length;
  }

  private resetCameraFit() {
    this.fitDistance = calculatePotteryCameraDistance(
      this.meshRadius,
      this.meshHeight,
      this.aspect,
      this.pitch
    );
    this.applyZoomLimits();
  }

  /** Keeps the camera outside the clay at any zoom so detail views never clip into the piece. */
  private applyZoomLimits() {
    const floor = Math.max(
      POTTERY_MIN_ZOOM_FACTOR,
      (this.meshRadius * 1.08 + 0.09) / Math.max(this.fitDistance, 0.01)
    );
    this.zoomFactor = clamp(this.zoomFactor, floor, POTTERY_MAX_ZOOM_FACTOR);
  }

  private ensureCameraFit() {
    if (!this.fitDistance) {
      this.resetCameraFit();
      return;
    }
    // Keep manipulation visually stable; only pull back when the generous
    // safety area would otherwise be crossed.
    const hardFit = calculatePotteryCameraDistance(
      this.meshRadius,
      this.meshHeight,
      this.aspect,
      this.pitch,
      POTTERY_MANIPULATION_VERTICAL_FILL,
      0.86
    );
    this.fitDistance = Math.max(this.fitDistance, hardFit);
    this.applyZoomLimits();
  }

  private projectModelY(modelY: number, distance: number): number {
    const focusY = this.calculateFocusY(distance);
    const relativeY = modelY - focusY;
    const depth = Math.max(0.08, distance - relativeY * Math.sin(this.pitch));
    const ndcY =
      (relativeY * Math.cos(this.pitch)) /
      (depth * Math.tan(POTTERY_VERTICAL_FOV / 2));
    return ((1 - ndcY) / 2) * this.viewportHeight;
  }

  private calculateFocusY(distance: number): number {
    if (this.potteryCentered) return 0;
    const anchored = calculatePotteryFocusY(
      this.meshHeight,
      distance,
      this.pitch,
      this.baseScreenY,
      this.work.outerRadius[0] || 0
    );
    // Deep zoom eases the focus from the wheel contact line to the body
    // center so a magnified patch anywhere on the piece can be orbited.
    const zoomSpan = POTTERY_DETAIL_FOCUS_START - POTTERY_DETAIL_FOCUS_END;
    const progress = clamp(
      (POTTERY_DETAIL_FOCUS_START - this.zoomFactor) / zoomSpan,
      0,
      1
    );
    const eased = progress * progress * (3 - progress * 2);
    return anchored * (1 - eased);
  }

  render() {
    const gl = this.gl;
    const program = this.program;
    const width = this.canvas.width || 1;
    const height = this.canvas.height || 1;

    gl.viewport(0, 0, width, height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);

    const distance = this.fitDistance * this.zoomFactor;
    const focusY = this.calculateFocusY(distance);
    const horizontalDistance = Math.cos(this.pitch) * distance;
    const eye = [
      Math.sin(this.viewYaw) * horizontalDistance,
      focusY + Math.sin(this.pitch) * distance,
      Math.cos(this.viewYaw) * horizontalDistance
    ];
    // Positive CSS rotation is clockwise on screen. WebGL's Y-axis convention
    // presents the same positive angle in the opposite visual direction from
    // the front camera, so invert it to keep clay and wheel turning together.
    const model = rotateY(-this.turntableAngle);
    // Tilt the up vector with the pitch so the camera crosses the poles
    // smoothly and keeps orbiting into a fully flipped view.
    const view = lookAt(eye, [0, focusY, 0], potteryOrbitUpVector(this.pitch, this.viewYaw));
    const projection = perspective(POTTERY_VERTICAL_FOV, width / height, 0.08, 40);
    const viewProjection = multiply(projection, view);
    this.modelMatrix = model;
    this.viewProjectionMatrix = viewProjection;

    const attribute = (name: string, buffer: any, size: number) => {
      const location = gl.getAttribLocation(program, name);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    };
    attribute("aPosition", this.vbo, 3);
    attribute("aNormal", this.nbo, 3);
    attribute("aCavity", this.cbo, 1);
    attribute("aDecorationSurface", this.dbo, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);

    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uViewProjection"), false, viewProjection);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uModel"), false, model);
    gl.uniform1f(gl.getUniformLocation(program, "uHeight"), this.meshHeight);

    const set3 = (name: string, value: number[]) =>
      gl.uniform3fv(gl.getUniformLocation(program, name), new Float32Array(value));
    const surface = potterySurfaceState(this.work.stageIndex);
    set3(
      "uBase",
      hexRgb(surface.porcelainFinish ? DECORATION_PORCELAIN_COLOR : clayColor(this.work))
    );
    set3("uGlaze", hexRgb(glazeColor(this.work)));
    set3("uCamera", eye);
    const lighting = LIGHTING[this.lighting];
    set3("uKeyDirection", lighting.keyDirection);
    set3("uFillDirection", lighting.fillDirection);
    set3("uKeyColor", lighting.keyColor);
    set3("uFillColor", lighting.fillColor);
    set3("uAmbient", lighting.ambient);
    gl.uniform1f(gl.getUniformLocation(program, "uKeyIntensity"), lighting.keyIntensity);
    gl.uniform1f(gl.getUniformLocation(program, "uFillIntensity"), lighting.fillIntensity);
    gl.uniform1f(gl.getUniformLocation(program, "uExposure"), lighting.exposure);

    gl.uniform1f(gl.getUniformLocation(program, "uClayGrain"), CLAY_GRAIN[this.work.clayId] ?? 0.62);
    gl.uniform1f(gl.getUniformLocation(program, "uClayWetness"), surface.clayWetness);
    gl.uniform1f(gl.getUniformLocation(program, "uPorcelainFinish"), surface.porcelainFinish);

    const glazeMix = this.work.stageIndex >= 2 ? (this.work.stageIndex >= 3 ? 1 : 0.72) : 0;
    gl.uniform1f(gl.getUniformLocation(program, "uGlazeMix"), glazeMix);
    const techniqueCode: Record<string, number> = {
      incise:0,
      stamp:1,
      underglaze:2,
      overglaze:3
    };
    const repeatCode: Record<string, number> = {
      single:0,
      pair:1,
      four:2,
      band:3,
      radial:4
    };
    const anchorCode: Record<string, number> = {
      rim:0,
      neck:1,
      shoulder:2,
      belly:3,
      foot:4,
      well:5,
      base:6
    };
    const layerA = new Float32Array(13 * 4);
    const layerB = new Float32Array(13 * 4);
    const layerC = new Float32Array(13 * 4);
    const layers = [
      ...this.work.decorationComposition.layers,
      ...this.work.decorationComposition.stamps
    ].slice(0, 13);
    layers.forEach((layer, index) => {
      const offset = index * 4;
      const color = hexRgb(decorationColorHex(layer.colorId));
      const techniqueAndRotation = (techniqueCode[layer.technique] ?? 0) +
        (clamp(layer.rotation, -180, 180) + 180) / 1000;
      layerA.set([
        layer.visible ? 1 : 0,
        motifShaderCode(layer.motifId),
        techniqueAndRotation,
        repeatCode[layer.repeatMode] ?? 0
      ], offset);
      layerB.set([
        layer.u,
        layer.v,
        layer.scaleX ?? layer.scale,
        (layer.flipY ? -1 : 1) * (layer.scaleY ?? layer.scale)
      ], offset);
      layerC.set([
        (anchorCode[layer.anchor] ?? 3) * 32 +
          (layer.repeatMode === "band" ? borderRepeatCount(layer.density) : layer.density),
        color[0],
        color[1],
        color[2]
      ], offset);
    });
    gl.uniform4fv(gl.getUniformLocation(program, "uLayerA[0]"), layerA);
    gl.uniform4fv(gl.getUniformLocation(program, "uLayerB[0]"), layerB);
    gl.uniform4fv(gl.getUniformLocation(program, "uLayerC[0]"), layerC);
    gl.uniform1f(
      gl.getUniformLocation(program, "uFiredPreview"),
      this.firedPreview || this.work.stageIndex >= 3 ? 1 : 0
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "uKilnSeed"),
      this.work.decorationComposition.kilnSeed % 100000
    );
    gl.uniform1f(gl.getUniformLocation(program, "uMaxRadius"), this.meshRadius);
    const footRadius = this.radiusAtHeight(0);
    gl.uniform1f(gl.getUniformLocation(program, "uFootRadius"), footRadius);

    const inscription = this.work.decorationComposition.inscription;
    const inscriptionAnchor: Record<string, number> = { base:0, well:1, lower_belly:2 };
    const inscriptionStyle: Record<string, number> = { blue:0, seal_red:1, incised:2 };
    const inscriptionColor = inscription?.styleId === "seal_red"
      ? "#a84f43"
      : inscription?.styleId === "incised"
        ? "#6f675b"
        : "#315e73";
    set3("uInscriptionColor", hexRgb(inscriptionColor));
    gl.uniform4fv(
      gl.getUniformLocation(program, "uInscriptionParams"),
      new Float32Array([
        inscription ? (inscriptionAnchor[inscription.anchor] ?? 0) : 0,
        inscription ? (inscriptionStyle[inscription.styleId] ?? 0) : 0,
        inscription && this.inscriptionTextureReady ? 1 : 0,
        1
      ])
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.inscriptionTexture);
    gl.uniform1i(gl.getUniformLocation(program, "uInscription"), 0);

    const seal = this.work.decorationComposition.sealMark;
    if (seal && this.sealTextureReady) {
      // 外壁继续用周长换算的 U 半宽；器底改用相同的物理半宽/半高，
      // 因而题款跨过足边或移动到器底中心时仍保持方正。
      const halfHeight = (SEAL_MARK_SIZE * seal.scaleY) / 2;
      const radius = this.radiusAtHeight(seal.v);
      const halfWidth = clamp(
        (SEAL_MARK_SIZE * seal.scaleX * this.meshHeight) /
          (4 * Math.PI * Math.max(0.05, radius)),
        0.02,
        0.42
      );
      gl.uniform4f(
        gl.getUniformLocation(program, "uSealRegion"),
        seal.u,
        seal.v,
        halfWidth,
        halfHeight
      );
      gl.uniform2f(
        gl.getUniformLocation(program, "uSealHalfSize"),
        (SEAL_MARK_SIZE * seal.scaleX * this.meshHeight) / 2,
        (SEAL_MARK_SIZE * seal.scaleY * this.meshHeight) / 2
      );
      set3("uSealColor", hexRgb(SEAL_MARK_COLORS[seal.colorId] || SEAL_MARK_COLORS.seal_red));
    } else {
      gl.uniform4f(gl.getUniformLocation(program, "uSealRegion"), 0, 0, 0, 0);
      gl.uniform2f(gl.getUniformLocation(program, "uSealHalfSize"), 1, 1);
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sealTexture);
    gl.uniform1i(gl.getUniformLocation(program, "uSeal"), 1);
    const methods: Record<string, number> = { full: 0, half: 1, brush: 2, splash: 3 };
    gl.uniform1f(
      gl.getUniformLocation(program, "uMethod"),
      methods[this.work.glazeMethod] ?? 0
    );
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
  }

  private loop(timestamp?: number) {
    if (!this.running) return;
    const now = Number.isFinite(timestamp) ? (timestamp as number) : Date.now();
    const elapsedSeconds = this.lastFrameTime
      ? clamp((now - this.lastFrameTime) / 1000, 0, 0.05)
      : 0;
    this.lastFrameTime = now;
    let shouldRender = this.frameProcessor ? this.frameProcessor() : false;
    if (this.autoRotate && elapsedSeconds > 0) {
      const frame = advancePotteryTurntableFrame(
        this.turntableAngle,
        this.currentRpm,
        this.targetRpm,
        elapsedSeconds * 1000
      );
      this.turntableAngle = frame.angle;
      this.currentRpm = frame.rpm;
      shouldRender = shouldRender || frame.rpm > 0;
    }
    if (shouldRender) this.render();
    this.frame = this.canvas.requestAnimationFrame((nextTimestamp: number) =>
      this.loop(nextTimestamp)
    );
  }
}
