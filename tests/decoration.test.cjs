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

const {
  applyDecorationTemplate,
  availableAnchors,
  borderRepeatCount,
  BORDERS,
  clampDecorationLayer,
  clampSealMark,
  createDecorationComposition,
  createDecorationLayer,
  createSealMark,
  createDecorationStamp,
  duplicateDecorationLayer,
  DECORATION_TEMPLATES,
  MAX_DECORATION_STAMPS,
  MAX_SEAL_MARK_CHARACTERS,
  MIN_DECORATION_SURFACE_V,
  MOTIFS,
  stableKilnSeed,
  STYLE_PACKS,
  validateDecorationComposition,
  validateInscriptionText,
} = require("../core/decoration.ts");
const { cloneWork, createWork, validateWork } = require("../core/model.ts");

assert.equal(STYLE_PACKS.length, 3, "MVP 必须提供三个风格包");
assert.equal(MOTIFS.length, 15, "MVP 必须提供十五个母纹样");
assert.equal(BORDERS.length, 6, "MVP 必须提供六条连续边饰");
assert.equal(DECORATION_TEMPLATES.length, 6, "MVP 必须提供六套一键构图");

const studioMarkup = fs.readFileSync("pages/studio/studio.wxml", "utf8");
const studioSource = fs.readFileSync("pages/studio/studio.ts", "utf8");
assert.doesNotMatch(studioSource, /MAX_DECORATION_LAYERS|五层图样|图层最多五层/, "器身图样不能再保留五层上限");
assert.match(studioSource, /const KILN_DURATION_MS = 20_000/, "高温与低温烧制都必须完整持续二十秒");
assert.match(studioSource, /\/pages\/studio\/assets\/highBg\.jpg/, "高温烧制必须使用工作室分包背景");
assert.match(studioSource, /\/pages\/studio\/assets\/lowBg\.jpg/, "低温烤花必须使用工作室分包背景");
assert.match(studioSource, /confirmText: "返回首页"/, "制坯上一步弹窗必须提供返回首页按钮");
assert.match(studioSource, /wx\.redirectTo\(\{ url: "\/pages\/index\/index" \}\)/, "制坯上一步确认后必须回到首页");
assert.match(studioMarkup, /class="kiln-backdrop"/, "窑烧页必须有独立背景层");
assert.match(studioMarkup, /class="kiln-status-panel"/, "窑烧页底部必须展示温度进度");
assert.match(studioMarkup, /class="kiln-skip"[^>]+bindtap="skipKiln"/, "窑烧页右下角必须提供跳过按钮");
assert.doesNotMatch(
  studioMarkup,
  /bindlongpress="deleteSelectedDecoration"/,
  "双指观察时不能再由画布长按事件误删纹样",
);
assert.match(studioMarkup, /class="decor-previous" bindtap="returnToShaping"/, "装饰页底部必须保留上一步入口");
assert.match(studioMarkup, /catchtap="toggleDecorTools"/, "纹样调校标题必须提供独立收展按钮");
assert.doesNotMatch(studioMarkup, /<text>{{item.name}}<\/text><small>/, "装饰侧栏不应显示临时菜单文案");
assert.doesNotMatch(
  studioMarkup,
  /横向伸缩|纵向伸缩|<small>按住拖动<\/small>|<small>(?:撤回|删除|上下翻转)<\/small>/,
  "纹样调校操作不应继续显示冗余文案",
);
assert.match(studioMarkup, /bindtap="copySelectedDecoration"/, "纹样调校必须提供复制操作");
assert.match(studioMarkup, /maxlength="6"/, "装饰页题款输入必须限制为六个字");
assert.match(
  studioMarkup,
  /wx:if="{{!selectedDecorationIsSeal}}" class="decor-tool-command"[^>]+bindtap="copySelectedDecoration"/,
  "题款被选中时不能显示复制操作",
);

