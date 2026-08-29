const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { target:ts.ScriptTarget.ES2018, module:ts.ModuleKind.CommonJS },
  }).outputText;
  module._compile(output, filename);
};

const { normalizeSettings } = require("../utils/settings.ts");
const { runConfirmedAction } = require("../utils/destructive-actions.ts");
const { calculateBelowCapsuleTop, calculateUiMetrics } = require("../utils/ui-metrics.ts");

const legacySettings = normalizeSettings({
  sound:true,
  haptics:false,
  quality:"high",
  reduceMotion:true,
});
assert.equal("sound" in legacySettings, false, "声音引擎未实现前不能继续保存无效设置");
assert.deepEqual(legacySettings, {
  haptics:false,
  quality:"high",
  reduceMotion:true,
});

const untouched = { layers:["lotus"], history:["snapshot"] };
const beforeCancel = JSON.stringify(untouched);
const cancelled = runConfirmedAction({ confirm:false }, () => untouched.layers.splice(0));
assert.equal(cancelled, false, "取消确认必须返回未执行");
assert.equal(JSON.stringify(untouched), beforeCancel, "取消破坏性操作后数据与历史必须不变");
assert.equal(runConfirmedAction({ confirm:true }, () => untouched.layers.splice(0)), true);
assert.deepEqual(untouched.layers, [], "确认后才执行破坏性变更");

const metrics = calculateUiMetrics(
  { windowWidth:375, statusBarHeight:20 },
  { top:24, bottom:56, left:278, height:32 }
);
assert.equal(metrics.navigationBarHeight, 44, "导航必须提供 88rpx 等价高度");
assert.ok(metrics.contentTop >= 64, "内容起点必须避开状态栏与导航");
assert.ok(metrics.capsulePadding >= 96, "导航右侧必须避开微信胶囊");
assert.equal(metrics.capsuleBottom, 56, "必须保留微信胶囊底部位置");
assert.ok(calculateBelowCapsuleTop(metrics.statusBarHeight, metrics.capsuleBottom) >= 68, "浮动按钮必须放在胶囊下方");

const settingsMarkup = fs.readFileSync("pages/settings/settings.wxml", "utf8");
const resultStyles = fs.readFileSync("pages/result/result.wxss", "utf8");
const galleryMarkup = fs.readFileSync("pages/gallery/gallery.wxml", "utf8");
const studioSource = fs.readFileSync("pages/studio/studio.ts", "utf8");
const studioMarkup = fs.readFileSync("pages/studio/studio.wxml", "utf8");
const resultMarkup = fs.readFileSync("pages/result/result.wxml", "utf8");
assert.doesNotMatch(settingsMarkup, /环境声音|settings\.sound/, "未实现的环境声音设置必须隐藏");
assert.match(settingsMarkup, /<app-nav/, "设置页必须使用共享导航作为浅色场景样例");
assert.match(resultStyles, /minmax\(0, 1fr\) minmax\(0, 1fr\) 72rpx/, "成品操作区必须允许网格内容收缩");
assert.match(resultStyles, /@media \(max-width: 340px\)/, "成品操作区必须提供窄屏换行");
assert.match(galleryMarkup, /disabled="{{!selectedCount}}"[^>]+aria-disabled="{{!selectedCount}}"/, "无选择时删除必须真正禁用");
assert.doesNotMatch(studioSource, /setGuidanceHint|shouldShowGuidance|scheduleIdleGuidance/, "引导强度已下线，创作台不再写入教学提示");
assert.doesNotMatch(studioMarkup, /class="hint panel"/, "创作台底部提示面板必须移除");
assert.match(studioMarkup, /bindtap="toggleTips"/, "制坯顶部必须提供独立提示入口");
assert.doesNotMatch(resultMarkup, /class="note"/, "成品页底部提示必须移除");
assert.match(resultMarkup, /class="result-more"/, "成品页必须把更多入口放到胶囊下方的独立按钮");
assert.doesNotMatch(resultMarkup, /right-icon="info"/, "成品页顶部不能继续使用信息 i 按钮");
assert.match(studioSource, /runConfirmedAction\(result/, "返回制坯必须把变更置于确认边界后");

console.log("ui foundation tests passed: settings, confirmation invariance, metrics and P0 layout guards");
