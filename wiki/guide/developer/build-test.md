# 构建、测试与打包

## 常用验证

```powershell
pnpm build
pnpm lint
pnpm test
pnpm --filter @hypershell/ui run test:e2e
pnpm --filter @hypershell/desktop run test:e2e
```

Browser E2E 验证渲染器流程；Electron E2E 使用真实 preload、IPC、原生模块和窗口。两者覆盖边界不同，不能互相替代。

窄范围改动先运行所属 workspace 的测试。UI 和 Desktop 各有 Vitest 配置；shared、session-core 和 db 测试从仓库根目录按 Vitest 项目运行：

```powershell
pnpm --filter @hypershell/ui exec vitest run
pnpm --filter @hypershell/desktop exec vitest run
pnpm exec vitest run --project @hypershell/shared
pnpm exec vitest run --project @hypershell/session-core
pnpm exec vitest run --project @hypershell/db
```

指定单个 UI 测试文件可运行 `pnpm --filter @hypershell/ui exec vitest run tests/unit/<test-file>`。Electron E2E 应使用隔离的 `HYPERSHELL_DATA_DIR`，见[开发环境](./getting-started)。

测试放在所属模块的 `tests/unit/` 或 `tests/e2e/`，内置插件测试归对应插件。Browser E2E 没有真实 preload，不能证明 IPC 或原生模块行为；Electron E2E 应验证这些边界。插件变更还要覆盖启停清理、权限拒绝、非法输入和视图关闭。

## Electron E2E 与 ABI

Electron E2E 前先构建应用并针对 Electron 重建原生依赖：

```powershell
pnpm --filter @hypershell/desktop run build:bundle
pnpm --filter @hypershell/desktop rebuild:native
pnpm --filter @hypershell/desktop run test:e2e
```

如果随后普通 Node 测试无法加载 `better-sqlite3`，按当前测试运行时重建 Node ABI 版本。ABI 加载错误应与业务断言失败分开诊断。

## 插件打包

```powershell
pnpm --filter @hypershell/plugin-my-tool build
pnpm plugin:pack -- plugins/external/my-tool
```

`.hspkg` 输出到插件目录的 `.packages/`。在桌面应用中安装该包，核对授权、视图注册、错误输入和卸载清理；仅 build 成功不代表安装运行通过。

## 桌面应用发布构建

```powershell
pnpm release:windows:unsigned
pnpm release:mac:unsigned
pnpm release:linux:unsigned
```

准确工件和平台前置条件以当前 `package.json`、Electron Builder 配置和发布脚本为准。签名密钥、口令和令牌不得提交到仓库。正式发布还需运行发布校验和平台冒烟检查。

Windows 发布使用 `CSC_LINK` 和 `CSC_KEY_PASSWORD` 配置签名，运行 `pnpm release:manifest` 生成校验清单，并只发布清单列出的文件。

### Windows 发布冒烟检查

在干净的 Windows 10/11 环境对打包版本逐项记录通过/失败，并附截图、短录屏或日志证据：

- 启动工作台并确认系统托盘图标出现；`Ctrl+K` 打开快速连接。
- 打开 SSH 会话；检查 `vim`、`tmux`、`htop` 显示及窗口调整时终端尺寸变化。
- 按发布范围验证密码、密钥、SSH agent 和 `~/.ssh/config` 导入认证。
- 若串口在发布范围内，连接真实 COM 设备并核对本地回显及 DTR/RTS。
- 打开多个会话，验证断线状态更新及重启后的可恢复会话提示。
- 若广播功能在发布范围内，确认警告常驻，并验证输入仅发送到选定目标。

发布记录至少包含日期、测试者、版本、工件名、签名状态、各项结果、阻塞问题、审批人和证据。任何失败项均需明确记录，不能以构建成功代替产品验收。