const paintTabsBlock = studioSource.match(
  /const PAINT_CATALOG_TABS:[\s\S]*?= \[([\s\S]*?)\];/,
);
assert.ok(paintTabsBlock, "彩绘页必须有独立的一级菜单契约");
assert.deepEqual(
  [...paintTabsBlock[1].matchAll(/name:"([^"]+)"/g)].map((match) => match[1]),
  ["图案", "纹样", "涂色"],
  "彩绘页左侧必须且只能保留图案、纹样、涂色三个菜单项",
);
const paintStageMarkup = studioMarkup.match(
  /<view wx:elif="{{stageIndex===4}}"[\s\S]*?(?=<view wx:else class="tray">)/,
);
assert.ok(paintStageMarkup, "彩绘阶段工作台必须存在");
assert.match(paintStageMarkup[0], /wx:for="{{paintTabs}}"/, "彩绘左侧必须渲染三个一级菜单");
assert.match(paintStageMarkup[0], /class="decor-panel-grid paint-panel-grid"/, "彩绘页必须复用装饰页 3:2 双栏工作台");
assert.match(paintStageMarkup[0], /wx:for="{{paintLayers}}"/, "彩绘右侧必须只管理釉上彩图层");
assert.doesNotMatch(
  paintStageMarkup[0],
  /paintPanel|setPaintPanel|写款收尾|bindtap="applyInscription"/,
  "彩绘主菜单不能继续混入旧点彩/写款表单",
);
assert.match(
  studioMarkup,
  /stageIndex===1\|\|stageIndex===2\|\|stageIndex===4/,
  "彩绘页必须复用装饰工坊背景",
);
assert.match(
  studioMarkup,
  /stageIndex===4&&hasSelectedPaintItem/,
  "彩绘图层必须接入浮动调校工具",
);
assert.match(
  studioSource,
  /const surfaceEditing = this\.work\.currentStage === "decorate" \|\| this\.work\.currentStage === "paint"/,
  "彩绘图层必须支持在器身上直接拖动",
);

const boundHandlers = new Set(
  [...studioMarkup.matchAll(/\b(?:bind|catch)(?:tap|touchstart|touchmove|touchend|touchcancel|input|changing|change)="([A-Za-z0-9_]+)"/g)]
    .map((match) => match[1]),
);
for (const handler of boundHandlers) {
  assert.match(
    studioSource,
    new RegExp(`\\n\\s+${handler}\\(`),
    `WXML 事件 ${handler} 必须在 studio.ts 中实现`,
  );
}

for (const shapeId of ["cup", "bowl", "vase", "jar", "plate"]) {
  const anchors = availableAnchors(shapeId);
  assert.ok(anchors.includes("base"), `${shapeId} 必须开放器底写款`);
  for (const template of DECORATION_TEMPLATES) {
    const first = applyDecorationTemplate(
      createDecorationComposition(`same-${shapeId}`),
      template.id,
      shapeId,
    );
    const second = applyDecorationTemplate(
      createDecorationComposition(`same-${shapeId}`),
      template.id,
      shapeId,
    );
    assert.ok(
      first.layers.length > 0,
      `${shapeId}/${template.id} 必须能自动构图`,
    );
    assert.equal(first.layers.length, template.components.length, "一键套版必须完整保留全部构图层");
    assert.ok(
      first.layers.every((layer) => anchors.includes(layer.anchor)),
      "套版只能使用当前器形开放的语义分区",
    );
    const stripIds = (composition) =>
      composition.layers.map(({ layerId, ...layer }) => layer);
    assert.deepEqual(
      stripIds(first),
      stripIds(second),
      "同一器形与套版的布局参数必须可重复",
    );
  }
}

for (const density of [0.65, 0.8, 1, 1.35, 1.8]) {
  const repeats = borderRepeatCount(density);
  assert.equal(
    repeats,
    Math.round(repeats),
    "连续边饰重复数必须是整数，才能闭合圆周",
  );
  assert.ok(repeats >= 6 && repeats <= 18, "连续边饰重复数必须留在安全范围");
}

