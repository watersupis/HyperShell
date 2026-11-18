# Configuration and Environment

User preferences are persisted through the app settings repository. Plugin configuration should use the plugin's own settings/API; do not treat legacy keys as contracts for new features. `HYPERSHELL_DATA_DIR` can point the desktop app at an isolated data directory.

## Runtime variables

| Variable | Purpose |
| --- | --- |
| `HYPERSHELL_DATA_DIR` | Directs app data to a chosen directory for isolated development and Electron E2E. Use a test/development-only directory, never real user data. |
| `SSHTERM_RENDERER_URL` | Selects a development renderer URL; startup validates it. Do not point production at an arbitrary site. |
| `SSHTERM_ENABLE_LOCAL_FS` / `HYPERSHELL_ENABLE_LOCAL_FS` | Enables or disables the local filesystem API. |
| `SSHTERM_ENABLE_SSH_KEY_DISCOVERY` / `HYPERSHELL_ENABLE_SSH_KEY_DISCOVERY` | Controls SSH private-key discovery. |
| `SSHTERM_FS_ALLOW_SYSTEM_ROOTS` / `HYPERSHELL_FS_ALLOW_SYSTEM_ROOTS` | Controls whether the local filesystem API can browse system roots. |
| `SSHTERM_FS_ALLOWED_ROOTS` / `HYPERSHELL_FS_ALLOWED_ROOTS` | Restricts filesystem access to allowed roots; check parsing in `fsIpc.ts`. |
| `SSH_AUTH_SOCK` | Common Unix SSH-agent socket convention; actual support depends on the connection implementation. |
| `CI` | CI environment marker that can affect Playwright retries and server reuse. |

Boolean defaults and precedence between primary names and aliases are defined by the current `envEnabled` / `readEnv` implementation in `apps/desktop/src/main/platform/ipc/fsIpc.ts`; host credential resolution precedence is defined by `apps/desktop/src/main/platform/security/credentialResolver.ts`. Do not infer either from an older table.

## Test and packaging variables

| Variable | Purpose |
| --- | --- |
| `PLAYWRIGHT_BASE_URL` | Base URL for UI Browser E2E. |
| `PLAYWRIGHT_START_SERVER` | Controls whether Playwright starts the UI dev server. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE` | Optional Chromium executable path. |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | Windows desktop signing certificate source and password. Configure only in a controlled release environment; never commit or log secrets. |

## Verification and sources

Configuration is read independently by Electron main, Vite, Playwright, and release scripts. When changing it, search all reads and tests with `rg` rather than assuming scope from the variable name. See [environment setup](./getting-started) and [build, test, and package](./build-test) for workflows.
