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
  approximateProfileVolume,
  constrainSlopeAndCurvature,
  deformProfile,
  smoothProfileRange,
  synchronizeInnerWall
} = require("../core/profile.ts");
const { buildPotteryMesh } = require("../core/pottery-mesh.ts");

const base = Array(48).fill(0.55);
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

let stress = base;
for (let index = 0; index < 100; index++) {
  stress = deformProfile(stress, (index * 17) % 48, index % 2 ? 0.5 : -0.5);
  assert.ok(stress.every(Number.isFinite));
  assert.ok(stress.every((radius) => radius >= 0.18 && radius <= 1.25));
}

console.log("profile tests passed: production sweep, bidirectional constraints, local sponge, wall sync");
