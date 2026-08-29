import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];

const tokenSource = read("styles/tokens.wxss");
const tokenValues = new Map(
  [...tokenSource.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)]
    .map((match) => [match[1], match[2]])
);

const contrastPairs = [
  ["--color-text", "--color-bg", 4.5, "浅色主文字"],
  ["--color-text-secondary", "--color-bg", 4.5, "浅色辅助文字"],
  ["--color-text-tertiary", "--color-bg", 4.5, "浅色淡墨文字"],
  ["--ui-action-text", "--color-celadon-700", 7, "主按钮文字"],
  ["--ui-danger-text", "--color-danger", 4.5, "危险按钮文字"],
  ["--color-warning", "--color-bg", 4.5, "警告文字"],
  ["--color-info", "--color-bg", 4.5, "信息文字"],
  ["--color-on-dark", "--color-workshop-bg", 4.5, "深色主文字"],
  ["--color-on-dark-muted", "--color-workshop-bg", 4.5, "深色辅助文字"],
  ["--color-celadon-300", "--color-workshop-bg", 4.5, "深色主操作"]
];

for (const [foreground, background, minimum, label] of contrastPairs) {
  const foregroundValue = tokenValues.get(foreground);
  const backgroundValue = tokenValues.get(background);
  if (!foregroundValue || !backgroundValue) {
    failures.push(`${label} 缺少可检查的 Token`);
    continue;
  }
  const ratio = contrast(foregroundValue, backgroundValue);
  if (ratio < minimum) failures.push(`${label} 对比度 ${ratio.toFixed(2)}:1，低于 ${minimum}:1`);
}

const literalPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
const normalizedLiterals = (source) => new Set(
  [...source.matchAll(literalPattern)].map((match) => match[0].toLowerCase().replace(/\s+/g, ""))
);

const tokenOnlyFiles = [
  "app.wxss",
  "styles/primitives.wxss",
  "styles/utilities.wxss",
  "components/ui-icon/ui-icon.wxss",
  "components/app-nav/app-nav.wxss",
  "pages/ui-preview/ui-preview.wxss",
  "pages/result/result.wxss",
  "pages/studio/studio.wxss",
  "pages/studio/styles/base.wxss",
  "pages/studio/styles/shaping.wxss",
  "pages/studio/styles/decoration.wxss",
  "pages/studio/styles/firing.wxss"
];
for (const file of tokenOnlyFiles) {
  const literals = [...normalizedLiterals(read(file))];
  if (literals.length) failures.push(`${file} 新基础样式必须只引用 Token：${literals.join(", ")}`);
}

const legacyBudgets = {
  "pages/index/index.wxss":0,
  "pages/gallery/gallery.wxss":0,
  "pages/settings/settings.wxss":0,
  "pages/result/result.wxss":0,
  "pages/studio/studio.wxss":0
};
for (const [file, budget] of Object.entries(legacyBudgets)) {
  const count = normalizedLiterals(read(file)).size;
  if (count > budget) failures.push(`${file} 硬编码色从基线 ${budget} 增至 ${count}`);
}

const migratedContentFiles = [
  "pages/index/index.wxss",
  "pages/gallery/gallery.wxss",
  "pages/settings/settings.wxss",
  "pages/result/result.wxss",
  "pages/studio/styles/base.wxss",
  "pages/studio/styles/shaping.wxss",
  "pages/studio/styles/decoration.wxss",
  "pages/studio/styles/glazing.wxss",
  "pages/studio/styles/firing.wxss"
];
for (const file of migratedContentFiles) {
  const source = read(file);
  const undersized = [...source.matchAll(/font-size:\s*(\d+(?:\.\d+)?)rpx/g)]
    .map((match) => Number(match[1]))
    .filter((size) => size < 22);
  if (undersized.length) failures.push(`${file} 出现小于 22rpx 的字号：${undersized.join(", ")}`);
  if (/--(?:paper|ink|ink-soft|celadon-deep)\s*:/.test(source)) {
    failures.push(`${file} 不得重新定义迁移别名`);
  }
}

for (const file of [
  "pages/index/index.wxml",
  "pages/gallery/gallery.wxml",
  "pages/settings/settings.wxml",
  "pages/result/result.wxml",
  "pages/studio/studio.wxml"
]) {
  const literals = [...normalizedLiterals(read(file))];
  if (literals.length) failures.push(`${file} 原生组件颜色也必须引用 Token：${literals.join(", ")}`);
}