const manyLayerWork = createWork("vase");
manyLayerWork.decorationComposition.layers = Array.from({ length: 20 }, (_, index) =>
  createDecorationLayer(index % 2 ? "cloud" : "lotus", "main", "vase", "yuan_blue", {
    u:index / 20,
    v:0.15 + index / 30,
  }),
);
assert.equal(
  validateWork(manyLayerWork).decorationComposition.layers.length,
  20,
  "作品保存与恢复必须完整保留大量器身图样",
);

const stampWork = createWork("jar");
stampWork.decorationComposition.stamps = Array.from(
  { length: MAX_DECORATION_STAMPS },
  (_, index) =>
    createDecorationStamp(
      "cloud",
      "jar",
      "yuan_blue",
      index / MAX_DECORATION_STAMPS,
      0.52,
    ),
);
const restoredStamps = validateWork(stampWork);
assert.equal(
  restoredStamps.decorationComposition.stamps.length,
  8,
  "八枚自由落印必须完整恢复",
);
const overflowComposition = JSON.parse(
  JSON.stringify(stampWork.decorationComposition),
);
overflowComposition.stamps.push(
  createDecorationStamp("lotus", "jar", "yuan_blue"),
);
assert.equal(
  validateDecorationComposition(overflowComposition, "jar", stampWork.workId)
    .stamps.length,
  MAX_DECORATION_STAMPS,
  "损坏数据超过落印上限时必须安全收敛",
);

const invalidLayer = createDecorationStamp("lotus", "cup", "yuan_blue");
invalidLayer.u = Number.NaN;
invalidLayer.v = 100;
invalidLayer.scale = -20;
const clamped = clampDecorationLayer(invalidLayer, "cup");
assert.ok(
  Number.isFinite(clamped.u) && Number.isFinite(clamped.v),
  "装饰参数不能恢复为 NaN",
);
assert.equal(clamped.v, 1, "图案位置只能受器身真实顶边约束，不能被语义分区截回");
assert.ok(
  clamped.scale >= 0.42 && clamped.scale <= 1.65,
  "装饰大小必须在渲染安全范围",
);

const bottomDecoration = createDecorationStamp("lotus", "cup", "yuan_blue");
bottomDecoration.v = 0;
assert.equal(
  clampDecorationLayer(bottomDecoration, "cup").v,
  0,
  "v=0 必须保留为器身与器底的交界",
);
bottomDecoration.v = -100;
assert.equal(
  clampDecorationLayer(bottomDecoration, "cup").v,
  MIN_DECORATION_SURFACE_V,
  "任意纹样都必须能穿过足边并移动到器底中心",
);
bottomDecoration.v = 1;
assert.equal(
  clampDecorationLayer(bottomDecoration, "cup").v,
  1,
  "任意纹样都必须能移动到器身最顶部",
);

const sixCharacterSeal = createSealMark("一二三四五六七", "seal_red", 0.25, 0);
assert.equal(
  Array.from(sixCharacterSeal.text).length,
  MAX_SEAL_MARK_CHARACTERS,
  "题款必须按 Unicode 字符限制为六个字",
);
assert.equal(sixCharacterSeal.v, 0, "题款必须能落在足边交界");
const centeredBaseSeal = createSealMark("底款", "cobalt", 0.25, -100);
assert.equal(
  centeredBaseSeal.v,
  MIN_DECORATION_SURFACE_V,
  "题款必须能完整移动到器底中心",
);
const restoredSeal = clampSealMark({
  ...sixCharacterSeal,
  v:1,
  scaleX:1.4,
  scaleY:0.7,
});
assert.equal(restoredSeal.v, 1, "题款必须能移动到器身最顶部");
assert.equal(restoredSeal.scaleX, 1.4, "题款横向调校必须可持久化");
assert.equal(restoredSeal.scaleY, 0.7, "题款纵向调校必须可持久化");

const legacyTransform = createDecorationStamp("plum", "vase", "yuan_blue");
legacyTransform.scale = 1.24;
delete legacyTransform.scaleX;
delete legacyTransform.scaleY;
delete legacyTransform.flipY;
const upgradedTransform = clampDecorationLayer(legacyTransform, "vase");
assert.equal(upgradedTransform.scaleX, 1.24, "旧作品横向大小应从统一大小恢复");
assert.equal(upgradedTransform.scaleY, 1.24, "旧作品纵向大小应从统一大小恢复");
assert.equal(upgradedTransform.flipY, false, "旧作品默认不翻转纹样");

