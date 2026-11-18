# External Plugin Template / 外置插件模板

English | [简体中文](#简体中文)

Use this template to create an installable HyperShell external plugin. It is a
workspace template, not a standalone published SDK: the plugin API and packer
are currently provided by the HyperShell repository.

## Requirements

- Use the Node.js and pnpm versions listed in the root `package.json` and
  `README.md`.
- Develop inside the HyperShell workspace so `@hypershell/plugin-api` resolves
  from the workspace.
- External plugin UI runs in a sandboxed browser iframe. Do not use Node.js,
  Electron, host source imports, direct database access, arbitrary IPC, or
  runtime-loaded dependencies.

## Create a Plugin

1. Copy this folder to `plugins/external/<plugin-folder>`.
2. Give `package.json` a unique workspace name such as
   `@hypershell/plugin-my-tool`.
3. Give `plugin.json` a stable reverse-domain ID owned by you or your
   organization. Set a SemVer plugin version, `apiVersion`, entrypoint,
   description, minimum permissions, contributions, and UI slots.
4. Implement `plugin.activate(context)` in `src/index.ts`.
5. Register commands and views using `context.registrations`; call every
   registration's `dispose()` from the plugin's returned `dispose()` method.
6. Use only typed `context.host` capabilities. A host ID or launch context is
   context, not permission.

Do not add plugin-ID conditionals to HyperShell core. Put feature behavior,
state, UI, tests, and documentation in the plugin. If a missing host capability
is needed, propose a generic, schema-validated, permission-gated API first.

## Build and Package

Run these commands from the repository root:

```powershell
pnpm install
pnpm --filter @hypershell/plugin-my-tool build
pnpm plugin:pack -- plugins/external/my-tool
```

The pack command validates `plugin.json`, builds the workspace package, bundles
the browser entrypoint, and writes a versioned `.hspkg` under the plugin's
`.packages/` directory. The package contains the manifest, bundled entrypoint,
included `dist/` and `assets/` files, and `checksums.sha256`. The generated
`.packages/` directory is ignored by Git; publish the `.hspkg` as a release
artifact, not as source.

## Run and Verify

1. Build and start the app with `pnpm --filter @hypershell/desktop dev`.
2. In HyperShell, open **Settings > Plugins** and install the generated `.hspkg`.
3. Review and grant only the requested permissions. Restart if the app asks.
4. Open the declared view/command entry and verify its behavior.
5. Test denied permissions, malformed input, repeated activation, closing the
   view, disabling/uninstalling, and cleanup of timers/listeners/resources.

External plugins are installed packages; editing `src/` does not hot-reload the
installed copy. Rebuild, package, and install/update the new `.hspkg` to test
changes.

## Contribution Contract

- Keep manifest `ui.slots` aligned with the views and entry points actually
  registered. A UI slot is not itself an authorization grant.
- Request the least privilege. Validate all plugin inputs in the host and fail
  closed when permissions are missing.
- Do not expose arbitrary shell execution, filesystem access, network access,
  process creation, or generic IPC as a plugin shortcut.
- Clean up every registration and asynchronous resource when deactivated.
- Include focused tests, a bilingual README, truthful feature status, and
  third-party license notices for bundled code/data.
- Bump `plugin.json`'s `version` for an installable update. Keep `apiVersion`
  tied to the plugin API contract, not the plugin release number.

See the [external plugin guide](../../../wiki/guide/developer/plugins/) for the
workflow and [plugin API reference](../../../wiki/guide/developer/plugin-api)
for supported UI placements.

---

## 简体中文

使用本模板创建可安装的 HyperShell 外置插件。它是仓库内的 workspace
模板，不是独立发布的 SDK；当前插件 API 和打包器由 HyperShell 仓库提供。

### 环境要求

- 使用根目录 `package.json` 和 `README.md` 标注的 Node.js、pnpm 版本。
- 在 HyperShell workspace 中开发，以便解析 workspace 包
  `@hypershell/plugin-api`。
- 外置插件 UI 运行在沙箱 iframe 中。不得使用 Node.js、Electron、导入宿主
  私有源码、直接访问数据库、任意 IPC 或运行时加载的依赖。

### 创建插件

1. 将本目录复制到 `plugins/external/<插件目录>`。
2. 为 `package.json` 设置唯一 workspace 包名，例如
   `@hypershell/plugin-my-tool`。
3. 为 `plugin.json` 设置由你或所属组织持有的稳定反向域名 ID；填写语义化
   插件版本、`apiVersion`、入口、说明、最小权限、贡献类型和 UI 插槽。
4. 在 `src/index.ts` 实现 `plugin.activate(context)`。
5. 使用 `context.registrations` 注册命令和视图，并在插件返回的
   `dispose()` 中释放所有注册项。
6. 只通过类型化的 `context.host` 能力访问宿主。host ID 和启动上下文只是
   上下文，不代表已获得权限。

不要在 HyperShell 核心中添加针对插件 ID 的条件分支。功能逻辑、状态、UI、
测试和说明文档归插件自身所有。若缺少宿主能力，应先提出通用、经过 schema
校验且受权限控制的 API。

### 构建与打包

在仓库根目录运行：

```powershell
pnpm install
pnpm --filter @hypershell/plugin-my-tool build
pnpm plugin:pack -- plugins/external/my-tool
```

打包命令会校验 `plugin.json`、构建 workspace 包、打包浏览器入口，并在插件
目录的 `.packages/` 下生成带版本号的 `.hspkg`。包内包含 manifest、bundle、
纳入的 `dist/` 和 `assets/` 文件以及 `checksums.sha256`。`.packages/` 已被
Git 忽略；发布时应把 `.hspkg` 作为版本附件，而不是源码提交。

### 安装、运行与验收

1. 构建并运行 `pnpm --filter @hypershell/desktop dev`。
2. 在 HyperShell 的“设置 > 插件”安装生成的 `.hspkg`。
3. 审核并仅授予必需权限；如果应用提示重启，按提示重启。
4. 打开 manifest 声明的视图/命令入口并验证功能。
5. 测试拒绝权限、非法输入、重复激活、关闭视图、停用/卸载，以及定时器、
   监听器和其他资源的清理。

外置插件按安装包运行，修改 `src/` 不会热更新已安装版本。测试改动时需重新
构建、打包并安装/更新 `.hspkg`。

### 协作约定

- `plugin.json` 的 `ui.slots` 必须与实际注册的视图和入口一致；UI 插槽本身
  不授予任何权限。
- 遵循最小权限原则；宿主必须校验插件输入，缺少权限时默认拒绝。
- 不得把任意 shell、文件系统、网络、进程创建或通用 IPC 包装成插件捷径。
- 停用时释放所有注册项和异步资源。
- 提交针对性测试、中英文 README、真实功能状态，以及随包分发的第三方代码/数据
  许可证声明。
- 可安装更新必须提升 `plugin.json` 的 `version`；`apiVersion` 表示插件 API
  契约版本，不随插件每次发布递增。

开发流程见[外置插件指南](../../../wiki/guide/developer/plugins/)；可用 UI 位置见
[插件 API 参考](../../../wiki/guide/developer/plugin-api)。
