const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2018, module: ts.ModuleKind.CommonJS }
  }).outputText;
  module._compile(output, filename);
};

const {
  applySweptDeformation,
  applyVerticalThrowing,
  approximateProfileVolume,
  constrainSlopeAndCurvature,
  deformProfile,
  shapingKernelWeight,
  smoothProfileRange,
  synchronizeInnerWall
} = require("../core/profile.ts");
const { buildPotteryMesh } = require("../core/pottery-mesh.ts");
const {
  MAX_POTTERY_HEIGHT,
  MIN_POTTERY_WALL
} = require("../core/pottery-dimensions.ts");

const base = Array(48).fill(0.55);

assert.equal(shapingKernelWeight(0, 3.6, "curve"), 1);
assert.equal(shapingKernelWeight(2, 3.6, "square"), 1, "方形受力应保留平直核心");
assert.ok(
  shapingKernelWeight(8, 3.6, "curve") > shapingKernelWeight(8, 3.6, "cone"),
  "锥型受力应比曲线更集中"
);

const formSample = [{
  profileY: 24,
  deltaRadius: 0.035,
  deltaHeight: 0,
  durationSeconds: 1 / 30,
  profileTravel: 0,
  motion: "stretch"
}];
const formProfiles = ["curve", "cone", "square"].map((form) =>
  applySweptDeformation(base, formSample, { tool: "finger", form, relaxed: true })
);
assert.notDeepEqual(formProfiles[0], formProfiles[1], "曲线与锥型必须产生不同受力轮廓");
assert.notDeepEqual(formProfiles[1], formProfiles[2], "锥型与方形必须产生不同受力轮廓");
assert.ok(formProfiles.flat().every(Number.isFinite), "三种受力形态都必须保持有限数");

const pushed = deformProfile(base, 24, 0.1);
assert.ok(pushed[24] > base[24], "触点应向外鼓起");
assert.ok(pushed[24] > pushed[10], "影响应集中在触点邻域");
assert.ok(pushed.every(Number.isFinite), "生产算法不应产生 NaN");
assert.ok(pushed.every((radius) => radius >= 0.18 && radius <= 1.25), "半径必须在保护范围内");

const jagged = Array.from({ length: 48 }, (_, index) =>
  index % 2 ? 0.92 : 0.35
);
for (const relaxed of [true, false]) {
  const constrained = constrainSlopeAndCurvature(jagged, relaxed);
  const maxSlope = relaxed ? 0.075 : 0.125;
  for (let index = 1; index < constrained.length; index++) {
    assert.ok(
      Math.abs(constrained[index] - constrained[index - 1]) <= maxSlope + 1e-9,
      `${relaxed ? "轻松" : "自由"}模式必须限制双向斜率`
    );
  }
  assert.ok(constrained.every(Number.isFinite), "曲率保护后必须保持有限数");
}

const sweep = Array.from({ length: 36 }, (_, index) => ({
  profileY: 8 + index * 0.5,
  deltaRadius: 0.032 / 36,
  deltaHeight: 0,
  durationSeconds: 0.5 / 36,
  profileTravel: 0.5
}));
const swept = applySweptDeformation(base, sweep, { tool: "finger", relaxed: true });
for (let index = 9; index < 25; index++) {
  assert.ok(swept[index] > base[index], "扫掠路径经过的中间高度必须连续受力");
}

let sponge = base.map((radius, index) =>
  index >= 17 && index <= 30 ? radius + (index % 2 ? 0.07 : -0.06) : radius
);
const untouchedTop = sponge.slice(0, 7);
const untouchedBottom = sponge.slice(40);
const volumeBefore = approximateProfileVolume(sponge);
for (let pass = 0; pass < 50; pass++) {
  sponge = smoothProfileRange(sponge, 19, 28, 0.12, true, 3.2);
}
const volumeDrift = Math.abs(approximateProfileVolume(sponge) - volumeBefore) / volumeBefore;
assert.ok(volumeDrift < 0.03, `50 次海绵修顺体积漂移应小于 3%，实际 ${volumeDrift}`);
assert.ok(sponge.every(Number.isFinite), "反复海绵修顺不能产生 NaN");
assert.deepEqual(sponge.slice(0, 7), untouchedTop, "局部海绵不应改变远端底部轮廓");
assert.deepEqual(sponge.slice(40), untouchedBottom, "局部海绵不应改变远端口沿轮廓");

const directionalSource = base.map((radius, index) =>
  index >= 14 && index <= 33 ? radius + (index % 2 ? 0.028 : -0.026) : radius
);
const directionalSamples = Array.from({ length: 20 }, (_, index) => ({
  profileY: 14 + index,
  deltaRadius: 0,
  deltaHeight: 0.12 / 20,
  durationSeconds: 0.5 / 20,
  profileTravel: 1,
  motion: "smooth-up"
}));
const smoothedUp = applySweptDeformation(directionalSource, directionalSamples, {
  tool: "finger",
  form: "curve",
  relaxed: true
});
const smoothedDown = applySweptDeformation(
  directionalSource,
  directionalSamples.map((sample) => ({
    ...sample,
    deltaHeight: -Math.abs(sample.deltaHeight),
    motion: "smooth-down"
  })),
  { tool: "finger", form: "curve", relaxed: true }
);
const roughness = (profile) => profile.slice(1, -1).reduce(
  (total, radius, index) =>
    total + Math.abs(profile[index] - radius * 2 + profile[index + 2]),
  0
);
assert.ok(roughness(smoothedUp) < roughness(directionalSource), "向上轻抹必须降低局部凹凸");
assert.ok(
  roughness(smoothedUp) < roughness(directionalSource) * 0.72,
  "向上轻抹应产生肉眼可见的侧壁修顺"
);
assert.notDeepEqual(smoothedUp, smoothedDown, "上下轻抹应沿各自前进方向扩展受力区");

