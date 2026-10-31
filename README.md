# Mini Notes — Anna App

一个在 Anna 本地开发环境中运行的笔记应用，支持创建、查看、删除笔记和生成总结。笔记通过 Anna storage API 保存，总结由本地 Go Executa 通过 sampling 请求生成。

![Mini Notes](docs/ui-review/desktop.jpg)

## 快速开始

需要 Node.js 22+、npm、Go 1.23+、[uv](https://docs.astral.sh/uv/getting-started/installation/)。CI 使用 Node.js 24 和 Go 1.27.3；npm 依赖由 package-lock.json 固定。

```sh
npm ci
npm run build
npm run build:tool
npm run validate
npm run dev:ui
```

打开终端显示的 `http://localhost:5180/`。也可以用 `npm run dev` 一次完成构建和启动。

启动命令使用 `anna-app dev --no-llm`，无需登录 Anna、配置 API key 或数据库。应用运行在 Anna 调试页面的 iframe 中。

启动脚本会准备 Anna CLI 所需的 Python 运行环境，首次下载依赖需要网络。也可用 `npm run prepare:harness` 单独执行环境准备。

## 使用

1. 输入内容并保存：空白输入不可保存；支持 Ctrl / ⌘ + Enter；写入成功后输入清空并恢复焦点。
2. 查看列表：显示内容和稳定的添加顺序。
3. 删除笔记：先显示确认操作，可取消或按 Esc 返回；确认后 storage 写入成功才更新列表，剩余序号不重排，新笔记不复用已删除的序号。
4. 点击“刷新”，或仅刷新 iframe：通过 storage.get 重新读取当前会话的笔记。
5. 点击 **Summarize**：前端读取当前笔记快照并调用 tools.invoke。
6. 切换主题：界面跟随 Anna 的浅色/深色设置，保留笔记和草稿。

`--no-llm` 会关闭模型调用。点击 Summarize 后，应用仍调用 `anna.tools.invoke`，界面显示“当前环境未启用模型”，错误详情为：

```text
[-32603] harness started with --no-llm
```

这条路径用于检查界面与工具的连接。总结结果的返回流程通过下面的独立 sampling 测试检查。

本地笔记保存在 Anna 的 `legacy in-memory runtime_state` 中。刷新整个调试页面或重启服务会创建新会话。

## 后端 sampling 测试

```sh
npm run test:sampling
```

脚本运行 `anna-app executa dev --mock-sampling`，使用 `fixtures/sampling-success.jsonl` 提供采样响应，检查返回的总结与该响应一致，并检查 sampling 请求和回复日志。也可以直接启动交互式测试：

```sh
npx anna-app executa dev --dir executas/notes-summary --mock-sampling fixtures/sampling-success.jsonl --no-agent --no-image --no-upload
```

单次调用示例，适用于 PowerShell 7 与常见 Unix shell：

```sh
npx anna-app executa dev --dir executas/notes-summary --mock-sampling fixtures/sampling-success.jsonl --no-agent --no-image --no-upload --invoke summarize --args '{"notes":[{"order":1,"content":"明天跟客户 follow up"},{"order":2,"content":"修复登录 bug"},{"order":3,"content":"Workshop 内容想法"}]}' --json
```

测试结果写入：

- `test-results/sampling-cli.json`：最终 invoke 结果。
- `test-results/sampling-cli.stderr.log`：`sampling.request`、`sampling.response`，带 invoke_id 与 sampling_id。
- `test-results/protocol.jsonl`：协议测试生成的双向 JSON-RPC 记录，包含 `sampling/createMessage`。

## 手动协议检查

```sh
npm run test:protocol
```

此脚本通过管道逐帧驱动可执行文件，测试 initialize、describe、invoke，动态接收反向请求并回复它实际产生的 ID，同时验证并发请求关联、错误、超时、持续读取与 EOF。可直接用 `node scripts/test-protocol.mjs <binary-path>` 检查另一个本机 binary。

交互协议的关键帧如下（每个 JSON 对象一行）：

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2.0","capabilities":{"sampling":{}}}}
{"jsonrpc":"2.0","id":2,"method":"describe"}
{"jsonrpc":"2.0","id":3,"method":"invoke","params":{"tool":"summarize","arguments":{"notes":[{"order":1,"content":"明天跟进客户"}]},"context":{"invoke_id":"manual-3"}}}
```

收到 Tool 的 `sampling/createMessage` 后，保持 stdin 打开，取该请求的 ID 回送：

```json
{
  "jsonrpc": "2.0",
  "id": "sampling:1",
  "result": {
    "role": "assistant",
    "content": { "type": "text", "text": "明天跟进客户。" },
    "model": "manual-fixture"
  }
}
```

`sampling:1` 是示例值，回复时应匹配收到的 ID。Tool 收到采样回复后，返回原始 `id:3` 的 invoke 结果。

仅检查 describe 时，可以使用单向输入。例如 PowerShell 7：

```powershell
'{"jsonrpc":"2.0","id":1,"method":"describe"}' | & '.\executas\notes-summary\bin\notes-summary.exe'
```

stdout 只含 JSON-RPC 帧（响应与反向请求），日志写 stderr，每帧换行并 flush。进程持续读取直到 EOF 或显式 shutdown。`NOTES_SAMPLING_TIMEOUT_MS` 可缩短测试超时，默认 55 秒；不得超过默认值。

## 实现结构

```text
iframe → AnnaAppRuntime.connect()
       → anna.storage.get/set
       → anna.tools.invoke({tool_id, method:"summarize", args:{notes}})
       → Go Executa invoke
       → reverse sampling/createMessage
       → Anna 返回采样结果
       → Tool 返回 data.summary → Anna 将结果交给界面显示
```

- **App manifest**：声明窗口、构建后 bundle 入口和 Host API 权限。`ui.bundle.entry: index.html` 相对于 CLI 默认 bundle 根目录，实际文件为构建后的 `bundle/index.html`。
- **Tool manifest**：描述 summarize 的 `parameters[]`、`host_capabilities: ["llm.sample"]` 与 runtime。describe 直接返回此 manifest。
- **工具 ID**：`tool-local-notes-summary-12345678` 在 App manifest、executa.json、Tool manifest 中保持一致。前端从 Tool manifest 导入 ID，`npm run validate` 检查这些配置。
- **Storage / APS KV**：`src/anna/storage.ts` 使用 `anna.storage.get/set` 读写 `mini-notes:v1`。Anna storage 是访问接口，APS KV 是其存储后端之一；本地调试使用内存会话。写入在当前窗口中排队执行。
- **Sampling**：Tool 将笔记和总结提示发送给 Anna。单个 stdin 读取循环分发请求与回复，invoke_id 和 sampling ID 用于关联调用；Tool 提取采样结果中的文本返回。
- **二进制包**：根目录 manifest.json 描述入口和权限，bin/ 中放置 Go 可执行文件。`scripts/run-tool.mjs` 用于本地开发时启动该文件。

### 本地 CLI 适配

项目使用 Anna CLI 0.1.61 和 runtime-local 0.2.0a30。

- 此版本的 UI 工具进程池直接发送 invoke。本地启动器通过 `NOTES_ALLOW_LEGACY_HARNESS=1` 接受这一调用方式；独立运行二进制时，sampling 使用 initialize v2 协商。
- UI 工具进程池通过 `llm.complete` 转发 sampling，因此 App manifest 声明 `ui.host_api.llm: ["complete"]`。前端的调用入口为 `anna.tools.invoke`。

## 自动化测试

```sh
npm run check
```

运行构建、严格 manifest 验证、笔记逻辑测试、双向协议测试及 standalone mock sampling 测试。

完整 UI 测试需要 Chromium：

```sh
npx playwright install chromium
npm run test:ui
# 运行全部检查
npm run check:all
```

UI 测试使用独立的 Anna 会话，覆盖四组场景：

1. 创建、删除确认/取消、刷新列表与 iframe、tools.invoke，以及默认窗口和窄屏布局。
2. 深浅主题初始加载与切换，检查草稿、笔记和删除确认状态是否保留。
3. 模拟 storage.set 失败，检查数据保留及恢复后的重试。
4. 将 HTML/script 字符串作为笔记和错误内容，检查其按文本显示。

Linux 使用 `npx playwright install --with-deps chromium` 安装浏览器及系统依赖。

已有 Chrome 时，可在 PowerShell 7 设置 `$env:BROWSER_CHANNEL = 'chrome'` 后运行；也支持 `HARNESS_URL` 指向已启动的本地 harness。默认测试端口为 5189。

查看 `test-results/ui-rpc.jsonl` 中的 `scenario`、`ns` 和 `method`，可以对应到 storage.get/set、tools.invoke 及各测试场景。`storage-failure` 和 `safe-text` 场景通过模拟失败响应检查错误处理。失败时保存 `ui-failure.txt` 和可用的 iframe 截图。Anna 调试页面右侧的 RPC LOG 和 record 按钮也可用于查看和录制调用。

笔记逻辑测试覆盖空输入、添加顺序、写入队列、存储错误恢复、损坏数据处理和总结结果传递。

## 二进制打包

自动识别本机 OS / CPU 并生成当前机器可运行的 archive：

```sh
npm run package:executa
npm run verify:archive -- --require-native
```

也可交叉编译：

```sh
npm run package:executa -- --platform darwin-arm64
npm run package:executa -- --platform darwin-x86_64
npm run package:executa -- --platform windows-x86_64
node scripts/collect-release.mjs
```

Go 的 amd64 对应 Anna 的 x86_64。Go 未加入 PATH 时，可通过 `GO_BINARY` 指定可执行文件路径。

```text
dist/
  notes-summary-darwin-arm64.tar.gz
  notes-summary-darwin-x86_64.tar.gz
  notes-summary-windows-x86_64.zip
  *.sha256
  SHA256SUMS.txt
```

每个 archive 的根目录都是：

```text
manifest.json
bin/notes-summary       # macOS：tar 内模式 0755
# 或 bin/notes-summary.exe（Windows）
```

验证脚本检查 SHA-256、manifest、入口路径、二进制架构及权限。在对应平台上还会解包并运行 describe 和完整协议测试，结果写入 `test-results/archive-<platform>/`；交叉编译产物执行结构与架构检查。

## GitHub Actions 发布

[Actions](https://github.com/Jandersway/mini-notes-anna/actions) · [Release 下载](https://github.com/Jandersway/mini-notes-anna/releases)

日常 CI 在 push / PR 时执行 `npm run check:all`。发布流程先执行同一组检查，再构建三个平台的二进制包。测试日志和截图保存在 Actions artifacts 中。

`.github/workflows/release.yml` 支持：

- 推送版本 tag，例如 `v0.1.0`。
- Actions → Build and release Executa → Run workflow，输入已存在的版本 tag。

发布前更新 package.json、Tool manifest 和 executa.json 中的版本号，提交后创建对应的 `v<版本号>` tag。手动触发时同样构建指定 tag 的代码。

工作流使用 macos-15（ARM64）、macos-15-intel（x86_64）、windows-2025（x86_64）分别构建、打包并运行解包后的协议测试。三个任务完成后，通过 Actions artifacts 汇总产物，上传三个压缩包和 SHA256SUMS.txt 到同一个 GitHub Release，上传完成后公开发布。

发布使用 `GITHUB_TOKEN` 的 `contents: write` 权限。已发布版本保持不变，后续发布使用新版本号。

## 项目结构

```text
src/App.tsx                 UI 与异步操作状态
src/anna/runtime.ts         Anna Runtime 连接
src/anna/storage.ts         Host API 笔记仓储
src/anna/tools.ts           Executa 调用
src/notes/model.ts          笔记数据校验与顺序
executas/notes-summary/     Go 源码、嵌入 manifest、本地发现配置
fixtures/                   sampling 测试响应
scripts/                    构建、协议测试、CLI 测试、UI 测试、打包与校验
tests/                      笔记与调用逻辑测试
docs/                       截图与测试记录
.github/workflows/          三平台 GitHub Release workflow
bundle/                     前端构建产物（gitignore）
dist/                       二进制 archive（gitignore）
```

## 参考资料

- [本地开发](https://staging.anna.partners/developers/apps/local-dev.md)
- [App UI SDK](https://staging.anna.partners/developers/apps/app-ui-sdk.md)
- [Storage Host API](https://staging.anna.partners/developers/reference/host-api-storage.md)
- [Tools Host API](https://staging.anna.partners/developers/reference/host-api-tools.md)
- [Executa 协议](https://staging.anna.partners/developers/tools/executa-protocol.md)
- [Sampling](https://staging.anna.partners/developers/tools/executa-sampling.md)
- [Binary Distribution](https://staging.anna.partners/developers/tools/executa-binary.md)
- [参考示例](https://github.com/whtcjdtc2007/anna-executa-examples)
