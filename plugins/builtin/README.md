# Built-in Plugins / 内置插件

English | [简体中文](#简体中文)

Built-in plugins ship with HyperShell and use the same lifecycle and Workbench
contribution model as external plugins. They are source modules, not separately
installed `.hspkg` files. The host owns generic platform services, lifecycle,
permission enforcement, and UI slots; each plugin owns its feature behavior.

## Current Modules

| Directory | Responsibility |
| --- | --- |
| `ssh/` | Core host management, SSH connection workflows, and terminal integration. |
| `sftp/` | SFTP browser, transfers, synchronization, bookmarks, and remote editing. |
| `local-terminal/` | Local shell profiles, local sessions, and WSL integration. |
| `serial/` | Serial profiles, connections, and terminal controls. |
| `tunnels/` | SSH port-forwarding workflows. |
| `session-recording/` | Terminal text/session recording, playback, and recording preferences. |
| `quick-command-center/` | Static command knowledge and quick-command UI. |

Check the [Wiki feature catalog](../../wiki/guide/user/features.md) and each plugin's `plugin.json`/source for
the current enablement defaults and implemented behavior.

## Ownership and Contribution Rules

- Keep feature UI, state, domain logic, tests, settings, and lifecycle cleanup
  inside the owning plugin directory.
- Put genuinely shared OS, session, persistence, IPC, and security mechanisms
  in generic host/platform packages and expose them through typed contracts.
- Do not add host branches keyed to a plugin ID. Declare UI placement and
  contributions through plugin metadata and registration APIs.
- Do not import another plugin's private source. Share only through an explicit
  public package/API with a clear owner.
- Register listeners, IPC handlers, commands, views, timers, and subscriptions
  with cleanup tied to plugin deactivation.
- Keep permissions minimal and validate user-controlled data at process
  boundaries. Never treat an ID or UI placement as authorization.
- Add tests beside the owning plugin under `tests/unit/` or `tests/e2e/`; update
  the plugin catalog when user-visible capability or status changes.

## Build and Verify

From the repository root:

```powershell
pnpm --filter @hypershell/plugin-<name> build
pnpm --filter @hypershell/ui typecheck
pnpm --filter @hypershell/ui exec vitest run <focused-test-path>
pnpm --filter @hypershell/desktop dev
```

Built-in plugins are bundled by the app build. Do not use `pnpm plugin:pack` for
them; that command is for installable external plugins. See `CLAUDE.md` for
contributor workflow and the Wiki [plugin guide](../../wiki/guide/developer/plugins/)
and [plugin API reference](../../wiki/guide/developer/plugin-api) for contracts.

---

## 简体中文

内置插件随 HyperShell 一起发布，和外置插件使用相同的生命周期与 Workbench
贡献模型。它们是源码模块，不单独生成或安装 `.hspkg`。宿主负责通用平台能力、
生命周期、权限校验和 UI 插槽；每个插件负责自己的功能行为。

### 当前模块

| 目录 | 职责 |
| --- | --- |
| `ssh/` | 核心主机管理、SSH 连接流程和终端集成。 |
| `sftp/` | SFTP 浏览器、传输、同步、书签和远程编辑。 |
| `local-terminal/` | 本地 shell 配置、本地会话和 WSL 集成。 |
| `serial/` | 串口配置、连接和终端控制。 |
| `tunnels/` | SSH 端口转发流程。 |
| `session-recording/` | 终端文本/会话录制、回放和录制设置。 |
| `quick-command-center/` | 静态命令知识库和快捷命令界面。 |

启用默认值和当前已实现功能，以 [Wiki 功能目录](../../wiki/guide/user/features.md)、各插件的
`plugin.json` 和源码为准。

### 代码归属与贡献约定

- 功能 UI、状态、领域逻辑、测试、设置和生命周期清理放在所属插件目录。
- 确实由多个功能共享的操作系统、会话、持久化、IPC 和安全机制，放入通用
  宿主/平台模块，并通过类型化契约暴露。
- 不得在宿主中按插件 ID 分支；通过插件元数据和注册 API 声明 UI 位置与贡献。
- 不导入其他插件的私有源码；共享能力必须经过有明确所有者的公开 package/API。
- 监听器、IPC handler、命令、视图、定时器和订阅都要注册清理逻辑，并随插件
  停用释放。
- 权限遵循最小化原则，在进程边界校验用户输入；ID 和 UI 插槽不能代替授权。
- 测试归所属插件，放在 `tests/unit/` 或 `tests/e2e/`；用户可见能力或状态改变时
  同步更新插件目录。

### 构建与验证

在仓库根目录运行：

```powershell
pnpm --filter @hypershell/plugin-<name> build
pnpm --filter @hypershell/ui typecheck
pnpm --filter @hypershell/ui exec vitest run <focused-test-path>
pnpm --filter @hypershell/desktop dev
```

内置插件由应用构建流程打包。不要对内置插件运行 `pnpm plugin:pack`；该命令
用于生成可安装的外置插件包。贡献工作流见 `CLAUDE.md`，插件 API 和 UI 契约见
[外置插件指南](../../wiki/guide/developer/plugins/)和[插件 API 参考](../../wiki/guide/developer/plugin-api)。