const diagonalSamples = [{
  profileY: 24,
  deltaRadius: 0.03,
  deltaHeight: 0.02,
  durationSeconds: 1 / 30,
  profileTravel: 0.6,
  motion: "smooth-up"
}];
const diagonal = applySweptDeformation(
  base,
  diagonalSamples,
  { tool: "finger", form: "curve", relaxed: true }
);
assert.ok(diagonal[24] > base[24], "斜向上拉时不能再丢失横向扩张分量");
const diagonalThrown = applyVerticalThrowing(diagonal, 1.2, diagonalSamples, true);
assert.ok(diagonalThrown.height > 1.2, "斜向上拉必须同时增高器身");
assert.ok(diagonalThrown.profile[24] > base[24], "斜向上拉的增高补偿不能盖掉外扩手势");

const raised = applyVerticalThrowing(directionalSource, 1.2, directionalSamples, true);
const lowered = applyVerticalThrowing(
  directionalSource,
  1.2,
  directionalSamples.map((sample) => ({ ...sample, deltaHeight: -Math.abs(sample.deltaHeight) })),
  true
);
assert.ok(raised.height > 1.2, "向上平滑必须让整个器身变高");
assert.ok(lowered.height < 1.2, "向下平滑必须让整个器身变矮");
const fullyRaised = applyVerticalThrowing(
  base,
  MAX_POTTERY_HEIGHT - 0.04,
  [{
    profileY: 40,
    deltaRadius: 0,
    deltaHeight: 0.2,
    durationSeconds: 0.1,
    profileTravel: 3,
    motion: "smooth-up"
  }],
  true
);
assert.equal(fullyRaised.height, MAX_POTTERY_HEIGHT, "向上拉坯应能延伸到新的高度上限");
assert.ok(roughness(raised.profile) < roughness(directionalSource), "增高时侧壁应整体趋于平滑");
assert.ok(roughness(lowered.profile) < roughness(directionalSource), "压低时侧壁应整体趋于平滑");
assert.ok(
  roughness(raised.profile) < roughness(directionalSource) * 0.55,
  "向上拉坯应同时明显消除侧壁折点"
);
assert.ok(
  roughness(lowered.profile) < roughness(directionalSource) * 0.55,
  "向下压坯应同时明显消除侧壁折点"
);
for (const result of [raised, lowered]) {
  const beforeClay = approximateProfileVolume(directionalSource) * 1.2;
  const afterClay = approximateProfileVolume(result.profile) * result.height;
  const drift = Math.abs(afterClay - beforeClay) / beforeClay;
  assert.ok(drift < 0.035, `纵向拉坯的近似泥量漂移应小于 3.5%，实际 ${drift}`);
  assert.ok(result.profile.every(Number.isFinite), "纵向拉坯后轮廓必须保持有限数");
}
const spongeInner = sponge.map((radius, index) => (index < 3 ? 0 : radius - 0.11));
const spongeMesh = buildPotteryMesh(sponge, spongeInner, 1.2, 64);
assert.ok(spongeMesh.positions.every(Number.isFinite), "反复海绵后网格顶点必须有效");
assert.ok(spongeMesh.normals.every(Number.isFinite), "反复海绵后网格法线必须有效");

const previousOuter = Array.from({ length: 48 }, (_, index) => 0.5 + index * 0.002);
const inner = previousOuter.map((radius, index) => (index < 3 ? 0 : radius - 0.11));
const nextOuter = previousOuter.map((radius, index) => radius + (index > 10 ? 0.025 : 0));
const nextInner = synchronizeInnerWall(previousOuter, nextOuter, inner);
for (let index = 3; index < 48; index++) {
  assert.ok(nextInner[index] <= nextOuter[index] - 0.075 + 1e-9, "内壁不得穿出最小壁厚");
  assert.ok(
    Math.abs((nextOuter[index] - nextInner[index]) - 0.11) < 1e-9,
    "外轮廓变化后应保留原壁厚"
  );
}

const tallInner = synchronizeInnerWall(
  previousOuter,
  nextOuter,
  inner,
  1.2,
  MAX_POTTERY_HEIGHT
);
const lowerWall = nextOuter[4] - tallInner[4];
const upperWall = nextOuter[40] - tallInner[40];
assert.ok(upperWall < 0.075, "向上拉坯后上段器壁应明显薄于旧的视觉下限");
assert.ok(lowerWall > upperWall, "底足附近应比拉高后的上段器壁保留更多支撑");
assert.ok(
  upperWall >= MIN_POTTERY_WALL - 1e-9,
  "拉高变薄后仍必须保留安全的最小壁厚"
);

let stress = base;
for (let index = 0; index < 100; index++) {
  stress = deformProfile(stress, (index * 17) % 48, index % 2 ? 0.5 : -0.5);
  assert.ok(stress.every(Number.isFinite));
  assert.ok(stress.every((radius) => radius >= 0.18 && radius <= 1.25));
}

console.log("profile tests passed: 2D sweep, vertical throwing, smoothing, volume and wall safety");