const transformedWork = createWork("vase", "porcelain", "free");
const transformedStamp = createDecorationStamp("plum", "vase", "yuan_blue");
transformedStamp.catalogKey = "inscription:plum";
transformedStamp.scaleX = 0.72;
transformedStamp.scaleY = 1.42;
transformedStamp.flipY = true;
transformedWork.decorationComposition.stamps.push(transformedStamp);
const restoredTransform = validateWork(JSON.parse(JSON.stringify(transformedWork)))
  .decorationComposition.stamps[0];
assert.equal(restoredTransform.catalogKey, "inscription:plum", "菜单勾选来源必须随作品恢复");
assert.equal(restoredTransform.scaleX, 0.72, "横向伸缩必须随作品恢复");
assert.equal(restoredTransform.scaleY, 1.42, "纵向伸缩必须随作品恢复");
assert.equal(restoredTransform.flipY, true, "上下翻转必须随作品恢复");

const copySource = createDecorationStamp("plum", "vase", "yuan_blue");
const firstCopy = duplicateDecorationLayer(copySource, [copySource], "vase");
const secondCopy = duplicateDecorationLayer(firstCopy, [copySource, firstCopy], "vase");
assert.notEqual(firstCopy.layerId, copySource.layerId, "复制纹样必须生成独立图层");
assert.equal(firstCopy.copyNumber, 1, "第一次复制的角标应为 1");
assert.equal(secondCopy.copyNumber, 2, "再次复制的角标应递增为 2");
const restoredCopy = validateDecorationComposition({
  ...createDecorationComposition("copy-work"),
  stamps:[firstCopy]
}, "vase", "copy-work").stamps[0];
assert.equal(restoredCopy.copySourceId, copySource.layerId, "复制来源必须随作品恢复");
assert.equal(restoredCopy.copyNumber, 1, "复制角标必须随作品恢复");

assert.equal(
  validateInscriptionText("掌心作\n2026.8.25"),
  "",
  "两行十二字以内的常用款识应可使用",
);
assert.match(
  validateInscriptionText("泥火青花😀"),
  /emoji/,
  "emoji 必须得到明确提示",
);
assert.match(
  validateInscriptionText("一二三四五六七八九十十一十二十三"),
  /12/,
  "超长款识必须得到明确提示",
);
assert.match(
  validateInscriptionText("第一行\n第二行\n第三行"),
  /两行/,
  "写款不得超过两行",
);

const workId = "work_fixed_seed";
assert.equal(
  stableKilnSeed(workId),
  stableKilnSeed(workId),
  "同一作品的窑烧种子必须稳定",
);
assert.notEqual(
  stableKilnSeed(workId),
  stableKilnSeed(`${workId}_copy`),
  "复制作品必须获得新的窑烧变化",
);

const current = createWork("vase");
const legacy = JSON.parse(JSON.stringify(current));
legacy.schemaVersion = 1;
delete legacy.decorationComposition;
legacy.decorations = [
  { type: "carve", y: 0.5, angle: 20 },
  { type: "stamp", y: 0.62, angle: 90 },
];
legacy.paintPattern = 3;
legacy.paintColor = "#a95955";
legacy.symmetry = 2;
legacy.stageIndex = 4;
legacy.currentStage = "broken";
const migrated = validateWork(legacy);
assert.ok(migrated, "schema 1 作品必须可迁移");
assert.equal(migrated.schemaVersion, 2, "旧作品必须升级到 schema 2");
assert.equal(migrated.currentStage, "paint", "迁移后阶段字符串必须与索引一致");
assert.equal(
  migrated.decorationComposition.layers.length,
  2,
  "旧泥上装饰与旧彩绘必须拆成独立层",
);

