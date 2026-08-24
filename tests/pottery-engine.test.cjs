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
const { createWork } = require("../core/model.ts");
const { profileDeltaFromDrag } = require("../core/profile.ts");
const {
  POTTERY_VERTICAL_FOV,
  POTTERY_BASE_SCREEN_Y,
  advancePotteryTurntable,
  calculatePotteryOrbitDelta,
  calculatePotteryCameraDistance,
  calculatePotteryFocusY,
  calculatePotteryZoomFactor,
  defaultPotteryPitch,
  normalizePotteryYaw
} = require("../core/pottery-scene.ts");

const ringCount = 48;
const radialSegments = 64;
const outer = Array.from({ length: ringCount }, (_, index) =>
  0.5 + Math.sin((index / (ringCount - 1)) * Math.PI) * 0.18
);
const inner = outer.map((radius, index) => (index < 3 ? 0 : radius - 0.11));
const mesh = buildPotteryMesh(outer, inner, 1.2, radialSegments);

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
  { name: "plate", radius: 1.14, footRadius: 0.72, height: 0.58 }
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

const fullOrbit = calculatePotteryOrbitDelta(375, 0, 375, 600);
assert.ok(Math.abs(fullOrbit.yaw - Math.PI * 2) < 1e-10, "横向移动一屏必须可查看完整 360 度");
assert.ok(
  Math.abs(normalizePotteryYaw(0.23 + Math.PI * 8) - 0.23) < 1e-10,
  "连续环绕后视角必须保持数值稳定"
);
assert.equal(calculatePotteryOrbitDelta(Number.NaN, Number.NaN, 0, 0).yaw, 0, "异常手势不能污染相机");

assert.ok(calculatePotteryZoomFactor(1, 1.25) < 1, "双指张开必须放大作品");
assert.ok(calculatePotteryZoomFactor(1, 0.8) > 1, "双指合拢必须缩小作品");
const oneSecondTurn = advancePotteryTurntable(0, 1000);
let sixtyFrameTurn = 0;
for (let frame = 0; frame < 60; frame++) {
  sixtyFrameTurn = advancePotteryTurntable(sixtyFrameTurn, 1000 / 60);
}
assert.ok(Math.abs(oneSecondTurn - sixtyFrameTurn) < 1e-10, "转盘速度不能随帧率变化");

const gentleDrag = profileDeltaFromDrag(4, 375);
const delayedEvent = profileDeltaFromDrag(80, 375);
assert.ok(gentleDrag > 0 && gentleDrag < 0.004, "日常捏塑移动应细腻响应");
assert.ok(delayedEvent < 0.014, "单次延迟触摸事件不能让器形骤然跳变");
assert.equal(profileDeltaFromDrag(Number.NaN, 375), 0, "异常触摸位移不能改变器形");

console.log("pottery engine tests passed: mesh, camera fit, 360 orbit, gentle shaping input");
