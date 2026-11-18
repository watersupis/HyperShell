# IPC 与进程边界

本文是阅读指南，不复制易过期的通道清单。实际通道常量、请求/响应 schema 和 preload 暴露的方法分别以当前源码为准。

## 权威来源

| 契约 | 位置 |
| --- | --- |
| 通道名称及领域分组 | `packages/shared/src/ipc/channels.ts` |
| 请求与响应 schema | `packages/shared/src/ipc/schemas.ts`、`packages/shared/src/ipc/sftpSchemas.ts` |
| 共享类型与领域契约 | `packages/shared/src/ipc/contracts.ts` 及相邻模块 |
| preload 公共 API | `apps/desktop/src/preload/` |
| 主进程 handler 注册 | `apps/desktop/src/main/ipc/`、所属插件的主进程适配器 |
| IPC 测试 | 所属 workspace 的 `tests/`、`src/` 测试文件和 Electron E2E |

通道按会话、主机、设置、文件系统、插件等领域分组。新增领域时先检查现有分组和调用所有者，不要依靠本页推断未列出的能力；还需检查 preload API 和 handler 是否一致。

## 调用路径

Renderer 通过窄化的 preload API 发起请求；preload 校验边界数据并调用主进程 handler，主进程再次验证输入并执行所属能力。主进程向 renderer 推送的事件也必须经共享 schema 约束。界面不得直接调用 `ipcRenderer`、自行拼接任意通道，或把通用 invoke 暴露成插件能力。

一个 IPC 变更通常需要同步更新：

1. `channels.ts` 中的常量和共享请求/响应 schema。
2. preload 的显式方法及对应类型。
3. 功能所有者注册的 handler、授权和生命周期清理。
4. 双向验证测试；跨 Electron 边界的行为用 Electron E2E 验证。

## 插件边界

插件 RPC 通过宿主插件运行时按 manifest 权限授权，并在每次调用时校验输入和能力。插件视图使用沙箱消息，不获得任意 IPC 通道。UI 插槽、启动上下文中的 `hostId` 和插件自报的权限都不构成授权。新增 API 时同时定义拒绝行为、错误语义和停用/卸载后的资源清理。

## 验证

运行变更所属 workspace 的测试；涉及真实 preload 或主进程桥接时运行 Electron E2E。Browser E2E 不具备真实 preload，不能单独证明 IPC 契约。可从 [构建与测试指南](./build-test) 查看当前命令。
