const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

// Load the small, runtime-independent TypeScript geometry modules directly so
// the test exercises production code instead of maintaining another copy.
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2018, module: ts.ModuleKind.CommonJS }
  }).outputText;
  module._compile(output, filename);
};

const { buildPotteryMesh } = require("../core/pottery-mesh.ts");
const { createWork, validateWork } = require("../core/model.ts");
const { profileDeltaFromDrag } = require("../core/profile.ts");
const {
  DEFAULT_POTTERY_WALL,
  MAX_POTTERY_HEIGHT,
  MAX_POTTERY_RADIUS,
  MIN_POTTERY_RADIUS,
  MIN_POTTERY_WALL
} = require("../core/pottery-dimensions.ts");
const {
  POTTERY_VERTICAL_FOV,
  POTTERY_BASE_SCREEN_Y,
  POTTERY_MAX_PITCH,
  POTTERY_MANIPULATION_VERTICAL_FILL,
  POTTERY_MIN_PITCH,
  advancePotteryTurntable,
  advancePotteryTurntableFrame,
  calculatePotteryBaseScreenY,
  calculatePotteryBaseScreenYFromLayout,
  calculatePotteryOrbitDelta,
  calculatePotteryCameraDistance,
  calculatePotteryFocusY,
  calculatePotteryTargetRpm,
  calculatePotteryZoomFactor,
  defaultPotteryPitch,
  normalizePotteryYaw,
  potteryRpmToPeriodMs
} = require("../core/pottery-scene.ts");

const freshCup = createWork("cup");
for (let index = 3; index < freshCup.outerRadius.length; index++) {
  assert.ok(
    Math.abs(freshCup.outerRadius[index] - freshCup.innerRadius[index] - DEFAULT_POTTERY_WALL) <
      1e-9,
    "新作品应使用更轻薄且均匀的初始器壁"
  );
}
assert.ok(MAX_POTTERY_HEIGHT >= 3.4, "制坯高度上限应支持极高器形");
assert.ok(MIN_POTTERY_RADIUS <= 0.09, "制坯主体应能压缩到极细半径");
assert.ok(MAX_POTTERY_RADIUS >= 1.65, "制坯主体应能拉伸到极大半径");
assert.ok(MIN_POTTERY_WALL <= 0.018, "内腔应支持接近真实薄壁的最小厚度");
assert.ok(
  POTTERY_MANIPULATION_VERTICAL_FILL > 0.64,
  "高器形应能利用两侧控件之间更高的中央画面"
);
const oldThickDraft = JSON.parse(JSON.stringify(freshCup));
oldThickDraft.innerRadius = oldThickDraft.outerRadius.map((radius, index) =>
  index < 3 ? 0 : radius - 0.11
);
const upgradedDraft = validateWork(oldThickDraft);
assert.ok(upgradedDraft, "旧制坯草稿必须仍可加载");
for (let index = 3; index < upgradedDraft.innerRadius.length; index++) {
  assert.ok(
    Math.abs(
      upgradedDraft.outerRadius[index] -
        upgradedDraft.innerRadius[index] -
        DEFAULT_POTTERY_WALL
    ) < 1e-9,
    "旧制坯草稿加载后也应采用更薄的器壁"
  );
}

const extremeDraft = JSON.parse(JSON.stringify(freshCup));
extremeDraft.outerRadius = extremeDraft.outerRadius.map((_, index) =>
  index % 2 ? MAX_POTTERY_RADIUS : MIN_POTTERY_RADIUS
);
extremeDraft.height = MAX_POTTERY_HEIGHT;
const restoredExtremeDraft = validateWork(extremeDraft);
assert.ok(restoredExtremeDraft, "极限自由造型必须能从本地存储恢复");
assert.equal(restoredExtremeDraft.height, MAX_POTTERY_HEIGHT, "极高器形重载后不能被旧上限截断");
assert.equal(
  Math.min(...restoredExtremeDraft.outerRadius),
  MIN_POTTERY_RADIUS,
  "极细半径重载后不能被旧下限撑开"
);
assert.equal(
  Math.max(...restoredExtremeDraft.outerRadius),
  MAX_POTTERY_RADIUS,
  "极宽半径重载后不能被旧上限压回"
);

