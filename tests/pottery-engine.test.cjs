const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

// Load the small, runtime-independent TypeScript geometry modules directly so
// the test exercises production code instead of maintaining another copy.
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2018,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  module._compile(output, filename);
};

const {
  buildPotteryMesh,
  DECORATION_SURFACE_BASE,
  DECORATION_SURFACE_NONE,
  DECORATION_SURFACE_WALL,
  POTTERY_FOOT_BEVEL_BANDS,
  POTTERY_RIM_BANDS,
} = require("../core/pottery-mesh.ts");
const { createWork, validateWork } = require("../core/model.ts");
const { profileDeltaFromDrag } = require("../core/profile.ts");
const {
  DECORATION_PORCELAIN_COLOR,
  MAX_RENDERED_DECORATIONS,
  PotteryEngine,
  potteryLightingPreset,
  potterySurfaceState,
} = require("../core/pottery-engine.ts");
const {
  DEFAULT_POTTERY_WALL,
  MAX_POTTERY_HEIGHT,
  MAX_POTTERY_RADIUS,
  MIN_POTTERY_RADIUS,
  MIN_POTTERY_WALL,
} = require("../core/pottery-dimensions.ts");
const {
  POTTERY_VERTICAL_FOV,
  POTTERY_BASE_SCREEN_Y,
  POTTERY_MAX_PITCH,
  POTTERY_MANIPULATION_VERTICAL_FILL,
  POTTERY_MAX_ZOOM_FACTOR,
  POTTERY_MIN_PITCH,
  POTTERY_MIN_ZOOM_FACTOR,
  advancePotteryTurntable,
  advancePotteryTurntableFrame,
  calculatePotteryBaseScreenY,
  calculatePotteryBaseScreenYFromLayout,
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
  potteryRpmToPeriodMs,
  solvePotterySurfaceDrag,
} = require("../core/pottery-scene.ts");

assert.equal(
  calculatePreservedPotteryCameraDistance(3.2, 320, 640),
  6.4,
  "装饰抽屉收起后应按画布高度同比调整相机距离，保持瓷器视觉尺寸",
);

assert.equal(DECORATION_PORCELAIN_COLOR, "#cfd9d4", "装饰素坯应使用温润且保留明暗层次的青白瓷色");
assert.equal(MAX_RENDERED_DECORATIONS, 32, "WebGL 必须为大量图样与落印预留足够渲染槽位");
assert.deepEqual(
  potterySurfaceState(1),
  { clayWetness: 0.08, porcelainFinish: 1, ceramicMaturity: 0.18 },
  "进入装饰后应完全切换到细腻素瓷材质",
);
assert.equal(
  potterySurfaceState(0).porcelainFinish,
  0,
  "制坯阶段仍应保留湿泥质感",
);
assert.equal(
  potterySurfaceState(2).porcelainFinish,
  0,
  "上釉阶段应交回釉色材质控制",
);
assert.ok(
  potterySurfaceState(4).ceramicMaturity > potterySurfaceState(2).ceramicMaturity,
  "高温烧制后的釉上彩绘页必须使用比上釉页更成熟的玻化釉面",
);
assert.equal(potterySurfaceState(5).ceramicMaturity, 1, "成品展台必须使用完全成熟的最终釉面");
assert.equal(potteryLightingPreset(1), "window", "装饰页应使用柔和窗光显出瓷面弧度");
assert.equal(potteryLightingPreset(2), "window", "上釉页应以窗光呈现湿釉的宽高光");
assert.equal(potteryLightingPreset(4), "museum", "烧成后的彩绘页应升级为展陈级塑形光");

