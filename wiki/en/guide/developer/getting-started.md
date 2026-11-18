# Environment and Startup

## Requirements

| Tool | Requirement |
| --- | --- |
| Node.js | 22 or later |
| pnpm | 10.8 or later |
| Git | Clone and version control |
| Windows native toolchain | Python 3 and Visual Studio Build Tools 2022 with C++ desktop development components |

## Install and run

```powershell
git clone https://github.com/watersupis/HyperShell.git HyperShell
cd HyperShell
pnpm install
pnpm --filter @hypershell/desktop dev
```

The desktop dev script builds the UI and Electron main process, syncs renderer assets, and starts Electron. It is not a separate Vite HMR server; restart the build workflow to verify changes.

Do not run `electron .` as a shortcut to verify source changes: it may load stale output from `apps/desktop/dist/`.

To run the UI browser dev server separately, use `pnpm --filter @hypershell/ui dev` in another terminal. Electron loads it only when `SSHTERM_RENDERER_URL` points to that server.

## Native modules

If a native module has a Node/Electron ABI mismatch, rebuild it for the current Electron runtime:

```powershell
pnpm --filter @hypershell/desktop rebuild:native
pnpm --filter @hypershell/desktop dev
```

Do not assume a native module compiled for regular Node.js can be loaded by Electron.

## Isolated development data

Use a temporary data directory for Electron E2E so tests do not read or modify your normal hosts and settings. The app accepts `HYPERSHELL_DATA_DIR`:

```powershell
$env:HYPERSHELL_DATA_DIR = Join-Path $env:TEMP 'hypershell-dev-data'
pnpm --filter @hypershell/desktop dev
```

Close the app before removing the temporary directory. `SSHTERM_RENDERER_URL` is subject to development/packaged security checks; do not point production builds at an arbitrary webpage.

## Workspace code map

| Area | Directory |
| --- | --- |
| Electron lifecycle, windows, platform APIs, plugin runtime | `apps/desktop/` |
| React Workbench and shared layout | `apps/ui/` |
| Built-in and external plugin features | `plugins/builtin/`, `plugins/external/` |
| Plugin contracts and SDK | `packages/plugin-api/`, `packages/plugin-sdk/` |
| Sessions, cross-process schemas, database infrastructure | `packages/session-core/`, `packages/shared/`, `packages/db/` |

See the [architecture guide](./architecture) for module boundaries and [external plugin guide](./plugins/) for plugin-specific ownership. Moving a file does not by itself mean a migration is accepted.

## Common validation

```powershell
pnpm build
pnpm lint
pnpm test
pnpm --filter @hypershell/ui run test:e2e
pnpm --filter @hypershell/desktop run test:e2e
```

Start with focused tests in the owning workspace. Electron E2E requires an app bundle and native modules rebuilt for Electron. Browser E2E does not use the real Electron preload or IPC bridge. See [build, test, and package](./build-test) for project-specific Vitest commands.
