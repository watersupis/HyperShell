# 外置插件开发

HyperShell 外置插件以 `.hspkg` 安装，通过 `@hypershell/plugin-api` 注册视图/命令并请求受控宿主能力。它不是任意 Node.js 插件，也不在独立 OS 进程中运行。

## 快速开始

1. 复制 `plugins/templates/external-plugin/` 到 `plugins/external/<plugin-folder>/`。
2. 设置唯一 workspace 包名和稳定反向域名 manifest ID。
3. 在 `plugin.json` 声明版本、API 版本、入口、最小权限、贡献类型和 UI 槽位。
4. 在 `src/index.ts` 实现 `plugin.activate(context)`，使用注册 API 和类型化 `context.host`。
5. 为每个注册项、事件监听、timer 和异步资源提供 deactivation cleanup。

```powershell
pnpm install
pnpm --filter @hypershell/plugin-my-tool build
pnpm plugin:pack -- plugins/external/my-tool
pnpm --filter @hypershell/desktop dev
```

安装生成的 `.hspkg` 后，在“设置 > 插件”审阅权限并验证实际视图。修改源码不会热更新已安装包，需要重新构建、打包并安装/更新。

## 插件实现与验收

在 `plugin.json` 声明稳定 ID、版本、API 版本、入口、最小权限和贡献项；在 `src/index.ts` 实现 `activate(context)`，使用公开注册 API 与类型化 `context.host`。每个命令、视图、事件监听器、timer 和异步资源都应在停用时清理。`plugin.json` 的 `version` 标识可安装插件更新；`apiVersion` 标识宿主 API 契约，不随每次插件发布递增。

打包后的插件需要在桌面应用中安装验证，至少检查权限拒绝、视图关闭、卸载清理和非法输入：

```powershell
pnpm --filter @hypershell/plugin-my-tool build
pnpm plugin:pack -- plugins/external/my-tool
```

安装校验通过不代表插件业务已实现；SHA-256 清单用于完整性检查，不等于发布者数字签名。插件契约以 [API 与插槽参考](../plugin-api) 及 `packages/plugin-api/` 为准。

## 必须遵守的边界

- 不导入 Electron、Node.js、宿主私有源码或其他插件私有源码。
- 不直接访问数据库、任意 IPC、shell、文件系统或不受控网络。
- 只申请最小权限；每次 host API 调用都应正确处理拒绝和错误。
- `sidebar.navigation`、`terminal.toolbar` 是宿主生成的启动入口，不是 `registerView()` 的视图槽位。
- `workspace.tab`、`workspace.secondarySidebar`、`workspace.panel`、`workspace.header` 是可注册视图区域，具体组合受宿主规则限制。
- `plugin.json` 的插件版本用于可安装更新；`apiVersion` 代表宿主 API 契约，不随每次插件发布递增。

打包器会校验 manifest、bundle 包内容并生成 `.hspkg` 和 SHA-256 清单。校验和不等于发布者数字签名。

manifest 字段、权限、生命周期和 UI 槽位见[插件 API 参考](../plugin-api)及 `packages/plugin-api/` 源码。[功能目录](../../user/features)记录已交付的用户可见状态，但不能替代插件自身测试。