const freshCup = createWork("cup");
for (let index = 3; index < freshCup.outerRadius.length; index++) {
  assert.ok(
    Math.abs(
      freshCup.outerRadius[index] -
        freshCup.innerRadius[index] -
        DEFAULT_POTTERY_WALL,
    ) < 1e-9,
    "新作品应使用更轻薄且均匀的初始器壁",
  );
}
assert.ok(MAX_POTTERY_HEIGHT >= 3.4, "制坯高度上限应支持极高器形");
assert.ok(MIN_POTTERY_RADIUS <= 0.09, "制坯主体应能压缩到极细半径");
assert.ok(MAX_POTTERY_RADIUS >= 1.65, "制坯主体应能拉伸到极大半径");
assert.ok(MIN_POTTERY_WALL <= 0.018, "内腔应支持接近真实薄壁的最小厚度");
assert.ok(
  POTTERY_MANIPULATION_VERTICAL_FILL > 0.64,
  "高器形应能利用两侧控件之间更高的中央画面",
);
const oldThickDraft = JSON.parse(JSON.stringify(freshCup));
oldThickDraft.innerRadius = oldThickDraft.outerRadius.map((radius, index) =>
  index < 3 ? 0 : radius - 0.11,
);
const upgradedDraft = validateWork(oldThickDraft);
assert.ok(upgradedDraft, "旧制坯草稿必须仍可加载");
for (let index = 3; index < upgradedDraft.innerRadius.length; index++) {
  assert.ok(
    Math.abs(
      upgradedDraft.outerRadius[index] -
        upgradedDraft.innerRadius[index] -
        DEFAULT_POTTERY_WALL,
    ) < 1e-9,
    "旧制坯草稿加载后也应采用更薄的器壁",
  );
}

const extremeDraft = JSON.parse(JSON.stringify(freshCup));
extremeDraft.outerRadius = extremeDraft.outerRadius.map((_, index) =>
  index % 2 ? MAX_POTTERY_RADIUS : MIN_POTTERY_RADIUS,
);
extremeDraft.height = MAX_POTTERY_HEIGHT;
const restoredExtremeDraft = validateWork(extremeDraft);
assert.ok(restoredExtremeDraft, "极限自由造型必须能从本地存储恢复");
assert.equal(
  restoredExtremeDraft.height,
  MAX_POTTERY_HEIGHT,
  "极高器形重载后不能被旧上限截断",
);
assert.equal(
  Math.min(...restoredExtremeDraft.outerRadius),
  MIN_POTTERY_RADIUS,
  "极细半径重载后不能被旧下限撑开",
);
assert.equal(
  Math.max(...restoredExtremeDraft.outerRadius),
  MAX_POTTERY_RADIUS,
  "极宽半径重载后不能被旧上限压回",
);

const ringCount = 48;
const radialSegments = 64;
const outer = Array.from(
  { length: ringCount },
  (_, index) => 0.5 + Math.sin((index / (ringCount - 1)) * Math.PI) * 0.18,
);
const inner = outer.map((radius, index) => (index < 3 ? 0 : radius - 0.11));
const mesh = buildPotteryMesh(outer, inner, 1.2, radialSegments);
const reshapedMesh = buildPotteryMesh(
  outer.map((radius, index) => radius + (index > 12 ? 0.01 : 0)),
  inner,
  1.2,
  radialSegments,
);
assert.equal(
  mesh.topologyKey,
  reshapedMesh.topologyKey,
  "只改剖面时应复用固定拓扑",
);
assert.equal(mesh.indices, reshapedMesh.indices, "只改剖面时不应重新分配索引");
assert.equal(
  mesh.cavity,
  reshapedMesh.cavity,
  "只改剖面时不应重新分配静态内腔属性",
);
assert.equal(
  mesh.decorationSurface,
  reshapedMesh.decorationSurface,
  "只改剖面时不应重新分配静态装饰表面属性",
);
assert.notEqual(
  mesh.topologyKey,
  buildPotteryMesh(outer, inner, 1.2, 48).topologyKey,
  "画质档变化时必须重建拓扑",
);

