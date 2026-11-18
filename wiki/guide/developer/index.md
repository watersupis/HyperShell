# 开发者指南

本指南面向 HyperShell 贡献者和插件作者。代码、manifest、schema、workspace scripts 和测试是当前行为的事实来源；文档负责说明如何理解和验证它们。

## 开发路径

- [环境搭建与启动](./getting-started)：安装 workspace、运行开发版、处理原生模块 ABI。
- [架构与代码地图](./architecture)：理解 Electron、Workbench、平台能力和插件边界。
- [IPC 与进程边界](./ipc-reference)、[数据模型与迁移](./data-model)：定位跨进程契约和持久化事实来源。
- [配置与环境变量](./configuration)：查找开发、测试和打包变量。
- [外置插件开发](./plugins/)：从模板创建、声明权限、注册视图、打包和安装。
- [插件 API 与插槽参考](./plugin-api)：查看 manifest 权限和可用 UI 贡献位置。
- [构建、测试与打包](./build-test)：运行验证门禁及桌面应用/插件构建。
- [历史决策摘要](./decision-history)：了解仍有参考价值的设计取舍，不作为当前计划。

## 基本约定

- 单插件业务、UI、状态和测试归该插件目录；宿主提供通用受控能力，不按插件 ID 添加业务特例。
- 新增宿主 API 时同步定义类型、schema、授权检查、生命周期清理和测试。
- 避免把历史计划、设计稿或过去测试数字当成当前实现事实。