const ringCount = 48;
const radialSegments = 64;
const outer = Array.from({ length: ringCount }, (_, index) =>
  0.5 + Math.sin((index / (ringCount - 1)) * Math.PI) * 0.18
);
const inner = outer.map((radius, index) => (index < 3 ? 0 : radius - 0.11));
const mesh = buildPotteryMesh(outer, inner, 1.2, radialSegments);
const reshapedMesh = buildPotteryMesh(
  outer.map((radius, index) => radius + (index > 12 ? 0.01 : 0)),
  inner,
  1.2,
  radialSegments
);
assert.equal(mesh.topologyKey, reshapedMesh.topologyKey, "只改剖面时应复用固定拓扑");
assert.equal(mesh.indices, reshapedMesh.indices, "只改剖面时不应重新分配索引");
assert.equal(mesh.cavity, reshapedMesh.cavity, "只改剖面时不应重新分配静态内腔属性");
assert.notEqual(
  mesh.topologyKey,
  buildPotteryMesh(outer, inner, 1.2, 48).topologyKey,
  "画质档变化时必须重建拓扑"
);

assert.equal(mesh.positions.length, mesh.normals.length, "每个顶点都必须有法线");
assert.equal(mesh.positions.length / 3, mesh.cavity.length, "每个顶点都必须标记内外表面");
assert.ok(mesh.positions.every(Number.isFinite), "顶点不能包含 NaN/Infinity");
assert.ok(mesh.normals.every(Number.isFinite), "法线不能包含 NaN/Infinity");
assert.ok(mesh.cavity.every((value) => value >= 0 && value <= 1), "内腔遮蔽权重必须有效");
assert.ok(mesh.indices.every((index) => index < mesh.positions.length / 3), "索引必须落在顶点范围内");
assert.ok(mesh.innerStartRing >= 2, "内腔必须留出有厚度的实心底足");

for (const shapeId of ["cup", "bowl", "vase", "jar", "plate"]) {
  const work = createWork(shapeId);
  for (const qualitySegments of [48, 64, 88]) {
    const actual = buildPotteryMesh(
      work.outerRadius,
      work.innerRadius,
      work.height,
      qualitySegments
    );
    assert.ok(actual.indices.length > 0, `${shapeId}/${qualitySegments} 必须生成完整网格`);
    assert.ok(
      actual.indices.every((index) => index < actual.positions.length / 3),
      `${shapeId}/${qualitySegments} 不得生成越界索引`
    );
    assert.ok(actual.positions.every(Number.isFinite), `${shapeId}/${qualitySegments} 顶点必须有效`);
  }
}

for (const part of ["outer", "inner", "rim", "bottom", "floor"]) {
  const range = mesh.ranges[part];
  assert.ok(range.indexCount > 0, `${part} 必须生成三角形`);
  assert.equal(range.indexCount % 3, 0, `${part} 索引必须组成完整三角形`);
  for (let offset = range.indexOffset; offset < range.indexOffset + range.indexCount; offset += 3) {
    const ia = mesh.indices[offset] * 3;
    const ib = mesh.indices[offset + 1] * 3;
    const ic = mesh.indices[offset + 2] * 3;
    const ab = [
      mesh.positions[ib] - mesh.positions[ia],
      mesh.positions[ib + 1] - mesh.positions[ia + 1],
      mesh.positions[ib + 2] - mesh.positions[ia + 2]
    ];
    const ac = [
      mesh.positions[ic] - mesh.positions[ia],
      mesh.positions[ic + 1] - mesh.positions[ia + 1],
      mesh.positions[ic + 2] - mesh.positions[ia + 2]
    ];
    const face = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];
    const normal = [
      mesh.normals[ia] + mesh.normals[ib] + mesh.normals[ic],
      mesh.normals[ia + 1] + mesh.normals[ib + 1] + mesh.normals[ic + 1],
      mesh.normals[ia + 2] + mesh.normals[ib + 2] + mesh.normals[ic + 2]
    ];
    const orientation = face[0] * normal[0] + face[1] * normal[1] + face[2] * normal[2];
    assert.ok(orientation > 0, `${part} 的三角形绕序必须与可见面法线一致`);
  }
}

for (let index = 0; index < mesh.normals.length; index += 3) {
  const length = Math.hypot(mesh.normals[index], mesh.normals[index + 1], mesh.normals[index + 2]);
  assert.ok(Math.abs(length - 1) < 1e-5, "法线必须归一化，避免局部明暗跳变");
}

