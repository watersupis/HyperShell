# 开发环境与启动

## 环境要求

| 工具 | 版本/说明 |
| --- | --- |
| Node.js | 22 或更高版本 |
| pnpm | 10.8 或更高版本 |
| Git | 克隆和版本管理 |
| Windows 原生工具 | Python 3、Visual Studio Build Tools 2022 C++ 桌面开发组件 |

## 安装并运行

```powershell
git clone https://github.com/watersupis/HyperShell.git HyperShell
cd HyperShell
pnpm install
pnpm --filter @hypershell/desktop dev
```

桌面开发命令会构建 UI 和 Electron 主进程、同步 renderer 资源后启动 Electron。它不是单独运行的 Vite HMR 开发服务器；代码修改后需重启构建流程验证。

若需要单独启动 UI 浏览器开发服务器，可在另一个终端运行 `pnpm --filter @hypershell/ui dev`；只有设置 `SSHTERM_RENDERER_URL` 指向该服务器时，Electron 才会加载这个 renderer。

不要只运行 `electron .` 验证源码更改，因为它可能读取旧的 `apps/desktop/dist/` 产物。

## 原生模块

遇到 Electron 与 Node ABI 不匹配时，针对当前 Electron 重建原生模块：

```powershell
pnpm --filter @hypershell/desktop rebuild:native
pnpm --filter @hypershell/desktop dev
```

不要把面向普通 Node.js 编译的原生模块产物误认为 Electron 可加载的二进制。

## 隔离开发数据

运行 Electron E2E 时使用临时数据目录，避免测试读写日常主机和设置。应用支持用 `HYPERSHELL_DATA_DIR` 指定独立数据目录：

```powershell
$env:HYPERSHELL_DATA_DIR = Join-Path $env:TEMP 'hypershell-dev-data'
pnpm --filter @hypershell/desktop dev
```

关闭应用后再清理该临时目录。`SSHTERM_RENDERER_URL` 受开发/打包安全校验约束，不应在生产环境指向任意网页。

## Workspace 代码归属

| 内容 | 目录 |
| --- | --- |
| Electron 生命周期、窗口、平台 API、插件运行时 | `apps/desktop/` |
| React Workbench 和通用布局 | `apps/ui/` |
| 内置/外置插件功能 | `plugins/builtin/`、`plugins/external/` |
| 插件契约与 SDK | `packages/plugin-api/`、`packages/plugin-sdk/` |
| 会话、跨进程 schema、数据库基础设施 | `packages/session-core/`、`packages/shared/`、`packages/db/` |

## 常用验证

```powershell
pnpm build
pnpm lint
pnpm test
pnpm --filter @hypershell/ui run test:e2e
pnpm --filter @hypershell/desktop run test:e2e
```

先运行改动所属 workspace 的定向测试，再扩展到全仓。Electron E2E 需要先构建桌面应用，并针对 Electron 重建原生模块。UI 端到端测试使用 Browser 环境，不能替代真实 Electron/preload/IPC 验证。

具体插件边界见[插件开发与 API 指南](./plugins/)。
