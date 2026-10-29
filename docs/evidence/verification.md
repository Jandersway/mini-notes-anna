# 本地验收记录

验证日期：2026-10-29（Asia/Shanghai）。以下均区分已执行检查与远程待执行项。

## 环境

- Windows x86_64，Node.js 24.15.0，Go 1.27.3，uv 0.13.6。
- @anna-ai/cli 0.1.61，@anna-ai/app-runtime 0.26.0，@anna-ai/app-schema 0.30.0。
- 官方 anna-app-runtime-local 0.2.0a30，通过 uv 缓存启动，未修改其源码。
- 真实 Chrome 无头浏览器；UI 测试走官方 dashboard + iframe + SDK + Python bridge。

## 已执行且通过

| 检查 | 实际结果 |
| --- | --- |
| TypeScript + Vite build | 通过，生成 bundle/index.html 与 CSS/JS 资源 |
| anna-app validate --strict | 通过；工具 identity 交叉检查通过 |
| 笔记/工具逻辑测试 | 5 项通过 |
| 双向 JSON-RPC 测试 | v2 协商、describe、invoke、sampling 请求/响应、并发关联、错误透传、超时、EOF、stdout 协议帧验证通过 |
| anna-app executa dev --mock-sampling | fixture 返回文本经真正的 sampling reverse RPC 返回 Tool；请求/响应日志均存在 |
| anna-app dev --no-llm UI | 创建三条，删除第二条，刷新列表及 iframe 后仍读到两条；8 次 storage.get、4 次 storage.set、1 次 tools.invoke |
| UI Summarize | 实际得到 [-32603] harness started with --no-llm，未伪造 summary |
| Windows archive | SHA-256、根 manifest、entrypoint、PE x86_64 头验证；解包后二进制 describe 实际通过 |
| 两个 macOS archive | 交叉编译成功；SHA-256、Mach-O 架构、根 manifest、entrypoint、tar 0755 模式通过 |
| 外部 tar 工具 | 可读取生成的 tar.gz / zip，macOS entrypoint 显示可执行权限 |
| Release 配置静态检查 | YAML 可解析；三个 runner 和 v0.1.0 版本一致性检查通过 |
| 干净源码复现 | 将 41 个源码/文档文件复制到无 node_modules、bundle、binary、cache 的新目录；npm ci 后 npm run check 全部通过 |

## 证据文件

- [UI 预览](ui-preview.png)
- [UI Host API 调用](ui-rpc.jsonl)：仅提取 storage/tools 记录，无 session token。
- [双向协议 transcript](protocol.jsonl)：host-to-tool / tool-to-host 帧，包含 sampling/createMessage。
- [CLI sampling 返回值](sampling-cli.json)
- [CLI sampling 日志](sampling-cli.stderr.log)：sampling.request / sampling.response 关联 ID。

这些文件包含专用测试笔记与 mock host 响应，不代表使用了真实模型。实时复跑结果写入被 gitignore 的 test-results/，本目录保留交付时快照。

## 官方 runtime 兼容

实际 UI 测试发现并解决两个差异：UI pool 跳过 initialize，所以本地开发启动器提供显式兼容开关；reverse sampling 经 llm.complete bridge，所以 manifest 声明对应权限。直接发布的 Go binary 默认要求 v2，前端没有直接 llm.complete 调用。详细说明见 README。

## 远程状态

已创建公开仓库：https://github.com/Jandersway/mini-notes-anna 。此记录随首次提交上传；GitHub Actions 原生 macOS/Windows 运行与 Release 结果以仓库 Actions 和 Releases 页面为准。此时尚未将本地 macOS 交叉编译宣称为原生运行测试。
