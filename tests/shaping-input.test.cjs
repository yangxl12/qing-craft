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

const { applySweptDeformation } = require("../core/profile.ts");
const {
  normalizeElapsedSeconds,
  OneEuroFilter,
  ShapingInputSession
} = require("../core/shaping-input.ts");

const profileAtY = (y) => Math.max(0, Math.min(47, ((310 - y) / 250) * 47));

function replay(rate) {
  const session = new ShapingInputSession({
    viewportWidth: 375,
    profileCount: 48,
    side: 1
  });
  const start = { x: 292, y: 278, timestamp: 1000 };
  session.begin(start, profileAtY(start.y));
  const samples = [];
  for (let frame = 1; frame <= rate; frame++) {
    const progress = frame / rate;
    const point = {
      x: 292 + progress * 26 + Math.sin(progress * Math.PI) * 3,
      y: 278 - progress * 170,
      timestamp: 1000 + progress * 1000
    };
    samples.push(...session.push(point, profileAtY));
  }
  return {
    samples,
    profile: applySweptDeformation(Array(48).fill(0.55), samples, {
      tool: "finger",
      relaxed: true
    })
  };
}

const replays = [30, 60, 120].map(replay);
for (const replayResult of replays) {
  for (let index = 1; index < replayResult.samples.length; index++) {
    assert.ok(
      Math.abs(replayResult.samples[index].profileY - replayResult.samples[index - 1].profileY) <=
        0.5 + 1e-9,
      "重采样后的相邻高度不得跨过半个剖面环"
    );
  }
}
for (let left = 0; left < replays.length; left++) {
  for (let right = left + 1; right < replays.length; right++) {
    const maxDifference = Math.max(
      ...replays[left].profile.map((radius, index) =>
        Math.abs(radius - replays[right].profile[index])
      )
    );
    assert.ok(
      maxDifference <= 0.005,
      `30/60/120 Hz 回放半径差应不超过 0.005，实际 ${maxDifference}`
    );
  }
}

const reversal = new ShapingInputSession({ viewportWidth: 375, profileCount: 48, side: 1 });
reversal.begin({ x: 200, y: 180, timestamp: 2000 }, profileAtY(180));
const outward = reversal.push({ x: 215, y: 175, timestamp: 2020 }, profileAtY);
const inward = reversal.push({ x: 198, y: 170, timestamp: 2040 }, profileAtY);
assert.ok(outward.reduce((sum, sample) => sum + sample.deltaRadius, 0) > 0);
assert.ok(
  inward.reduce((sum, sample) => sum + sample.deltaRadius, 0) < 0,
  "快速反向时径向意图必须立即反向"
);

const filter = new OneEuroFilter();
filter.reset(10, 3000);
for (const [value, timestamp] of [
  [Number.NaN, 3000],
  [11, 2990],
  [12, 9000],
  [13, 9016]
]) {
  assert.ok(Number.isFinite(filter.filter(value, timestamp)), "异常输入不能污染 1 EUR 滤波器");
}
assert.equal(normalizeElapsedSeconds(1000, 1000), 1 / 120, "重复时间戳必须获得安全 dt");
assert.equal(normalizeElapsedSeconds(900, 1000), 1 / 120, "倒退时间戳必须获得安全 dt");
assert.equal(normalizeElapsedSeconds(3000, 1000), 1 / 60, "后台恢复的大间隔必须重置");

console.log("shaping input tests passed: 1 EUR safety, continuous sweep, rate-equivalent replay, reversal");
