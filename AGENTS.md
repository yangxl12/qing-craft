- 优先选择简单、成熟的方案，避免过度设计和重复造轮子。
- 先检查项目现有代码、依赖和文档，再进行修改或新增。
- 从最小可用版本开始，逐步扩展功能，不为未来需求提前增加复杂度。
- 保持模块清晰、职责单一，优先复用已有能力。
- 架构决策考虑长期维护，避免只解决眼前问题的临时方案。
- 修改前先理解现有实现，尽量小范围改动，确保已有功能稳定。
- 项目介绍位于 `docs\项目介绍.md`，仅在任务确有必要时查看。

## 微信开发者工具 MCP

- 服务名为 `wechat-devtools`，工具名前缀为 `mcp__wechat_devtools__`；Codex 配置位于 `C:\Users\Administrator\.codex\config.toml` 的 `[mcp_servers.wechat-devtools]`，由 `uvx wechat-devtools-mcp` 启动，安装目录为 `C:\Users\Administrator\AppData\Roaming\uv\tools\wechat-devtools-mcp`，微信 CLI 为 `D:\微信web开发者工具\cli.bat`。
- 本项目路径为 `D:\my-project\qing-craft`。全局 `WECHAT_PROJECT_PATH` 当前指向其他项目，所以凡支持 `project_path` 的调用都必须显式传入本项目路径，不能依赖默认值。
- 所有工具统一使用 `{"params": {...}}` 传参；默认 `cdp_port=9222`、`auto_port=9420`，同一调试流程中的端口必须保持一致。
- 需要运行、交互、调试或界面验证时直接调用，无需先询问。常用顺序为：`wechat_ide(open)` → `wechat_automator(start)` → `wechat_navigate`/`wechat_automator` → `wechat_screenshot`/`wechat_inspector`。
- 常用启动参数：`mcp__wechat_devtools__wechat_ide` 传 `{"params":{"action":"open","project_path":"D:\\my-project\\qing-craft","cdp_enabled":true,"cdp_port":9222}}`；随后 `mcp__wechat_devtools__wechat_automator` 传 `{"params":{"action":"start","project_path":"D:\\my-project\\qing-craft","auto_port":9420}}`。
- 工具与关键参数：
  - `wechat_ide`：`action=open|login|is_login|close|quit|status`；打开项目主要传 `project_path`、`cdp_enabled`、`cdp_port`。
  - `wechat_automator`：支持 `tap`、`input`、`element_info`、`set_data`、`call_method`、`call_wx`、`mock_wx`、`evaluate`、`page_stack`、`page_data`、`system_info`、`storage`；点击/输入传 `selector`，输入再传 `value`，执行脚本传 `expression`，页面数据可传 `expected_path`。
  - `wechat_navigate`：必传 `page_path`，可传 `wait_ms`、`timeout`、`auto_port`、`cdp_port`，跳页同时采集运行时日志。
  - `wechat_screenshot`：可传 `page_path`、`full_page`、`output_path`、`auto_port`；该工具没有 `project_path` 参数，因此必须将 `output_path` 显式设为 `D:\my-project\qing-craft\screenshots\<文件名>.png`，避免写入错误的全局默认目录。
  - `wechat_inspector`：`action=console|cdp`，常用参数为 `duration`、`detail_level`、`max_logs` 及对应端口。
  - `wechat_build`：`action=compile|preview|upload|build_npm|cache_clean`；均显式传 `project_path`，上传时另传必填 `version` 和可选 `desc`。
  - `wechat_file`：`action=project_info|list_pages|read_page|read_file`；传 `project_path`，读取页面/文件时再传 `page_path`/`file_path`。
