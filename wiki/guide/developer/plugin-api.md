# 插件 API 与插槽参考

外置插件的契约当前由 `packages/plugin-api/` 定义。页面概览帮助理解边界；schema 和 runtime 源码才是最终准据。

## Manifest 核心字段

| 字段 | 约定 |
| --- | --- |
| `formatVersion` | 当前为 `1` |
| `id` | 稳定、全局唯一的反向域名风格标识 |
| `version` | `major.minor.patch`；每次可安装更新递增 |
| `apiVersion` | 插件依赖的宿主 API 契约版本，不随插件小版本更新 |
| `entrypoint` | 插件包内的相对路径，通常为 `dist/index.js` |
| `permissions` | 仅列出业务需要且 API 已支持的最小权限 |
| `contributions` | `commands`、`views`、`settings` 等注册贡献类型 |
| `ui.slots` | 实际使用的宿主入口和视图槽位，需与运行时注册一致 |

未知字段、重复权限和不安全入口路径会被 schema 拒绝。声明权限并不代表已获授权；调用时仍由宿主校验。

## 当前权限标识

权限枚举定义于 `packages/plugin-api/src/manifest.ts`。当前 schema 包含：

- 命令片段：`snippets.read`、`snippets.write`、`snippets.execute`
- 命令历史：`command-history.read`、`command-history.clear`
- 会话：`sessions.read`、`sessions.broadcast`
- 主机与监控：`hosts.read`、`monitoring.read`、`monitoring.history.delete`
- 诊断、进程和 Docker：`diagnostics.local`、`processes.read`、`processes.terminate`、`docker.manage`
- 插件存储：`storage.read`、`storage.write`

权限名在 schema 存在不等于对应 RPC 已完整实现或某插件可用；对照宿主授权实现、插件 manifest 和功能目录核验。

## UI 入口与视图

| 标识 | 语义 |
| --- | --- |
| `sidebar.navigation` | manifest 触发宿主生成的侧栏/活动栏启动入口，不是可注册视图 |
| `terminal.toolbar` | manifest 触发的终端工具栏启动入口，通常传递当前 host 上下文；不是权限 |
| `workspace.tab` | 中央工作区标签视图 |
| `workspace.secondarySidebar` | 右侧辅助区域视图 |
| `workspace.panel` | 底部面板视图 |
| `workspace.header` | 在符合宿主条件时挂载的头部附属视图 |
| `workspace.toolbar` | 插件命令工具栏贡献；不是 `registerView()` 的 view slot |

`registerView()` 接受宿主支持的视图槽位；命令通过 `registerCommand()` 注册。`ui.hostContextMenu` 也是宿主启动集成点，不是 DOM 插槽。manifest 入口、实际注册和视图槽位需一致。

## 生命周期与验收

`activate(context)` 注册的视图/命令及其监听器、定时器、未完成任务都应可清理。视图关闭、停用、卸载和权限撤销都要验证资源释放。宿主提供的 `context.host` API 应返回可预期错误；拒绝权限不得自动回退到直接 IPC、文件系统或命令执行。

参考：`packages/plugin-api/src/manifest.ts`、`runtime.ts`，以及插件开发指南中的快速开始。
