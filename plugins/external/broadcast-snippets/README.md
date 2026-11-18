# Terminal Tools / 终端工具

English | [简体中文](#简体中文)

An installable external plugin that combines terminal input broadcast with
reusable command snippets. Its manifest ID remains
`com.hypershell.quick-command-center` for compatibility.

## Current Features

- Enable/disable broadcast and target selected terminal sessions.
- Create, edit, search, and delete reusable command snippets.
- Expand named `${parameter}` placeholders before sending a snippet.
- Persist snippet data through the plugin-scoped storage API.

Broadcast sends text to selected active sessions. Review the target sessions
before enabling it or executing a snippet.

## Build, Package, and Test

From the repository root:

```powershell
pnpm --filter @hypershell/plugin-quick-command-center build
pnpm --filter @hypershell/plugin-quick-command-center test
pnpm plugin:pack -- plugins/external/broadcast-snippets
pnpm --filter @hypershell/desktop dev
```

Install the generated `.hspkg` from **Settings > Plugins**, grant the declared
storage/session permissions, restart if requested, and open Terminal Tools from
the workspace toolbar. Source changes require repackaging and reinstalling.

---

## 简体中文

可安装外置插件，整合终端输入广播和可复用快捷命令。manifest ID 为兼容性继续使用
`com.hypershell.quick-command-center`。

### 当前功能

- 开启/关闭广播并选择目标终端会话。
- 新建、编辑、搜索和删除快捷命令。
- 发送前展开命名参数占位符 `${parameter}`。
- 通过插件专属存储 API 保存命令片段。

广播会向选中的活动会话发送文本。开启广播或执行命令片段前，请核对目标会话。

### 构建、打包和运行

在仓库根目录运行：

```powershell
pnpm --filter @hypershell/plugin-quick-command-center build
pnpm --filter @hypershell/plugin-quick-command-center test
pnpm plugin:pack -- plugins/external/broadcast-snippets
pnpm --filter @hypershell/desktop dev
```

在“设置 > 插件”安装生成的 `.hspkg`，授予清单中声明的存储/会话权限，按提示重启，
然后从工作区工具栏打开“终端工具”。修改源码后需重新打包并安装。
