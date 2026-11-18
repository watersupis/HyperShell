# Network Diagnostics / 网络诊断

English | [简体中文](#简体中文)

**Status: skeleton only.** The package can be built and installed, but its
`activate()` currently registers no diagnostic view or command. The declared
`diagnostics.local` permission does not mean diagnostics are implemented.

## Build and Package

```powershell
pnpm --filter @hypershell/plugin-network-diagnostics build
pnpm plugin:pack -- plugins/external/network-diagnostics
```

Do not present this package as a functioning diagnostics tool until a real
workflow, host capability, tests, and installed-package verification exist.

---

## 简体中文

**状态：仅有插件骨架。**当前可以构建和安装，但 `activate()` 尚未注册诊断视图或命令。
清单中声明 `diagnostics.local` 不表示诊断功能已经实现。

## 构建和打包

```powershell
pnpm --filter @hypershell/plugin-network-diagnostics build
pnpm plugin:pack -- plugins/external/network-diagnostics
```

在真正实现工作流、宿主能力和测试，并完成安装包验证前，不要将其描述为可用的诊断工具。
