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
  createDecorationComposition,
  createDecorationStamp,
  DECORATION_TEMPLATES,
  MAX_DECORATION_LAYERS,
  MAX_DECORATION_STAMPS,
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
    assert.ok(
      first.layers.length <= MAX_DECORATION_LAYERS,
      "一键套版不能突破五层上限",
    );
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
assert.ok(
  clamped.scale >= 0.42 && clamped.scale <= 1.65,
  "装饰大小必须在渲染安全范围",
);

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
assert.equal(
  motifCopy.decorationComposition.inscription,
  undefined,
  "只沿用纹样不应把私人款识带入新作",
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
  "decoration tests passed: schema migration, 5 layers, 8 stamps, templates, inscriptions and deterministic kiln seed",
);
