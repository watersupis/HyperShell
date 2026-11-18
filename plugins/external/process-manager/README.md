# Remote Process Manager / 进程与端口管理

English | [简体中文](#简体中文)

An installable external plugin that opens as a workspace tab scoped to the SSH
host selected from the terminal toolbar or host context menu.

## Current Features

- Inspect remote processes and listening ports.
- Terminate a selected process after confirmation.
- Inspect Docker containers, images, volumes, networks, and Compose workloads.
- Start or stop containers after confirmation.

Remote inspection uses the permission-checked systems host API and the target
session. Docker actions require Docker access on the remote host.

## Build, Package, and Run

From the repository root:

```powershell
pnpm --filter @hypershell/plugin-process-manager build
pnpm plugin:pack -- plugins/external/process-manager
pnpm --filter @hypershell/desktop dev
```

Install `.packages/com.hypershell.process-manager-<version>.hspkg` from
**Settings > Plugins**, grant only the required permissions, then open a remote
SSH session and select the plugin from the terminal toolbar. Rebuild, repackage,
and install/update after source changes.

Source of truth: `plugin.json`, `src/`, and the [plugin catalog](../../../wiki/guide/user/features.md).

---

## 简体中文

可安装外置插件，以工作区页签打开，并关联从终端工具栏或主机上下文菜单选择的 SSH 主机。

### 当前功能

- 查看远程进程和监听端口。
- 确认后终止指定进程。
- 查看 Docker 容器、镜像、卷、网络和 Compose 工作负载。
- 确认后启动或停止容器。

远程检查通过经过权限校验的 systems 宿主 API 和目标会话执行。Docker 操作要求远端
主机具备相应 Docker 访问权限。

### 构建、打包和运行

在仓库根目录运行：

```powershell
pnpm --filter @hypershell/plugin-process-manager build
pnpm plugin:pack -- plugins/external/process-manager
pnpm --filter @hypershell/desktop dev
```

在“设置 > 插件”安装
`.packages/com.hypershell.process-manager-<version>.hspkg` 并仅授予所需权限；打开
远程 SSH 会话后，从终端工具栏选择该插件。修改源码后需重新构建、打包并安装/更新。

功能事实以 `plugin.json`、`src/` 和[插件目录](../../../wiki/guide/user/features.md)为准。
