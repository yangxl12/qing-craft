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
  classifyShapingMotion,
  normalizeElapsedSeconds,
  OneEuroFilter,
  ShapingInputSession
} = require("../core/shaping-input.ts");

assert.equal(classifyShapingMotion(12, 2, 1), "stretch", "右壁向右应为拉伸");
assert.equal(classifyShapingMotion(-12, 2, 1), "compress", "右壁向左应为压缩");
assert.equal(classifyShapingMotion(-12, 2, -1), "stretch", "左壁向左应镜像为拉伸");
assert.equal(classifyShapingMotion(12, 2, -1), "compress", "左壁向右应镜像为压缩");
assert.equal(classifyShapingMotion(1, -16, 1), "smooth-up", "向上滑动应进入向上平滑");
assert.equal(classifyShapingMotion(1, 16, -1), "smooth-down", "向下滑动应进入向下平滑");

const profileAtY = (y) => Math.max(0, Math.min(47, ((310 - y) / 250) * 47));

function replay(rate) {
  const session = new ShapingInputSession({
    viewportWidth: 375,
    viewportHeight: 550,
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
    heightDelta: samples.reduce((sum, sample) => sum + sample.deltaHeight, 0),
    profile: applySweptDeformation(Array(48).fill(0.55), samples, {
      tool: "finger",
      relaxed: true
    })
  };
}

const replays = [30, 60, 120].map(replay);
for (const replayResult of replays) {
  assert.ok(replayResult.heightDelta > 0.25, "持续向上扫掠必须累积为可见的增高量");
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
    assert.ok(
      Math.abs(replays[left].heightDelta - replays[right].heightDelta) <= 0.006,
      "不同触摸采样率下的总高度变化应保持一致"
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

const vertical = new ShapingInputSession({ viewportWidth: 375, profileCount: 48, side: 1 });
vertical.begin({ x: 260, y: 250, timestamp: 2400 }, profileAtY(250));
const verticalSamples = vertical.push({ x: 261, y: 190, timestamp: 2480 }, profileAtY);
assert.ok(verticalSamples.length > 1, "纵向路径也必须连续重采样");
assert.ok(
  verticalSamples.every((sample) => sample.motion === "smooth-up"),
  "纵向路径必须稳定标记为向上平滑"
);
assert.ok(
  verticalSamples.every((sample) => sample.deltaRadius === 0),
  "纵向平滑中的轻微横向抖动不得误改半径"
);
assert.ok(
  verticalSamples.reduce((sum, sample) => sum + sample.deltaHeight, 0) > 0,
  "向上平滑必须输出正向高度变化"
);

const downward = new ShapingInputSession({
  viewportWidth: 375,
  viewportHeight: 550,
  profileCount: 48,
  side: 1
});
downward.begin({ x: 260, y: 190, timestamp: 2600 }, profileAtY(190));
const downwardSamples = downward.push({ x: 259, y: 250, timestamp: 2680 }, profileAtY);
assert.ok(
  downwardSamples.reduce((sum, sample) => sum + sample.deltaHeight, 0) < 0,
  "向下平滑必须输出负向高度变化"
);

const positioned = new ShapingInputSession({
  viewportWidth: 375,
  viewportHeight: 550,
  profileCount: 48,
  side: 1
});
positioned.begin({ x: 260, y: 275, timestamp: 2700 }, profileAtY(275));
positioned.push({ x: 260, y: 165, timestamp: 2820 }, profileAtY);
const positionedPush = positioned.push({ x: 286, y: 165, timestamp: 2880 }, profileAtY);
const reachedProfileY = profileAtY(165);
assert.ok(
  positionedPush.reduce((sum, sample) => sum + sample.deltaRadius, 0) > 0,
  "纵向定位后向外推仍必须产生径向变形"
);
assert.ok(
  positionedPush.every((sample) => Math.abs(sample.profileY - reachedProfileY) < 0.75),
  "纵向定位后横向推拉必须落在手指当前高度，不能受滤波滞后拖低"
);
const positionedCompress = positioned.push({ x: 258, y: 165, timestamp: 2940 }, profileAtY);
assert.ok(
  positionedCompress.reduce((sum, sample) => sum + sample.deltaRadius, 0) < 0,
  "同一定位高度反向内推必须立即产生收缩"
);
assert.ok(
  positionedCompress.every((sample) => Math.abs(sample.profileY - reachedProfileY) < 0.75),
  "内推反向时也必须继续作用在当前高度"
);

const fluid = new ShapingInputSession({
  viewportWidth: 375,
  viewportHeight: 550,
  profileCount: 48,
  side: 1
});
fluid.begin({ x: 245, y: 250, timestamp: 2800 }, profileAtY(250));
const fluidSamples = [];
for (const point of [
  { x: 270, y: 220, timestamp: 2840 },
  { x: 242, y: 190, timestamp: 2880 },
  { x: 218, y: 220, timestamp: 2920 },
  { x: 248, y: 250, timestamp: 2960 }
]) {
  fluidSamples.push(...fluid.push(point, profileAtY));
}
const fluidRadius = fluidSamples.map((sample) => sample.deltaRadius);
const fluidHeight = fluidSamples.map((sample) => sample.deltaHeight);
assert.ok(fluidRadius.some((delta) => delta > 0) && fluidRadius.some((delta) => delta < 0));
assert.ok(fluidHeight.some((delta) => delta > 0) && fluidHeight.some((delta) => delta < 0));
assert.ok(
  fluidSamples.some(
    (sample) => Math.abs(sample.deltaRadius) > 0 && Math.abs(sample.deltaHeight) > 0
  ),
  "斜向滑动必须能在同一时刻同时改变半径和高度"
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

console.log("shaping input tests passed: 2D sweep, height intent, diagonal composition, rate equivalence");