const copy = cloneWork(migrated);
copy.decorationComposition.layers[0].scale += 0.2;
assert.notEqual(
  copy.decorationComposition.layers[0].scale,
  migrated.decorationComposition.layers[0].scale,
  "装饰组合快照必须深拷贝，才能安全撤销和复制",
);

const localStorage = new Map();
global.wx = {
  getStorageSync(key) {
    return localStorage.get(key);
  },
  setStorageSync(key, value) {
    localStorage.set(key, JSON.parse(JSON.stringify(value)));
  },
  removeStorageSync(key) {
    localStorage.delete(key);
  },
};
const {
  duplicateWork,
  loadWork,
  savePrivateMark,
  saveWork,
} = require("../services/storage.ts");
const source = createWork("bowl");
source.decorationComposition = applyDecorationTemplate(
  source.decorationComposition,
  "lotus_pond",
  "bowl",
);
source.decorationComposition.inscription = {
  contentType: "signature",
  text: "掌心作",
  layoutId: "square_2x2",
  styleId: "blue",
  typefaceId: "regular",
  anchor: "base",
  visibleInExport: true,
};
source.decorationComposition.sealMark = createSealMark(
  "泥火青花作",
  "cobalt",
  0.3,
  0,
);
source.status = "completed";
source.stageIndex = 6;
source.currentStage = "finished";
saveWork(source);
const fullCopy = duplicateWork(source, "full");
const motifCopy = duplicateWork(source, "decor");
for (const duplicated of [fullCopy, motifCopy]) {
  assert.equal(duplicated.status, "draft", "复制再创作必须生成草稿");
  assert.equal(duplicated.stageIndex, 1, "复制再创作必须回到装饰阶段");
  assert.equal(
    duplicated.currentStage,
    "decorate",
    "复制作品不能出现草稿加 finished 的矛盾状态",
  );
  assert.notEqual(
    duplicated.decorationComposition.kilnSeed,
    source.decorationComposition.kilnSeed,
    "复制作品必须使用新窑烧种子",
  );
  assert.notEqual(
    duplicated.decorationComposition.layers[0].layerId,
    source.decorationComposition.layers[0].layerId,
    "复制层必须生成新 ID",
  );
}
assert.ok(fullCopy.decorationComposition.inscription, "完整复制必须保留款识");
assert.ok(fullCopy.decorationComposition.sealMark, "完整复制必须保留作品上的题款");
assert.equal(
  motifCopy.decorationComposition.inscription,
  undefined,
  "只沿用纹样不应把私人款识带入新作",
);
assert.equal(
  motifCopy.decorationComposition.sealMark,
  undefined,
  "只沿用纹样不应把单例题款复制到新作",
);
assert.equal(motifCopy.glazeId, "celadon", "只沿用纹样应回到默认釉色");
motifCopy.decorationComposition.layers[0].scale += 0.3;
assert.notEqual(
  motifCopy.decorationComposition.layers[0].scale,
  source.decorationComposition.layers[0].scale,
  "新旧作品不能共享可变装饰状态",
);

const privateInscription = source.decorationComposition.inscription;
savePrivateMark(privateInscription);
savePrivateMark({ ...privateInscription, text: "平安喜乐" });
savePrivateMark({ ...privateInscription, text: "岁岁安好" });
assert.throws(
  () => savePrivateMark({ ...privateInscription, text: "常乐常安" }),
  /PRIVATE_MARK_LIMIT/,
  "私款超过三枚时不能静默删除旧项",
);

const legacyId = "legacy_recovery";
const recoverableLegacy = { ...legacy, workId: legacyId };
localStorage.set(`palm-kiln-work:${legacyId}`, recoverableLegacy);
const loadedLegacy = loadWork(legacyId);
assert.equal(loadedLegacy.schemaVersion, 2, "存储层必须在加载时完成显式迁移");
assert.ok(
  localStorage.get(`palm-kiln-work-recovery:${legacyId}`),
  "迁移前原始作品必须保留为恢复副本",
);

console.log(
  "decoration tests passed: unlimited saved body layers, 8 stamps, templates, inscriptions and deterministic kiln seed",
);
