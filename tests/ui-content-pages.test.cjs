const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");
const indexMarkup = read("pages/index/index.wxml");
const indexSource = read("pages/index/index.ts");
const galleryMarkup = read("pages/gallery/gallery.wxml");
const galleryStyles = read("pages/gallery/gallery.wxss");
const settingsMarkup = read("pages/settings/settings.wxml");
const settingsSource = read("pages/settings/settings.ts");
const navStyles = read("components/app-nav/app-nav.wxss");

assert.match(settingsMarkup, /<app-nav/, "设置页应复用共享导航");
assert.doesNotMatch(settingsMarkup, /引导强度|guidance/, "引导强度设置必须移除");
assert.match(settingsMarkup, /<radio-group[^>]+bindchange="setQuality"/, "画质应使用原生单选组");
assert.doesNotMatch(settingsMarkup, /环境声音|settings\.sound/, "未实现的环境声音不得重新出现");
assert.doesNotMatch(settingsMarkup, /自动降低细节/, "设置页不得承诺尚未实现的自动画质降档");
assert.match(settingsMarkup, /saveState/, "设置变更应提供行内保存状态");
assert.match(settingsSource, /saveSettings\(settings\)/, "设置必须即时持久化");

assert.match(galleryMarkup, /<app-nav/, "作品集应复用共享导航");
assert.match(galleryMarkup, /class="gallery-organize[^"]*"[^>]+bindtap="enterSelectMode"[^>]*>整理<\/button>/, "作品集应提供可见整理入口");
assert.match(galleryMarkup, /class="selection-toggle-all[^"]*"[^>]+bindtap="toggleAll"/, "整理模式应提供可见全选入口");
assert.match(galleryMarkup, /<button class="gallery-tab ui-tab/, "筛选项应使用原生按钮语义");
assert.match(galleryMarkup, /card-check \{\{item\.selected \? 'is-checked'/, "多选状态应有勾选视觉线索");
assert.match(galleryMarkup, /disabled="\{\{!selectedCount\}\}"[\s\S]*?aria-disabled="\{\{!selectedCount\}\}"/, "无选择时删除必须真正禁用");
assert.match(galleryStyles, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/, "两列卡片必须允许内容收缩");

for (const label of ["开始制坯", "继续创作", "查看作品"]) {
  assert.match(indexMarkup, new RegExp(label), `首页应提供“${label}”动作`);
}
assert.doesNotMatch(indexMarkup, /[‹↗→]/, "首页正式操作不得继续使用 Unicode 箭头图标");
assert.match(indexSource, /resolveUiMetrics\(\)/, "首页导航尺寸应复用共享指标计算");
assert.match(indexSource, /loadSettings\(\)\.reduceMotion/, "首页应读取全局减少动态设置");

for (const markup of [indexMarkup, galleryMarkup, settingsMarkup]) {
  assert.match(markup, /reduce-motion/, "迁移内容页都应消费全局减少动态设置");
}
assert.match(navStyles, /left:\s*50%;[\s\S]*?transform:\s*translateX\(-50%\)/, "共享导航标题应保持屏幕视觉居中");

console.log("stage 2 content page tests passed: settings, gallery, home, accessibility and reduced motion guards");
