<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg">
    <img alt="HyperShell" src="assets/logo.svg" width="420">
  </picture>
</p>

<p align="center">
  A desktop terminal workbench for SSH operations, with multi-session workspaces and an extensible plugin system.
</p>

<p align="center">
  <a href="README_zh.md">简体中文</a> ·
  <a href="https://watersupis.github.io/HyperShell/">Wiki</a> ·
  <a href="https://github.com/watersupis/HyperShell/releases">Download</a>
</p>

<p align="center">
  <img alt="Windows x64" src="https://img.shields.io/badge/Windows-x64-0078D4?logo=windows">
  <img alt="macOS x64" src="https://img.shields.io/badge/macOS-x64-000000?logo=apple">
  <img alt="Linux x64" src="https://img.shields.io/badge/Linux-x64-FCC624?logo=linux&logoColor=black">
  <img alt="Electron 39" src="https://img.shields.io/badge/Electron-39-47848F?logo=electron">
  <img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript">
  <img alt="MIT License" src="https://img.shields.io/badge/License-MIT-green">
</p>

HyperShell brings SSH hosts, terminal sessions, file transfer, and operational tools into one desktop workspace. It is built with Electron, React, TypeScript, and xterm.js.

## Features

- Manage SSH hosts and open sessions in tabs or split panes.
- Organize multi-session workspaces and quickly switch between terminals.
- Use optional built-in features such as SFTP, local shells, serial terminals, SSH tunnels, and session recording.
- Extend the workbench with built-in and external plugins that contribute through declared APIs and permissions.
- Install external plugins for host monitoring and remote process, port, and Docker management.
- Use the Quick Command Center for command knowledge, personal shortcuts, and terminal input broadcast.

Some features require enabling an optional built-in plugin or installing an external plugin. Check the [feature and plugin catalog](https://watersupis.github.io/HyperShell/guide/user/features) for availability, setup, permissions, and known limitations.

## Download

Download the latest release from [GitHub Releases](https://github.com/watersupis/HyperShell/releases). Current release artifacts target x64 systems:

| Platform | Artifact | How to run |
| --- | --- | --- |
| Windows | `hypershell-<version>-x64.exe` | Run the installer. |
| Windows, no installer | `hypershell-<version>-win-x64.zip` | Extract the ZIP and run `HyperShell.exe` from the extracted folder. No installation step is required. |
| macOS | `hypershell-<version>-mac-x64.dmg` | Open the disk image and move HyperShell to Applications. |
| Linux | `.AppImage` or `.deb` | Run the AppImage or install the Debian package. |

The Windows ZIP is an extracted application distribution, not a portable-data mode. HyperShell continues to store settings and application data in the operating system's standard user data directory; it does not store them beside `HyperShell.exe`.

## Run from source

Requirements: Node.js 22 or later and pnpm 10.8.1. On Windows, native dependencies may also require Python 3 and Visual Studio Build Tools 2022 with the C++ desktop development workload.

```powershell
pnpm install
pnpm --filter @hypershell/desktop dev
```

The desktop development command builds the UI and Electron main process, synchronizes renderer assets, and then launches the app. It is not a standalone Vite HMR workflow. See the [developer guide](https://watersupis.github.io/HyperShell/guide/developer/getting-started) for setup details and native-module troubleshooting.

## Build and test

```powershell
pnpm build
pnpm lint
pnpm test
pnpm --filter @hypershell/ui run test:e2e
pnpm --filter @hypershell/desktop run test:e2e
```

Build unsigned desktop packages with `pnpm release:windows:unsigned`, `pnpm release:mac:unsigned`, or `pnpm release:linux:unsigned`. See [Build, Test, and Package](https://watersupis.github.io/HyperShell/en/guide/developer/build-test) for platform requirements, Electron E2E setup, plugin packaging, and release checks.

## Documentation

- [User guide](https://watersupis.github.io/HyperShell/guide/user/)
- [Developer guide](https://watersupis.github.io/HyperShell/guide/developer/)
- [Plugin API and extension slots](https://watersupis.github.io/HyperShell/guide/developer/plugin-api)
- [中文用户与开发者 Wiki](https://watersupis.github.io/HyperShell/)

The Wiki can also be built locally with `pnpm wiki:build` and previewed with `pnpm wiki:preview`.

## License

HyperShell is distributed under the [MIT License](LICENSE).
