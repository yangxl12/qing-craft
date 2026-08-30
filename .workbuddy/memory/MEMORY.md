# 项目长期约定

## Git 操作安全

- **禁止使用 `git stash`**：2026-08-30 在本环境执行 `git stash push` 后，`.git/objects` 与 `.git/refs` 内容被清空，仓库一度报 “not a git repository”，最后靠 `git fetch origin` + 手动补 refs 才恢复。
- 需要对比基线时改用只读方式：`git show HEAD:<file>`、`git diff`、`git status`。
- 若对象库再次丢失，恢复步骤：`mkdir -p .git/objects/info .git/objects/pack .git/refs/heads .git/refs/remotes/origin .git/refs/tags` → `git fetch origin main` → 用 `git update-ref refs/heads/main <sha>` 与 `git update-ref refs/remotes/origin/main <sha>` 恢复引用（工作区文件不受影响）。

## UI 改动约定

- 触控热区偏小是本项目的常见返工点：纹样调校面板命令按钮、款色卡、落款按钮等保持在 70rpx 以上。
- 改动样式后必须跑 `npm test`、`npx tsc --noEmit`、`node scripts/check-ui-tokens.mjs`。
- `node scripts/check-ui-tokens.mjs` 现有一个**既有**失败项：`pages/studio/styles/decoration.wxss` 第 165 行硬编码 `--ui-action-text: #f8faf6`，非当前改动引入，未修。

## 页面关系

- 成品展台 `pages/result/result` 由创作台 `redirectTo` 而来，页面栈为 首页 → 成品展台，可再 `navigateTo` 到作品集 `pages/gallery/gallery`。
- 创作台与成品展台都必须传 `id` 才能打开，缺少作品时会回退。
