const assert = require("node:assert/strict");
const fs = require("node:fs");
const typescript = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = typescript.transpileModule(source, {
    compilerOptions: { target:typescript.ScriptTarget.ES2018, module:typescript.ModuleKind.CommonJS },
  }).outputText;
  module._compile(output, filename);
};

const read = (file) => fs.readFileSync(file, "utf8");
const studioEntry = read("pages/studio/studio.wxss");
const studioMarkup = read("pages/studio/studio.wxml");
const studioSource = read("pages/studio/studio.ts");
const resultMarkup = read("pages/result/result.wxml");
const resultStyles = read("pages/result/result.wxss");
const resultSource = read("pages/result/result.ts");
const shapingStyles = read("pages/studio/styles/shaping.wxss");
const baseStyles = read("pages/studio/styles/base.wxss");
const styleFiles = ["base", "shaping", "decoration", "glazing", "firing"]
  .map((name) => `pages/studio/styles/${name}.wxss`);
const studioStyles = styleFiles.map(read).join("\n");

for (const file of styleFiles) assert.ok(fs.existsSync(file), `${file} 必须存在`);
for (const name of ["base", "shaping", "decoration", "glazing", "firing"]) {
  assert.match(studioEntry, new RegExp(`@import "\\./styles/${name}\\.wxss"`), `创作台必须导入 ${name} 样式`);
}
assert.match(read("pages/studio/styles/base.wxss"), /\.topbar\s*\{/, "顶栏基础规则必须归入 base.wxss");
assert.doesNotMatch(
  styleFiles.slice(1).map(read).join("\n"),
  /\.topbar\s*\{/,
  "各工序样式不得重新定义顶栏基础规则"
);
assert.doesNotMatch(studioStyles, /\.circle(?:\s|\.|\{|,)/, "旧 circle 临时控件不得保留");

const undersized = [...studioStyles.matchAll(/font-size:\s*(\d+(?:\.\d+)?)rpx/g)]
  .map((match) => Number(match[1]))
  .filter((size) => size < 22);
assert.deepEqual(undersized, [], "创作台不得出现小于 22rpx 的文字");
assert.match(studioStyles, /\.stage-tool\s*\{[\s\S]*?width:\s*80rpx[\s\S]*?height:\s*80rpx/, "密集工具热区不得小于 80rpx");
assert.match(studioStyles, /grid-template-columns:\s*minmax\(0, 3fr\) minmax\(0, 2fr\)/, "装饰菜单必须保留约 3:2 且可收缩的列轨道");
assert.match(studioMarkup, /class="stage-progress"/, "创作台必须用釉痕工序进度表达七道工序");
assert.match(studioMarkup, /wx:if="\{\{stageIndex===0\}\}"[\s\S]*?id="wheelRoot"/, "圆形转盘只应在制坯页渲染");
assert.match(studioMarkup, /class="shaping-controls"[\s\S]*?class="wall-caliper[\s\S]*?class="form-switcher"/, "制坯控制应按厚度到受力形态纵向排列");
assert.match(shapingStyles, /\.form-switcher\s*\{[\s\S]*?flex-direction:\s*column/, "受力形态按钮必须竖向排列");
assert.match(shapingStyles, /\.form-switcher\s*\{[\s\S]*?background:\s*var\(--ui-workshop-panel-soft\)/, "受力形态面板透明度必须与厚度面板一致");
assert.match(shapingStyles, /\.gesture-map,[\s\S]*?\.stage-tips\s*\{\s*background:\s*var\(--color-workshop-surface\)/, "制坯两个说明弹窗必须使用不透底表面");
assert.match(baseStyles, /\.wheel-root\s*\{[\s\S]*?bottom:\s*20px/, "制坯转盘应与舞台底部保持 20px 间距");
assert.doesNotMatch(studioMarkup, /[↶↷⛶⌄⌃]/, "正式工具不得继续使用临时 Unicode 图标");
assert.doesNotMatch(studioSource, /菜单 \$\{index \+ 1\}/, "装饰侧栏不得保留菜单 1 等占位名称");
assert.match(studioSource, /surfaceEditing && !this\.data\.decorFullscreen/, "全屏必须继续禁用单指纹样移动");
assert.match(studioSource, /refreshCanvasLayout\(true, decorFullscreen \|\| !this\.data\.decorTrayOpen\)/, "抽屉和全屏必须继续保护器物视觉尺度");

assert.match(resultMarkup, /<app-nav[\s\S]*?theme="dark"/, "成品页必须复用统一深色导航");
assert.match(resultMarkup, /class="sheet-close"[\s\S]*?bindtap="closeInfo"/, "信息抽屉必须有明确关闭按钮");
assert.match(resultMarkup, /<scroll-view class="info-scroll"/, "信息抽屉必须内部滚动");
assert.match(resultMarkup, /class="info-sheet tone-light ui-motion"/, "信息抽屉必须重置为月白内容 Token");
assert.match(resultMarkup, /class="result-canvas"[\s\S]*?hidden="\{\{infoOpen\|\|!!preview\}\}"/, "原生 WebGL 画布不得穿透信息抽屉或导出预览");
assert.match(resultMarkup, /class="preview tone-light/, "导出预览必须回到月白内容场景");
assert.match(resultStyles, /minmax\(0, 1fr\) minmax\(0, 1fr\) 72rpx/, "成品页常规操作区必须允许内容收缩");
assert.match(resultStyles, /@media \(max-width: 340px\)[\s\S]*?\.action-primary\s*\{\s*grid-column:\s*1 \/ -1/, "窄屏主按钮必须独占一行");
assert.match(resultSource, /exportTask:"" as "" \| "art" \| "poster"/, "作品图与海报必须有独立任务状态");
assert.match(resultSource, /savingPreview:true[\s\S]*?saveImageToPhotosAlbum/, "保存相册必须防重复提交");
assert.match(resultSource, /相册权限未开启[\s\S]*?再次点“保存到相册”即可/, "相册拒绝后必须给出可恢复路径");
assert.match(resultSource, /loadSettings\(\)\.reduceMotion/, "成品页必须消费全局减少动态设置");
assert.match(resultMarkup, /class="result-more"[\s\S]*?name="more"/, "成品页必须提供更多信息入口");
assert.match(resultMarkup, /class="plinth-front"[\s\S]*?class="plinth-top-inset"/, "成品展台必须使用分层前立面与台面");
assert.doesNotMatch(resultMarkup, /plinth-rim|plinth-feet|plinth-cloud/, "成品展台不得继续保留旧的家具式底座装饰");
assert.doesNotMatch(resultMarkup, /right-icon="info"/, "成品页必须移除旧信息 i 按钮");
assert.match(resultStyles, /flex-direction:\s*column/, "成品操作按钮内的图标和文字必须垂直居中");
assert.doesNotMatch(studioStyles + resultStyles, /\*\s*::(?:before|after)/, "迁移后的 WXSS 不得使用不兼容的通配符伪元素选择器");

const { resolveRenderDpr } = require("../utils/render-quality.ts");
assert.equal(resolveRenderDpr(3, "low"), 1, "流畅画质必须限制像素负载");
assert.equal(resolveRenderDpr(3, "medium"), 1.5, "均衡画质必须限制像素负载");
assert.equal(resolveRenderDpr(3, "high"), 2, "精细画质仍应限制极端 DPR");

console.log("stages 3-5 UI tests passed: split studio styles, accessible controls, export recovery and render quality");
