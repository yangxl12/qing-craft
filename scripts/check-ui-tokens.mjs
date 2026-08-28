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
  "pages/ui-preview/ui-preview.wxss"
];
for (const file of tokenOnlyFiles) {
  const literals = [...normalizedLiterals(read(file))];
  if (literals.length) failures.push(`${file} 新基础样式必须只引用 Token：${literals.join(", ")}`);
}

const legacyBudgets = {
  "pages/index/index.wxss":29,
  "pages/gallery/gallery.wxss":39,
  "pages/settings/settings.wxss":22,
  "pages/result/result.wxss":108,
  "pages/studio/studio.wxss":603
};
for (const [file, budget] of Object.entries(legacyBudgets)) {
  const count = normalizedLiterals(read(file)).size;
  if (count > budget) failures.push(`${file} 硬编码色从基线 ${budget} 增至 ${count}`);
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

console.log(`UI foundation checks passed: ${contrastPairs.length} contrast pairs, ${new Set(iconNames).size} local icons, legacy color budgets held`);

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