for (const sample of [
  { name: "cup", radius: 0.59, footRadius: 0.52, height: 1.2 },
  { name: "bowl", radius: 0.9, footRadius: 0.56, height: 1.2 },
  { name: "plate", radius: 1.14, footRadius: 0.72, height: 0.58 },
  { name: "extreme-tall", radius: 0.32, footRadius: 0.2, height: MAX_POTTERY_HEIGHT },
  { name: "extreme-wide", radius: MAX_POTTERY_RADIUS, footRadius: 0.72, height: 0.72 },
  {
    name: "extreme-freeform",
    radius: MAX_POTTERY_RADIUS,
    footRadius: MAX_POTTERY_RADIUS,
    height: MAX_POTTERY_HEIGHT
  }
]) {
  const aspect = 0.72;
  const pitch = defaultPotteryPitch(sample.radius, sample.height);
  const distance = calculatePotteryCameraDistance(sample.radius, sample.height, aspect, pitch);
  const focusY = calculatePotteryFocusY(
    sample.height,
    distance,
    pitch,
    POTTERY_BASE_SCREEN_Y,
    sample.footRadius
  );
  const tangent = Math.tan(POTTERY_VERTICAL_FOV / 2);
  const projectedHalfHeight =
    (sample.height / 2) * Math.cos(pitch) + sample.radius * Math.sin(pitch);
  const horizontalNdc = sample.radius / (distance * tangent * aspect);
  const verticalNdc = projectedHalfHeight / (distance * tangent);
  assert.ok(horizontalNdc <= 0.65, `${sample.name} 横向必须以适中比例进入画面`);
  assert.ok(verticalNdc <= 0.43, `${sample.name} 纵向必须以适中比例进入画面`);
  assert.ok(horizontalNdc / 0.82 < 0.9, `${sample.name} 最大允许放大时也不应穿出画面`);
  const bottomRelativeToFocus = -sample.height / 2 - focusY;
  const bottomNdc =
    ((bottomRelativeToFocus * Math.cos(pitch) - sample.footRadius * Math.sin(pitch)) /
      (distance -
        bottomRelativeToFocus * Math.sin(pitch) -
        sample.footRadius * Math.cos(pitch))) /
    tangent;
  const bottomScreenY = (1 - bottomNdc) / 2;
  assert.ok(
    Math.abs(bottomScreenY - POTTERY_BASE_SCREEN_Y) < 1e-6,
    `${sample.name} 器底可见前沿必须落在转盘接触线`
  );
}

const tallHeight = MAX_POTTERY_HEIGHT;
const tallRadius = 0.45;
const tallFootRadius = 0.38;
const tallAspect = 0.72;
const tallPitch = defaultPotteryPitch(tallRadius, tallHeight);
const tallDistance = calculatePotteryCameraDistance(
  tallRadius,
  tallHeight,
  tallAspect,
  tallPitch,
  POTTERY_MANIPULATION_VERTICAL_FILL,
  0.86
);
const tallFocus = calculatePotteryFocusY(
  tallHeight,
  tallDistance,
  tallPitch,
  POTTERY_BASE_SCREEN_Y,
  tallFootRadius
);
const tallTopRelative = tallHeight / 2 - tallFocus;
const tallTopDepth = tallDistance - tallTopRelative * Math.sin(tallPitch);
const tallTopNdc =
  (tallTopRelative * Math.cos(tallPitch)) /
  (tallTopDepth * Math.tan(POTTERY_VERTICAL_FOV / 2));
const tallTopScreenY = (1 - tallTopNdc) / 2;
assert.ok(tallTopScreenY >= 0.025, "极限高器形的口沿必须保留防裁切余量");
assert.ok(tallTopScreenY <= 0.065, "极限高器形应尽量向中央画面顶部延伸");

