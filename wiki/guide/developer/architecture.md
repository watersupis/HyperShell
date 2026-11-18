# 架构与代码地图

## 运行模型

- `apps/desktop` 提供 Electron 生命周期、preload、安全边界、平台能力和插件运行时。
- `apps/ui` 提供 React Workbench、通用布局和插件视图宿主。
- `plugins/builtin/*` 提供随应用构建的功能模块；`plugins/external/*` 是独立打包安装的外置功能。
- `packages/plugin-api` 与 `plugin-sdk` 提供插件契约和开发辅助；`shared`、`session-core`、`db` 提供中立共享能力。

外置插件视图运行于受限 iframe，通过宿主校验的消息调用类型化 API。这是渲染和能力边界，不是独立 OS 进程。manifest 权限申请、用户授权和每次 RPC 校验共同构成访问控制；UI 插槽或 host ID 本身不授予权限。

## Workbench 区域

| 区域 | 代码位置 | 职责 |
| --- | --- | --- |
| 应用布局与全局状态 | `apps/ui/src/workbench/shell/` | Workbench 组合、设置与全局状态 |
| 活动栏/主侧栏 | `activity-bar/`、`primary-sidebar/` | 全局入口、主机和导航 |
| 中央编辑区 | `editor-area/` | 标签、终端和分屏 |
| 右侧辅助栏/底部面板 | `secondary-sidebar/`、`panel/` | 可调整区域和插件视图 |
| 插槽与插件宿主 | `slots/`、`plugin-runtime/` | 注册契约、内置贡献和沙箱视图 |

## 所有权规则

- 插件专有业务、状态、UI、主进程适配和测试放在对应插件目录。
- 宿主平台模块只承载多个功能共用的 OS、会话、存储、安全和 IPC 服务。
- 不在宿主中按插件 ID 分支；插件间不导入彼此私有实现。
- 增加共享 API 时定义 schema、权限、错误行为、停用清理和测试。

新增功能应同时说明其所有者、调用边界和生命周期。详细目录以当前源码为准。

## IPC 与数据

渲染器只通过 preload 暴露的显式 API 调用主进程，不自行拼 IPC 通道。新增调用时，在 `packages/shared/src/ipc/` 定义通道和 schema，由功能所有者注册 handler 并验证输入；preload 只暴露最小 API。插件专属 handler 随插件生命周期注册和清理，不能用任意通道透传替代安全白名单。

SQLite 连接、迁移框架和通用数据库设施由 `packages/db/` 管理；插件专属仓储归插件所有。新增迁移需可重复执行并覆盖旧数据库升级。详细契约见 [IPC 与进程边界](./ipc-reference) 和 [数据模型与迁移](./data-model)。