const glazeFallbackColors = new Set([
  "#587d74", "#eef5ed", "#83a9a1", "#294d41", "#dbe9d7", "#527b68",
  "#070908", "#765a32", "#121512", "#c7bfaf", "#ffffff", "#e8e0d1",
  "#09284d", "#a7cbe1", "#16477b", "#91aaa4", "#bfd6d0"
]);
for (const literal of normalizedLiterals(read("pages/studio/styles/glazing.wxss"))) {
  if (!glazeFallbackColors.has(literal)) failures.push(`上釉样式出现未登记的 UI 色值：${literal}`);
}

for (const file of [
  "pages/index/index.wxml",
  "pages/gallery/gallery.wxml",
  "pages/settings/settings.wxml",
  "pages/studio/studio.wxml",
  "pages/result/result.wxml"
]) {
  const markup = read(file);
  for (const match of markup.matchAll(/<view\b[\s\S]*?>/g)) {
    const tag = match[0];
    if (!/(?:bindtap|catchtap|bindlongpress)=/.test(tag)) continue;
    if (!/aria-role=/.test(tag) || !/aria-label=/.test(tag)) {
      failures.push(`${file} 可点击 view 缺少 aria-role 或 aria-label：${tag.replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
}

const studioMarkup = read("pages/studio/studio.wxml");
const resultMarkup = read("pages/result/result.wxml");
for (const [file, markup] of [["pages/studio/studio.wxml", studioMarkup], ["pages/result/result.wxml", resultMarkup]]) {
  if (/[‹↶↷⛶⌄⌃]/.test(markup)) failures.push(`${file} 正式操作仍包含临时 Unicode 图标`);
}

const studioEntry = read("pages/studio/studio.wxss");
for (const name of ["base", "shaping", "decoration", "glazing", "firing"]) {
  if (!studioEntry.includes(`./styles/${name}.wxss`)) failures.push(`创作台缺少 ${name}.wxss 样式入口`);
}

for (const file of [
  "pages/result/result.wxss",
  "pages/studio/styles/base.wxss",
  "pages/studio/styles/shaping.wxss",
  "pages/studio/styles/decoration.wxss",
  "pages/studio/styles/glazing.wxss",
  "pages/studio/styles/firing.wxss"
]) {
  const source = read(file);
  if (/\*\s*::(?:before|after)/.test(source)) {
    failures.push(`${file} 不得使用微信 WXSS 编译器不支持的通配符伪元素选择器`);
  }
}

const primitives = read("styles/primitives.wxss");
const utilities = read("styles/utilities.wxss");
const appNav = read("components/app-nav/app-nav.wxss");
if (!/\.ui-button\s*\{[\s\S]*?min-height:\s*88rpx/.test(primitives)) failures.push("标准按钮热区未固定为 88rpx");
if (!/\.app-nav__action[\s\S]*?width:\s*88rpx;[\s\S]*?height:\s*88rpx/.test(appNav)) failures.push("导航热区未固定为 88rpx");
if (!utilities.includes("env(safe-area-inset-bottom)")) failures.push("缺少底部安全区工具类");
if (!utilities.includes("prefers-reduced-motion") || !utilities.includes(".reduce-motion")) failures.push("减少动态必须同时覆盖系统与应用设置");

const iconSource = read("components/ui-icon/ui-icon.ts");
const iconListSource = iconSource.match(/const ICON_NAMES = \[([\s\S]*?)\] as const;/)?.[1] || "";
const iconNames = [...iconListSource.matchAll(/"([a-z][a-z-]+)"/g)].map((match) => match[1]);
for (const iconName of new Set(iconNames)) {
  if (!fs.existsSync(path.join(root, "assets", "icons", `${iconName}.svg`))) {
    failures.push(`图标资产缺失：${iconName}.svg`);
  }
}

if (failures.length) {
  console.error(`UI foundation checks failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`UI checks passed: ${contrastPairs.length} contrast pairs, ${new Set(iconNames).size} local icons, stages 0-5 migrated UI stays tokenized and WXSS-compatible`);

function contrast(first, second) {
  const light = luminance(first);
  const dark = luminance(second);
  const high = Math.max(light, dark);
  const low = Math.min(light, dark);
  return (high + 0.05) / (low + 0.05);
}

function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return channels
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}