const fullOrbit = calculatePotteryOrbitDelta(375, 0, 375, 600);
assert.ok(Math.abs(fullOrbit.yaw - Math.PI * 2) < 1e-10, "横向移动一屏必须可查看完整 360 度");
assert.ok(
  Math.abs(normalizePotteryYaw(0.23 + Math.PI * 8) - 0.23) < 1e-10,
  "连续环绕后视角必须保持数值稳定"
);
assert.equal(calculatePotteryOrbitDelta(Number.NaN, Number.NaN, 0, 0).yaw, 0, "异常手势不能污染相机");
assert.ok(POTTERY_MIN_PITCH < -1.2, "双指俯视必须能越过器底观察下方");
assert.ok(POTTERY_MAX_PITCH > 1.2, "双指仰视必须能越过口沿观察内腔");
assert.ok(
  calculatePotteryOrbitDelta(0, 600, 375, 600).pitch > 2.7,
  "一次纵向整屏拖动应覆盖从底部到顶部的完整视角"
);
assert.ok(
  Math.abs(
    calculatePotteryCameraDistance(0.7, 1.2, 0.72, -1.1) -
      calculatePotteryCameraDistance(0.7, 1.2, 0.72, 1.1)
  ) < 1e-10,
  "俯视与仰视必须使用对称安全的相机包围范围"
);
for (const extremePitch of [POTTERY_MIN_PITCH, POTTERY_MAX_PITCH]) {
  const extremeFocus = calculatePotteryFocusY(1.2, 6.4, extremePitch, 0.9, 0.55);
  assert.ok(Number.isFinite(extremeFocus), "极端俯仰时相机焦点不能发散");
  assert.ok(Math.abs(extremeFocus) < 0.8, "越过口沿或底足时应平滑转为绕作品中心观察");
}

assert.ok(calculatePotteryZoomFactor(1, 1.25) < 1, "双指张开必须放大作品");
assert.ok(calculatePotteryZoomFactor(1, 0.8) > 1, "双指合拢必须缩小作品");
const oneSecondTurn = advancePotteryTurntable(0, 1000);
let sixtyFrameTurn = 0;
for (let frame = 0; frame < 60; frame++) {
  sixtyFrameTurn = advancePotteryTurntable(sixtyFrameTurn, 1000 / 60);
}
assert.ok(Math.abs(oneSecondTurn - sixtyFrameTurn) < 1e-10, "转盘速度不能随帧率变化");

assert.equal(calculatePotteryBaseScreenY(568), 0.72, "短屏接触线应保持在 72%");
assert.equal(calculatePotteryBaseScreenY(932), 0.75, "长屏接触线可下移到 75%");
assert.equal(
  calculatePotteryBaseScreenYFromLayout(100, 500, 525),
  0.85,
  "WebGL 器底必须跟随实测转盘上沿"
);
assert.ok(
  calculatePotteryBaseScreenY(812) > 0.739 && calculatePotteryBaseScreenY(812) < 0.741,
  "常规长屏接触线应约为 74%"
);
assert.equal(calculatePotteryTargetRpm(0.55, "idle"), 44, "窄器形空闲时应为 44 RPM");
assert.equal(calculatePotteryTargetRpm(1.1, "idle"), 32, "宽器形空闲时应降到 32 RPM");
assert.equal(calculatePotteryTargetRpm(0.55, "shaping"), 30, "触摸窄器形应降到 30 RPM");
assert.equal(calculatePotteryTargetRpm(1.1, "orbit"), 18, "观察宽器形应降到 18 RPM");
assert.equal(calculatePotteryTargetRpm(0.7, "reduced"), 0, "减少动态必须完全停转");
assert.equal(potteryRpmToPeriodMs(30), 2000, "RPM 与 CSS 单圈时间必须可共享换算");

function replayTurntable(frameRate) {
  let frame = { angle: 0, rpm: 44 };
  for (let index = 0; index < frameRate; index++) {
    frame = advancePotteryTurntableFrame(
      frame.angle,
      frame.rpm,
      24,
      1000 / frameRate
    );
  }
  return frame;
}
const turn30 = replayTurntable(30);
const turn120 = replayTurntable(120);
assert.ok(Math.abs(turn30.angle - turn120.angle) < 0.002, "平滑减速角度应基本不受帧率影响");
assert.ok(Math.abs(turn30.rpm - turn120.rpm) < 0.002, "平滑减速目标应基本不受帧率影响");
assert.ok(turn30.rpm < 26, "一秒后应平滑接近观察目标转速");

const gentleDrag = profileDeltaFromDrag(4, 375);
const delayedEvent = profileDeltaFromDrag(80, 375);
assert.ok(
  gentleDrag > 0.008 && gentleDrag < 0.012,
  "小幅捏塑移动也应立即产生高灵敏响应"
);
assert.ok(delayedEvent < 0.05, "单次延迟触摸事件仍不能让器形失控跳变");
assert.equal(profileDeltaFromDrag(Number.NaN, 375), 0, "异常触摸位移不能改变器形");

console.log("pottery engine tests passed: extreme mesh, complete camera fit, 360 orbit and sensitive input");
