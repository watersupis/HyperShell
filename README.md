<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg">
    <img alt="HyperShell" src="assets/logo.svg" width="420">
  </picture>
</p>

<p align="center">
  面向 SSH 运维的桌面终端工作台，支持标签页、分屏和插件扩展。<br>
  基于 Electron、React、TypeScript 与 xterm.js 构建。
</p>

![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D4?logo=windows)
![macOS](https://img.shields.io/badge/macOS-12%2B-000000?logo=apple)
![Linux](https://img.shields.io/badge/Linux-x64-FCC624?logo=linux&logoColor=black)
![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 功能概览

- SSH 终端、主机管理、SSH 配置导入和标签页/分屏工作区。
- SFTP 双窗格文件浏览、传输、同步、书签、操作日志和远程编辑（可选内置插件）。
- 本地终端、串口、会话录制和 SSH 隧道（可选内置插件）。
- 外置插件安装、权限管理和隔离视图；内置与外置功能都通过插件贡献接入工作台。

插件的实际完成度、可用插槽和限制见 [Wiki 功能与插件目录](wiki/guide/user/features.md)。

## 快速启动

开发环境需要 Node.js 22+、pnpm 10.8+，Windows 原生依赖通常还需要 Visual Studio Build Tools。

```powershell
pnpm install
pnpm --filter @hypershell/desktop dev
```

`desktop dev` 会依次构建 UI、Electron 主进程并同步渲染器资源，然后启动 Electron；不是独立的 Vite HMR 双进程模式。完整步骤、原生模块处理和排错见 [Wiki 开发者指南](wiki/guide/developer/getting-started.md)。

## 文档

从 [HyperShell Wiki](wiki/index.md) 进入用户指南与开发者指南。Wiki 本地预览：`pnpm wiki:dev`；生产构建与预览：`pnpm wiki:build`、`pnpm wiki:preview`。开发参考和历史决策摘要也已纳入 Wiki。

## 常用命令

```powershell
pnpm build
pnpm test
pnpm lint
pnpm --filter @hypershell/ui run test:e2e
pnpm --filter @hypershell/desktop run test:e2e
```

Windows 本地目录构建和安装包命令见 [Wiki 构建、测试与打包](wiki/guide/developer/build-test.md)。

## 许可证

MIT
