# Host Monitor / 主机监控

English | [简体中文](#简体中文)

An installable external plugin for monitoring connected SSH sessions. The
activity-bar entry opens multi-host monitoring; the terminal toolbar opens a
host-scoped view for the current SSH session.

## Current Features

- Add and remove connected hosts in the multi-host view.
- View CPU, memory, disk, and network metrics.
- Inspect disk and network views and adjust the refresh interval.
- Pause and resume polling.

The plugin reads live host/session data through the permission-checked host API.
It does not provide persistent historical charts.

## Build, Package, and Run

From the repository root:

```powershell
pnpm --filter @hypershell/plugin-host-monitor build
pnpm plugin:pack -- plugins/external/host-monitor
pnpm --filter @hypershell/desktop dev
```

Install the generated `.packages/com.hypershell.host-monitor-<version>.hspkg`
from **Settings > Plugins**, grant the requested `sessions.read` and
`monitoring.read` permissions, then open Host Monitor. Rebuild, repackage, and
install/update the package after source changes.

Source of truth: `plugin.json`, `src/`, and the [plugin catalog](../../../wiki/guide/user/features.md).

---

## 简体中文

用于监控已连接 SSH 会话的可安装外置插件。活动栏入口打开多主机监控；终端
工具栏入口打开当前 SSH 会话对应的单主机视图。

### 当前功能

- 在多主机视图添加或移除已连接主机。
- 查看 CPU、内存、磁盘和网络指标。
- 查看磁盘与网络视图、调整刷新间隔。
- 暂停和恢复采样。

插件通过经过权限校验的宿主 API 读取实时主机/会话数据；当前不提供持久化历史趋势图。

### 构建、打包和运行

在仓库根目录运行：

```powershell
pnpm --filter @hypershell/plugin-host-monitor build
pnpm plugin:pack -- plugins/external/host-monitor
pnpm --filter @hypershell/desktop dev
```

在“设置 > 插件”安装生成的
`.packages/com.hypershell.host-monitor-<version>.hspkg`，授予所需的
`sessions.read` 和 `monitoring.read` 权限，再打开“主机监控”。修改源码后需重新
构建、打包并安装/更新插件。

功能事实以 `plugin.json`、`src/` 和[插件目录](../../../wiki/guide/user/features.md)为准。
