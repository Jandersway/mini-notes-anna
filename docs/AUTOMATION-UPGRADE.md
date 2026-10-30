# 自动化验收升级

日期：2026-10-30。承接两版项目对比评审，保留现有 React / Go 实现、Anna Host API 调用链及单列 UI。

## 升级内容

1. 新增 `ci.yml`：分支 push 和 PR 触发验收。
2. 新增可复用 `verify.yml`：固定 Node / Go，安装 uv 和 Chromium，执行 `npm run check:all`；失败时仍上传证据。
3. Release 必须先通过同一套 App/UI 验收，再进入三平台构建；仍拒绝覆盖已公开 Release。
4. UI 自动化增加 storage.set 故障注入、保存和删除失败保护、恢复重试、笔记/错误文本安全渲染，以及禁止前端 llm namespace 调用的断言。
5. 本机 archive 解压后，除 describe 外运行完整双向协议测试；记录写入独立的 `test-results/archive-<platform>/`。
6. 新增 `prepare:harness`，从已安装 CLI 读取 runtime pin，预热官方 Python bridge。dev / dev:ui / test:ui 均使用它。Go 工具仍在启动前构建，无 Python 工具安装步骤。

故障测试只替换失败响应；成功的 storage、tools 路由仍使用真正的 Anna harness。没有向 UI 注入成功总结，也没有用本地规则代替 sampling。

## 本机验证

- 最终以默认 Chromium Headless Shell 配置执行 `npm run check:all`：完整通过，退出码 0。
- 前端构建、strict manifest 校验：通过。
- 5 项基础测试、源码构建的完整双向协议、官方 CLI mock sampling：通过。
- `npm run test:ui`：三组 UI 场景和全局 llm 禁止调用断言通过；主链路记录 8 次 storage.get、4 次 storage.set、1 次 tools.invoke。
- 新增故障/恢复和文本安全用例全部通过；无需修改业务代码。
- `npm run package:executa`、`npm run verify:archive -- --require-native`：Windows 通过，测试对象是最终 ZIP 解压出的程序。
- actionlint v1.7.12：三份 workflow 校验通过。
- JavaScript 语法检查和 `git diff --check`：通过。

首次 `check:all` 在 UI 阶段因本机未安装匹配的 Chromium 而停止。安装 Playwright 对应浏览器后，先以 `BROWSER_CHANNEL=chromium` 完成 UI 验收，再清除该覆盖设置，用默认 Chromium Headless Shell 完整执行 `npm run check:all`，全部通过。CI 会自行安装浏览器和 Linux 系统依赖。上述本机结果不是对尚未运行的新云端 CI 的成功声明。

源码与 UI 依赖版本未更换，未修改存储格式、tool identity、Go Tool 功能或既有 v0.1.0 Release。macOS 解包后的原生协议测试由相应 Release runner 执行，不能在 Windows 本机冒称完成。

## 复现

```sh
npm ci
npx playwright install chromium
npm run check:all
npm run package:executa
npm run verify:archive -- --require-native
```

Linux 如缺浏览器系统依赖，使用 `npx playwright install --with-deps chromium`。需要 uv/uvx 和 Go；首次环境准备可能下载依赖。

## 证据

本机测试产物位于 `test-results/`：

- `ui-rpc.jsonl`：按 main / storage-failure / safe-text 区分场景；仅包含合成测试数据和调用，不含会话 token。
- `ui-preview.png`、`ui-desktop.png`、`ui-mobile.png`：未改变 harness 窗口高度的真实截图。
- `archive-windows-x86_64/protocol.jsonl`：最终 archive 解压程序的真实双向帧。
- `sampling-cli.json` / `sampling-cli.stderr.log`：独立官方 runner 的结果与采样关联事件。
- `upgrade-check.log`：本次默认 headless 配置下完整 `check:all` 的实际输出。

这些运行输出不提交进源码仓库；CI 会通过 Actions artifacts 保留本次运行证据。历史 UI 设计验收见 `UI-REVIEW.md`，历史发布验收见 `evidence/verification.md`。
