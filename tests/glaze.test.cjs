const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

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

const { CLASSIC_GLAZES, GLAZES, TOOLS } = require("../core/catalog.ts");
const { createWork, glazeColor, glazeMaterial, validateWork } = require("../core/model.ts");

assert.deepEqual(
  CLASSIC_GLAZES.map((item) => item.name),
  ["天青釉", "龙泉青瓷", "建盏黑釉", "甜白釉", "霁蓝釉", "青白釉"],
  "上釉页必须按产品顺序只提供六种经典釉色",
);
assert.equal(new Set(CLASSIC_GLAZES.map((item) => item.id)).size, 6, "六种釉色 id 必须唯一");
assert.deepEqual(TOOLS.glaze, [], "旧施釉方式菜单不能再出现在上釉阶段");

for (const [index, glaze] of CLASSIC_GLAZES.entries()) {
  assert.equal(glaze.material.profile, index, `${glaze.name} 应有独立材质 profile`);
  assert.match(glaze.swatch, /gradient\(/, `${glaze.name} 釉样不能退化为纯色色点`);
  for (const key of ["roughness", "variation", "translucency"]) {
    assert.ok(
      glaze.material[key] >= 0 && glaze.material[key] <= 1,
      `${glaze.name} 的 ${key} 必须是安全的 shader 参数`,
    );
  }
  const work = createWork("vase");
  work.glazeId = glaze.id;
  assert.deepEqual(glazeMaterial(work), glaze.material, `${glaze.name} 必须驱动对应的 WebGL 材质`);
  work.stageIndex = 2;
  assert.equal(glazeColor(work), glaze.wet, `${glaze.name} 在上釉页必须呈现较乳浊的鲜釉色`);
  work.stageIndex = 4;
  assert.equal(glazeColor(work), glaze.fired, `${glaze.name} 高温烧成后必须显出稳定的烧后釉色`);
}

const legacy = createWork("cup");
legacy.glazeId = "tea";
const restoredLegacy = validateWork(legacy);
assert.ok(restoredLegacy, "历史釉色作品仍应可读取");
assert.equal(restoredLegacy.glazeId, "tea", "不在新页面展示的历史 glazeId 不能被静默抹掉");
assert.ok(GLAZES.some((item) => item.id === "tea"), "历史釉色目录必须继续保留");

const wxml = fs.readFileSync(require.resolve("../pages/studio/studio.wxml"), "utf8");
assert.match(
  wxml,
  /stageIndex===1\|\|stageIndex===2[^>]+class="decor-workshop-bg"/,
  "上釉阶段必须复用装饰工坊背景",
);
assert.match(wxml, /stageIndex===2[^>]+class="glaze-tray"/, "上釉阶段必须使用独立釉色托盘");
assert.match(wxml, /class="glaze-grid" role="radiogroup"/, "六种釉色必须作为单选组呈现");
assert.doesNotMatch(wxml, /stageIndex===2[^\n]+swatch-scroll/, "旧横向釉色菜单必须移除");

const engineSource = fs.readFileSync(require.resolve("../core/pottery-engine.ts"), "utf8");
assert.match(engineSource, /uniform vec4 uGlazeMaterial;/, "shader 必须接收釉色材质参数");
assert.match(engineSource, /uniform float uCeramicMaturity;/, "shader 必须接收分阶段的釉面成熟度");
assert.match(
  engineSource,
  /const glazeMix = this\.work\.stageIndex >= 2 \? 1 : 0;/,
  "选择釉色后器身必须展示完整釉层，而不是低比例换色",
);
assert.match(engineSource, /建盏黑釉[\s\S]+hareFur/, "建盏黑釉必须包含独立的铁系结晶变化");
assert.match(engineSource, /windowReflection/, "烧成与成品阶段必须包含克制的窗格环境映照");
assert.match(engineSource, /overglazeFired/, "釉上彩必须在低温烤花后才进入最终定色状态");

console.log("glaze tests passed: six classics, single-select tray, legacy safety and material profiles");
