# 宿主主题与原题要求复核

日期：2026-10-30。

## 本轮改动

Mini Notes 通过官方 SDK 的 `onThemeChange` 读取初始宿主主题并订阅后续变化；宿主处于 system 模式时使用 SDK 给出的实际 light/dark 值。单例连接只注册一次订阅，生命周期与 App iframe 一致。

使用 CSS 语义颜色变量适配背景、笔记卡片、输入、占位符、按钮、焦点、删除确认、成功提示和错误详情，并设置原生控件的 `color-scheme`。主题事件只改变文档属性，不重新挂载应用，不触发 storage 写入。

未修改官方 Harness；record、RPC LOG、iframe 地址、宿主主题和语言控件仍由官方工具提供。原题没有要求多语言，App 仍为中文。主题适配是体验补充，不增加登录、密钥、数据库或其他非必需依赖。

## 实际验收

`npm run check:all` 完整通过：工程化构建、strict manifest、5 项基础测试、完整双向 JSON-RPC 协议、官方 mock sampling，以及独立官方 Harness 内的全部 UI 场景。

新增 host-theme 场景验证：

- 系统深色环境首次加载时，App 获得 dark 主题。
- 点击官方主题按钮后，App 的实际背景色和 color-scheme 随之切换。
- 切换保留未保存草稿、已保存笔记和待确认的删除操作。
- 深色模式下仍通过真实 tools.invoke 得到预期的 --no-llm 错误。
- 官方 Mobile 模式重新挂载后继续使用宿主深色主题，笔记仍存在，且没有横向溢出。

检查了实际 `ui-theme-dark.png` 和 `ui-theme-dark-mobile.png` 截图。截图和 RPC 证据位于 gitignored `test-results/`，只使用独立测试会话及示例数据。

## 与原始 question.md 对照

| 原题项目              | 当前实现与验证                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 创建笔记              | 空白禁止保存，成功后清空输入，内容与稳定添加顺序由模型维护；UI/单元测试通过。                                                |
| 查看、删除            | 列表显示内容和顺序，确认删除后更新列表与 Host storage；失败保留原笔记。                                                      |
| storage / APS KV      | 使用 anna.storage.get/set；在无登录的 legacy in-memory 会话中验收，不承诺外层刷新或重启后的持久化。                          |
| 总结                  | 前端读取同步笔记并调用 anna.tools.invoke；禁止前端直接调用 llm，UI 测试检查该约束。                                          |
| --no-llm UI 路径      | 返回预期禁用模型提示；不在 UI 中注入假成功总结。                                                                             |
| 后端 sampling         | 官方 executa dev --mock-sampling 独立验证，实际 Tool 发起 reverse RPC 并返回 fixture 内容。                                  |
| manifest / 工程化前端 | 源码分层、构建 bundle、统一 tool identity 和 strict validate 均通过。                                                        |
| stdio 协议            | v2 negotiation、describe、反向响应关联、超时/错误、持续读取、EOF 和 stdout 纯净性均通过。                                    |
| 二进制和 Release      | 既有 v0.1.0 已有三平台原生产物；升级后 Windows 解包程序协议已在上一轮验证。本轮只修改 UI 和 UI 测试，不重新发布二进制。      |
| GitHub Actions        | 已有发布工作流和完整 CI；上一提交 21d882c 的云端 CI 成功。本轮主题改动此时只在本地验收，不能沿用旧 CI 结论冒充新提交已通过。 |
| README / 证据         | README 包含构建、验证、UI 调试、mock sampling、协议、打包和发布步骤；本记录补充主题测试。                                    |

外层刷新会建立新的本地会话，可能清空该会话的笔记；查看新版建议在新标签页打开预览，保留原有标签页。主题按钮的实时切换本身不会清空笔记或草稿。
