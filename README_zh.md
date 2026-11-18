<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg">
    <img alt="HyperShell" src="assets/logo.svg" width="420">
  </picture>
</p>

<p align="center">
  面向 SSH 运维的桌面终端工作台，提供多会话工作区和可扩展的插件系统。
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="https://watersupis.github.io/HyperShell/">中文 Wiki</a> ·
  <a href="https://github.com/watersupis/HyperShell/releases">下载</a>
</p>

<p align="center">
  <img alt="Windows x64" src="https://img.shields.io/badge/Windows-x64-0078D4?logo=windows">
  <img alt="macOS x64" src="https://img.shields.io/badge/macOS-x64-000000?logo=apple">
  <img alt="Linux x64" src="https://img.shields.io/badge/Linux-x64-FCC624?logo=linux&logoColor=black">
  <img alt="Electron 39" src="https://img.shields.io/badge/Electron-39-47848F?logo=electron">
  <img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript">
  <img alt="MIT License" src="https://img.shields.io/badge/License-MIT-green">
</p>

HyperShell 将 SSH 主机、终端会话、文件传输和运维工具整合在一个桌面工作区中，基于 Electron、React、TypeScript 和 xterm.js 构建。

## 功能

- 管理 SSH 主机，并在标签页或分屏中打开会话。
- 组织多会话工作区，在终端之间快速切换。
- 按需启用 SFTP、本地终端、串口、SSH 隧道和会话录制等内置功能。
- 通过声明式 API 和权限扩展内置及外置插件。
- 安装外置主机监控，以及远程进程、端口和 Docker 管理插件。
- 使用快捷指令中心管理命令知识、个人快捷指令，并向多个终端广播输入。

部分功能需要启用可选内置插件或安装外置插件。可查看[功能与插件目录](https://watersupis.github.io/HyperShell/guide/user/features)，了解功能状态、启用方式、权限和已知限制。

## 下载

从 [GitHub Releases](https://github.com/watersupis/HyperShell/releases) 下载最新版本。目前发布的应用安装包面向 x64 系统：

| 平台 | 文件 | 使用方式 |
| --- | --- | --- |
| Windows | `hypershell-<version>-x64.exe` | 运行安装程序。 |
| Windows 免安装 | `hypershell-<version>-win-x64.zip` | 解压 ZIP 后，运行解压目录中的 `HyperShell.exe`，无需安装。 |
| macOS | `hypershell-<version>-mac-x64.dmg` | 打开磁盘映像，将 HyperShell 拖入“应用程序”。 |
| Linux | `.AppImage` 或 `.deb` | 运行 AppImage，或安装 Debian 软件包。 |

Windows ZIP 是解压后可直接运行的应用程序包，不是便携数据模式。HyperShell 仍会将设置和应用数据保存在操作系统的标准用户数据目录中，不会保存在 `HyperShell.exe` 旁边。

## 从源码运行

环境要求：Node.js 22 或更高版本、pnpm 10.8.1。Windows 构建原生依赖时可能还需要 Python 3，以及包含“使用 C++ 的桌面开发”工作负载的 Visual Studio Build Tools 2022。

```powershell
pnpm install
pnpm --filter @hypershell/desktop dev
```

桌面开发命令会构建 UI 和 Electron 主进程、同步渲染器资源，然后启动应用；它不是单独的 Vite HMR 开发流程。原生模块和排错步骤见[开发者指南](https://watersupis.github.io/HyperShell/guide/developer/getting-started)。

## 构建与测试

```powershell
pnpm build
pnpm lint
pnpm test
pnpm --filter @hypershell/ui run test:e2e
pnpm --filter @hypershell/desktop run test:e2e
```

可使用 `pnpm release:windows:unsigned`、`pnpm release:mac:unsigned` 或 `pnpm release:linux:unsigned` 构建未签名的桌面安装包。平台要求、Electron E2E、插件打包和发布检查见[构建、测试与打包](https://watersupis.github.io/HyperShell/guide/developer/build-test)。

## 文档

- [用户指南](https://watersupis.github.io/HyperShell/guide/user/)
- [开发者指南](https://watersupis.github.io/HyperShell/guide/developer/)
- [插件 API 与插槽参考](https://watersupis.github.io/HyperShell/guide/developer/plugin-api)
- [English user and developer Wiki](https://watersupis.github.io/HyperShell/en/)

也可在本地使用 `pnpm wiki:build` 构建 Wiki，并通过 `pnpm wiki:preview` 预览。

## 许可证

HyperShell 使用 [MIT 许可证](LICENSE)发布。