assert.equal(
  mesh.positions.length,
  mesh.normals.length,
  "每个顶点都必须有法线",
);
assert.equal(
  mesh.positions.length / 3,
  mesh.cavity.length,
  "每个顶点都必须标记内外表面",
);
assert.equal(
  mesh.positions.length / 3,
  mesh.decorationSurface.length,
  "每个顶点都必须标记所属装饰表面",
);
assert.ok(mesh.positions.every(Number.isFinite), "顶点不能包含 NaN/Infinity");
assert.ok(mesh.normals.every(Number.isFinite), "法线不能包含 NaN/Infinity");
assert.ok(
  mesh.cavity.every((value) => value >= 0 && value <= 1),
  "内腔遮蔽权重必须有效",
);
assert.ok(
  mesh.decorationSurface.every((value) =>
    [DECORATION_SURFACE_NONE, DECORATION_SURFACE_WALL, DECORATION_SURFACE_BASE]
      .includes(value),
  ),
  "装饰表面标记必须明确区分非装饰面、外壁和器底",
);
for (const index of mesh.indices.slice(
  mesh.ranges.outer.indexOffset,
  mesh.ranges.outer.indexOffset + mesh.ranges.outer.indexCount,
)) {
  assert.equal(
    mesh.decorationSurface[index],
    DECORATION_SURFACE_WALL,
    "外壁必须完整接受可拖动纹样",
  );
}
for (const index of mesh.indices.slice(
  mesh.ranges.bottom.indexOffset,
  mesh.ranges.bottom.indexOffset + mesh.ranges.bottom.indexCount,
)) {
  assert.equal(
    mesh.decorationSurface[index],
    DECORATION_SURFACE_BASE,
    "器底必须使用独立平面坐标接受可拖动纹样",
  );
}
const engineSource = fs.readFileSync("core/pottery-engine.ts", "utf8");
assert.match(
  engineSource,
  /baseSurface\s*=\s*decorationSurfaceMask\(2\.0\)/,
  "器底渲染必须读取独立表面标记，不能再次关闭底部图案",
);
assert.match(
  engineSource,
  /dot\(objectPos\.xz, baseTangent\)/,
  "器底纹样必须使用笛卡尔切线坐标，不能退回 atan 放射映射",
);
assert.match(
  engineSource,
  /float baseCopyCenterU = layerB\.x;/,
  "器底纹样方向必须由图层固定，不能按每个三角形的极角分片",
);
assert.doesNotMatch(
  engineSource,
  /atan\(vObjectPos\.z, vObjectPos\.x\)/,
  "器底中心不得再执行未定义的 atan(0, 0) 极坐标计算",
);
assert.match(
  engineSource,
  /float atCenter = 1\.0 - step\(1e-8, dot\(point, point\)\)/,
  "角度计算必须为器底中心提供跨 GPU 一致的方向",
);
assert.match(
  engineSource,
  /dot\(objectPos\.xz, baseTangent\)\s*\/\s*max\(\.001, layerHorizontalUnit\)/,
  "器身与器底必须共用同一横向物理尺寸，避免越过足边时突然缩放",
);
assert.match(
  engineSource,
  /max\(\.001, layerVerticalUnit\)/,
  "器身与器底必须共用同一纵向物理尺寸，避免越过足边时突然拉伸",
);
assert.equal(
  (engineSource.match(/uniform mediump float uHeight;/g) || []).length,
  2,
  "顶点与片元着色器共享的高度 uniform 必须使用相同精度才能成功链接",
);
assert.match(
  engineSource,
  /decorationLayerMaskAt\([\s\S]*?vObjectPos \+ objectReliefTangent \* reliefStep/,
  "刻花必须沿器物切向采样沟槽坡度，不能继续使用平面压暗假装凹刻",
);
assert.match(
  engineSource,
  /normal = normalize\([\s\S]*?tangent \* incisionSlope\.x[\s\S]*?bitangent \* incisionSlope\.y/,
  "刻花坡度必须真实扰动表面法线，让凹槽随光线方向变化",
);
assert.match(
  engineSource,
  /incisionReflectance[\s\S]*?clearcoat \*= incisionReflectance/,
  "刻花槽底必须压低釉面高光，形成真实内凹材质层次",
);
assert.ok(
  mesh.indices.every((index) => index < mesh.positions.length / 3),
  "索引必须落在顶点范围内",
);
assert.ok(mesh.innerStartRing >= 2, "内腔必须留出有厚度的实心底足");

const compressedThickOuter = Array.from(
  { length: ringCount },
  (_, index) => 0.47 + Math.sin((index / (ringCount - 1)) * Math.PI) * 0.1,
);
const compressedThickInner = compressedThickOuter.map((radius, index) =>
  index < 3 ? 0 : radius - 0.18,
);
const compressedThickMesh = buildPotteryMesh(
  compressedThickOuter,
  compressedThickInner,
  0.48,
  radialSegments,
);
const rimOffset = compressedThickMesh.ranges.rim.indexOffset;
const rimOuterVertex = compressedThickMesh.indices[rimOffset];
const lastRimBandOffset = rimOffset + (POTTERY_RIM_BANDS - 1) * radialSegments * 6;
const rimInnerVertex = compressedThickMesh.indices[lastRimBandOffset + 1];
const rimOuterX = compressedThickMesh.positions[rimOuterVertex * 3];
const rimOuterY = compressedThickMesh.positions[rimOuterVertex * 3 + 1];
const rimInnerX = compressedThickMesh.positions[rimInnerVertex * 3];
const rimInnerY = compressedThickMesh.positions[rimInnerVertex * 3 + 1];
assert.ok(
  Math.abs(rimOuterX - compressedThickOuter.at(-1)) < 1e-6,
  "厚壁压矮后口沿外缘必须与瓶身连续",
);
assert.ok(
  Math.abs(rimInnerX - compressedThickInner.at(-1)) < 1e-6,
  "厚壁压矮后口沿内缘必须与内壁连续",
);
assert.ok(
  Math.abs(rimOuterY - rimInnerY) < 1e-6,
  "厚壁压矮后口沿两侧接缝必须保持同高",
);
assert.ok(POTTERY_RIM_BANDS >= 8, "口沿需要足够分段形成细腻圆润的倒角");
assert.ok(POTTERY_FOOT_BEVEL_BANDS >= 4, "底足需要多段圆弧过渡，不能保持尖锐直角");
const bottomRingVertex = compressedThickMesh.indices[compressedThickMesh.ranges.bottom.indexOffset + 1];
const bottomRingRadius = Math.hypot(
  compressedThickMesh.positions[bottomRingVertex * 3],
  compressedThickMesh.positions[bottomRingVertex * 3 + 2],
);
assert.ok(
  bottomRingRadius < compressedThickOuter[0],
  "底面边缘必须自然内收，为器身到底面留出真实倒角",
);

for (const shapeId of ["cup", "bowl", "vase", "jar", "plate"]) {
  const work = createWork(shapeId);
  for (const qualitySegments of [48, 64, 88]) {
    const actual = buildPotteryMesh(
      work.outerRadius,
      work.innerRadius,
      work.height,
      qualitySegments,
    );
    assert.ok(
      actual.indices.length > 0,
      `${shapeId}/${qualitySegments} 必须生成完整网格`,
    );
    assert.ok(
      actual.indices.every((index) => index < actual.positions.length / 3),
      `${shapeId}/${qualitySegments} 不得生成越界索引`,
    );
    assert.ok(
      actual.positions.every(Number.isFinite),
      `${shapeId}/${qualitySegments} 顶点必须有效`,
    );
  }
}

for (const part of ["outer", "inner", "rim", "bottom", "floor"]) {
  const range = mesh.ranges[part];
  assert.ok(range.indexCount > 0, `${part} 必须生成三角形`);
  assert.equal(range.indexCount % 3, 0, `${part} 索引必须组成完整三角形`);
  for (
    let offset = range.indexOffset;
    offset < range.indexOffset + range.indexCount;
    offset += 3
  ) {
    const ia = mesh.indices[offset] * 3;
    const ib = mesh.indices[offset + 1] * 3;
    const ic = mesh.indices[offset + 2] * 3;
    const ab = [
      mesh.positions[ib] - mesh.positions[ia],
      mesh.positions[ib + 1] - mesh.positions[ia + 1],
      mesh.positions[ib + 2] - mesh.positions[ia + 2],
    ];
    const ac = [
      mesh.positions[ic] - mesh.positions[ia],
      mesh.positions[ic + 1] - mesh.positions[ia + 1],
      mesh.positions[ic + 2] - mesh.positions[ia + 2],
    ];
    const face = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const normal = [
      mesh.normals[ia] + mesh.normals[ib] + mesh.normals[ic],
      mesh.normals[ia + 1] + mesh.normals[ib + 1] + mesh.normals[ic + 1],
      mesh.normals[ia + 2] + mesh.normals[ib + 2] + mesh.normals[ic + 2],
    ];
    const orientation =
      face[0] * normal[0] + face[1] * normal[1] + face[2] * normal[2];
    assert.ok(orientation > 0, `${part} 的三角形绕序必须与可见面法线一致`);
  }
}

for (let index = 0; index < mesh.normals.length; index += 3) {
  const length = Math.hypot(
    mesh.normals[index],
    mesh.normals[index + 1],
    mesh.normals[index + 2],
  );
  assert.ok(Math.abs(length - 1) < 1e-5, "法线必须归一化，避免局部明暗跳变");
}

for (const sample of [
  { name: "cup", radius: 0.59, footRadius: 0.52, height: 1.2 },
  { name: "bowl", radius: 0.9, footRadius: 0.56, height: 1.2 },
  { name: "plate", radius: 1.14, footRadius: 0.72, height: 0.58 },
  {
    name: "extreme-tall",
    radius: 0.32,
    footRadius: 0.2,
    height: MAX_POTTERY_HEIGHT,
  },
  {
    name: "extreme-wide",
    radius: MAX_POTTERY_RADIUS,
    footRadius: 0.72,
    height: 0.72,
  },
  {
    name: "extreme-freeform",
    radius: MAX_POTTERY_RADIUS,
    footRadius: MAX_POTTERY_RADIUS,
    height: MAX_POTTERY_HEIGHT,
  },
]) {
  const aspect = 0.72;
  const pitch = defaultPotteryPitch(sample.radius, sample.height);
  const distance = calculatePotteryCameraDistance(
    sample.radius,
    sample.height,
    aspect,
    pitch,
  );
  const focusY = calculatePotteryFocusY(
    sample.height,
    distance,
    pitch,
    POTTERY_BASE_SCREEN_Y,
    sample.footRadius,
  );
  const tangent = Math.tan(POTTERY_VERTICAL_FOV / 2);
  const projectedHalfHeight =
    (sample.height / 2) * Math.cos(pitch) + sample.radius * Math.sin(pitch);
  const horizontalNdc = sample.radius / (distance * tangent * aspect);
  const verticalNdc = projectedHalfHeight / (distance * tangent);
  assert.ok(horizontalNdc <= 0.65, `${sample.name} 横向必须以适中比例进入画面`);
  assert.ok(verticalNdc <= 0.43, `${sample.name} 纵向必须以适中比例进入画面`);
  assert.ok(
    horizontalNdc / 0.82 < 0.9,
    `${sample.name} 最大允许放大时也不应穿出画面`,
  );
  const bottomRelativeToFocus = -sample.height / 2 - focusY;
  const bottomNdc =
    (bottomRelativeToFocus * Math.cos(pitch) -
      sample.footRadius * Math.sin(pitch)) /
    (distance -
      bottomRelativeToFocus * Math.sin(pitch) -
      sample.footRadius * Math.cos(pitch)) /
    tangent;
  const bottomScreenY = (1 - bottomNdc) / 2;
  assert.ok(
    Math.abs(bottomScreenY - POTTERY_BASE_SCREEN_Y) < 1e-6,
    `${sample.name} 器底可见前沿必须落在转盘接触线`,
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
  0.86,
);
const tallFocus = calculatePotteryFocusY(
  tallHeight,
  tallDistance,
  tallPitch,
  POTTERY_BASE_SCREEN_Y,
  tallFootRadius,
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
assert.ok(
  Math.abs(fullOrbit.yaw - Math.PI * 2) < 1e-10,
  "横向移动一屏必须可查看完整 360 度",
);
assert.ok(
  Math.abs(normalizePotteryYaw(0.23 + Math.PI * 8) - 0.23) < 1e-10,
  "连续环绕后视角必须保持数值稳定",
);
assert.ok(
  Math.abs(normalizePotteryPitch(0.31 + Math.PI * 10) - 0.31) < 1e-10,
  "纵向转满多圈后必须继续同方向旋转且保持数值稳定",
);
assert.equal(
  calculatePotteryOrbitDelta(Number.NaN, Number.NaN, 0, 0).yaw,
  0,
  "异常手势不能污染相机",
);
assert.ok(POTTERY_MIN_PITCH < -1.2, "双指俯视必须能越过器底观察下方");
assert.ok(POTTERY_MAX_PITCH > 1.2, "双指仰视必须能越过口沿观察内腔");
assert.ok(
  POTTERY_MIN_PITCH <= -Math.PI * 0.98,
  "纵向视角必须能翻过器底，把整件作品倒过来看",
);
assert.ok(
  POTTERY_MAX_PITCH >= Math.PI * 0.98,
  "纵向视角必须能翻过口沿，把整件作品倒过来看",
);
assert.ok(POTTERY_MIN_ZOOM_FACTOR <= 0.15, "双指必须能贴得很近细看局部");
assert.ok(POTTERY_MAX_ZOOM_FACTOR >= 3.5, "双指必须能退得很远纵览全器");
const levelUp = potteryOrbitUpVector(0, 0.42);
assert.ok(
  Math.abs(levelUp[0]) < 1e-9 &&
    Math.abs(levelUp[1] - 1) < 1e-9 &&
    Math.abs(levelUp[2]) < 1e-9,
  "水平视角的上向量仍应竖直向上",
);
const poleUp = potteryOrbitUpVector(Math.PI / 2, 0.7);
assert.ok(
  Math.abs(poleUp[1]) < 1e-9,
  "越过极点时上向量必须保持水平，避免相机奇异",
);
assert.ok(
  Math.hypot(
    potteryOrbitUpVector(Math.PI / 2 - 1e-3, 0.7)[0] -
      potteryOrbitUpVector(Math.PI / 2 + 1e-3, 0.7)[0],
    potteryOrbitUpVector(Math.PI / 2 - 1e-3, 0.7)[1] -
      potteryOrbitUpVector(Math.PI / 2 + 1e-3, 0.7)[1],
    potteryOrbitUpVector(Math.PI / 2 - 1e-3, 0.7)[2] -
      potteryOrbitUpVector(Math.PI / 2 + 1e-3, 0.7)[2],
  ) < 1e-2,
  "越过极点时相机朝向必须连续，不能突然翻转",
);
const uprightDrag = solvePotterySurfaceDrag(
  24,
  -18,
  { x: 60, y: 0 },
  { x: 0, y: -140 },
);
assert.ok(
  Math.abs(uprightDrag.du - 0.4) < 1e-9,
  "常规视角水平拖动必须精确跟随手指",
);
assert.ok(
  Math.abs(uprightDrag.dv - 18 / 140) < 1e-9,
  "常规视角纵向拖动必须精确跟随手指",
);
const flippedDrag = solvePotterySurfaceDrag(
  24,
  -18,
  { x: -60, y: 0 },
  { x: 0, y: 140 },
);
assert.ok(
  Math.abs(flippedDrag.du + 0.4) < 1e-9,
  "倒置视角下水平拖动方向必须自动反转",
);
assert.ok(
  Math.abs(flippedDrag.dv + 18 / 140) < 1e-9,
  "倒置视角下纵向拖动方向必须自动反转",
);
assert.deepEqual(
  solvePotterySurfaceDrag(100, 100, { x: 0, y: 0 }, { x: 0, y: -140 }),
  { du: 0, dv: 0 },
  "投影退化时不能让纹样跳变",
);
// Exercise the production engine's iterative edge handling without creating a
// WebGL context. This skewed projection makes a vertical drag contain both U
// and V corrections, matching an oblique camera view near the foot.
const boundaryDragEngine = Object.create(PotteryEngine.prototype);
boundaryDragEngine.projectSurfacePoint = (u, v) => {
  const safeV = Math.max(-1, Math.min(1, v));
  const baseRadiusFactor = safeV < 0 ? 1 + safeV : 1;
  return {
    x: u * 100 * baseRadiusFactor + safeV * 20,
    y: u * 10 * baseRadiusFactor - safeV * 100,
  };
};
const bottomEdgeDrag = boundaryDragEngine.surfaceDragDelta(0.5, 0, 0, 20);
assert.ok(
  bottomEdgeDrag.dv < 0,
  "越过 v=0 足边继续向下拖动必须进入器底平面",
);
assert.ok(
  Math.abs(bottomEdgeDrag.du) < 0.2,
  "进入器底时不得把向下位移主要误算成绕器身横移",
);
assert.deepEqual(
  boundaryDragEngine.surfaceDragDelta(0.5, -1, -14, 19),
  { du: 0, dv: 0 },
  "已经位于器底中心时继续向内拖动必须稳定停住",
);
assert.ok(
  boundaryDragEngine.surfaceDragDelta(0.5, -1, 1.4, -1.9).dv > 0,
  "器底中心的 U 切线退化时仍必须能沿原路径拖回外缘",
);
assert.equal(
  boundaryDragEngine.surfaceDragDelta(0.5, -0.95, 10, 0).du,
  0,
  "接近器底中心时必须冻结无意义的极角，避免图案突然旋转",
);
assert.ok(
  boundaryDragEngine.surfaceDragDelta(0.5, 1, 0, 20).dv < 0,
  "图案位于顶边时必须使用器身内侧导数并能重新向下移动",
);

const surfaceChartEngine = Object.create(PotteryEngine.prototype);
surfaceChartEngine.work = { outerRadius:[0.6, 0.6] };
surfaceChartEngine.meshHeight = 1.2;
assert.deepEqual(
  surfaceChartEngine.surfaceObjectPosition(0.5, -1),
  [0, -0.6, 0],
  "v=-1 必须精确表示器底中心",
);
assert.deepEqual(
  surfaceChartEngine.surfaceObjectPosition(0.5, -0.5),
  [0.3, -0.6, 0],
  "器底纵坐标必须从中心到足边连续覆盖整个半径",
);
const projectedBaseEngine = Object.create(PotteryEngine.prototype);
projectedBaseEngine.work = { outerRadius:[0.6, 0.6] };
projectedBaseEngine.meshHeight = 1.2;
projectedBaseEngine.viewportWidth = 512;
projectedBaseEngine.viewportHeight = 512;
projectedBaseEngine.modelMatrix = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);
// Project the underside face-on: object X maps to screen X and object Z maps
// to screen Y. This exercises the real surface chart and iterative solver.
projectedBaseEngine.viewProjectionMatrix = new Float32Array([
  1.5, 0, 0, 0,
  0, 0, 1, 0,
  0, 1.5, 0, 0,
  0, 0, 0, 1,
]);
const actualSeamDrag = projectedBaseEngine.surfaceDragDelta(0.5, 0, -36, 0);
assert.ok(actualSeamDrag.dv < 0, "生产坐标投影中向器底中心拖动必须越过足边");
assert.ok(
  Math.abs(actualSeamDrag.du) < 1e-6,
  "生产坐标投影中径向拖动不得变成无意义的绕圈旋转",
);
const actualCenterExit = projectedBaseEngine.surfaceDragDelta(0.5, -1, 24, 0);
assert.ok(actualCenterExit.dv > 0, "生产坐标投影中题款到达器底中心后仍能拖回足边");
assert.equal(actualCenterExit.du, 0, "器底中心离开时必须保留原来的图案方向");
assert.ok(
  calculatePotteryOrbitDelta(0, 600, 375, 600).pitch > 2.7,
  "一次纵向整屏拖动应覆盖从底部到顶部的完整视角",
);
assert.ok(
  Math.abs(
    calculatePotteryCameraDistance(0.7, 1.2, 0.72, -1.1) -
      calculatePotteryCameraDistance(0.7, 1.2, 0.72, 1.1),
  ) < 1e-10,
  "俯视与仰视必须使用对称安全的相机包围范围",
);
for (const extremePitch of [POTTERY_MIN_PITCH, POTTERY_MAX_PITCH]) {
  const extremeFocus = calculatePotteryFocusY(
    1.2,
    6.4,
    extremePitch,
    0.9,
    0.55,
  );
  assert.ok(Number.isFinite(extremeFocus), "极端俯仰时相机焦点不能发散");
  assert.ok(
    Math.abs(extremeFocus) < 0.8,
    "越过口沿或底足时应平滑转为绕作品中心观察",
  );
}

assert.ok(calculatePotteryZoomFactor(1, 1.25) < 1, "双指张开必须放大作品");
assert.ok(calculatePotteryZoomFactor(1, 0.8) > 1, "双指合拢必须缩小作品");
const oneSecondTurn = advancePotteryTurntable(0, 1000);
let sixtyFrameTurn = 0;
for (let frame = 0; frame < 60; frame++) {
  sixtyFrameTurn = advancePotteryTurntable(sixtyFrameTurn, 1000 / 60);
}
assert.ok(
  Math.abs(oneSecondTurn - sixtyFrameTurn) < 1e-10,
  "转盘速度不能随帧率变化",
);

assert.equal(calculatePotteryBaseScreenY(568), 0.72, "短屏接触线应保持在 72%");
assert.equal(calculatePotteryBaseScreenY(932), 0.75, "长屏接触线可下移到 75%");
assert.equal(
  calculatePotteryBaseScreenYFromLayout(100, 500, 525),
  0.85,
  "WebGL 器底必须跟随实测转盘接触线",
);
assert.equal(
  calculatePotteryBaseScreenYFromLayout(0, 500, 480),
  0.93,
  "转盘中心接近舞台底部时仍应保留完整器底观察范围",
);
assert.ok(
  calculatePotteryBaseScreenY(812) > 0.739 &&
    calculatePotteryBaseScreenY(812) < 0.741,
  "常规长屏接触线应约为 74%",
);
assert.equal(
  calculatePotteryTargetRpm(0.55, "idle"),
  44,
  "窄器形空闲时应为 44 RPM",
);
assert.equal(
  calculatePotteryTargetRpm(1.1, "idle"),
  32,
  "宽器形空闲时应降到 32 RPM",
);
assert.equal(
  calculatePotteryTargetRpm(0.55, "shaping"),
  30,
  "触摸窄器形应降到 30 RPM",
);
assert.equal(
  calculatePotteryTargetRpm(1.1, "orbit"),
  18,
  "观察宽器形应降到 18 RPM",
);
assert.equal(
  calculatePotteryTargetRpm(0.7, "reduced"),
  0,
  "减少动态必须完全停转",
);
assert.equal(
  potteryRpmToPeriodMs(30),
  2000,
  "RPM 与 CSS 单圈时间必须可共享换算",
);

function replayTurntable(frameRate) {
  let frame = { angle: 0, rpm: 44 };
  for (let index = 0; index < frameRate; index++) {
    frame = advancePotteryTurntableFrame(
      frame.angle,
      frame.rpm,
      24,
      1000 / frameRate,
    );
  }
  return frame;
}
const turn30 = replayTurntable(30);
const turn120 = replayTurntable(120);
assert.ok(
  Math.abs(turn30.angle - turn120.angle) < 0.002,
  "平滑减速角度应基本不受帧率影响",
);
assert.ok(
  Math.abs(turn30.rpm - turn120.rpm) < 0.002,
  "平滑减速目标应基本不受帧率影响",
);
assert.ok(turn30.rpm < 26, "一秒后应平滑接近观察目标转速");

const gentleDrag = profileDeltaFromDrag(4, 375);
const delayedEvent = profileDeltaFromDrag(80, 375);
assert.ok(
  gentleDrag > 0.008 && gentleDrag < 0.012,
  "小幅捏塑移动也应立即产生高灵敏响应",
);
assert.ok(delayedEvent < 0.05, "单次延迟触摸事件仍不能让器形失控跳变");
assert.equal(
  profileDeltaFromDrag(Number.NaN, 375),
  0,
  "异常触摸位移不能改变器形",
);

console.log(
  "pottery engine tests passed: extreme mesh, complete camera fit, 360 orbit and sensitive input",
);
