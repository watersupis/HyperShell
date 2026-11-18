# External Plugin Development

HyperShell external plugins are installed as `.hspkg` packages. They use `@hypershell/plugin-api` to register views and commands and request controlled host capabilities. They are not arbitrary Node.js plugins and do not run in a separate OS process.

## Quick start

1. Copy `plugins/templates/external-plugin/` to `plugins/external/<plugin-folder>/`.
2. Set a unique workspace package name and a stable reverse-domain manifest ID.
3. Declare the plugin version, API version, entry point, minimum permissions, contributions, and UI slots in `plugin.json`.
4. Implement `plugin.activate(context)` in `src/index.ts`, using registration APIs and typed `context.host` capabilities.
5. Dispose every registration, event listener, timer, and asynchronous resource on deactivation.

```powershell
pnpm install
pnpm --filter @hypershell/plugin-my-tool build
pnpm plugin:pack -- plugins/external/my-tool
pnpm --filter @hypershell/desktop dev
```

Install the generated `.hspkg`, review permissions in **Settings > Plugins**, and verify the actual view. Source edits do not hot-reload the installed package; rebuild, package, and install/update it.

## Implementation and acceptance

Keep the stable plugin ID, release version, host API version, entry point, minimum permissions, and contributions consistent between `plugin.json` and runtime registration. `version` identifies installable plugin updates; `apiVersion` identifies the host API contract and does not change with every plugin release. Test the packaged plugin in the desktop app, including denied permissions, view closure, invalid input, and cleanup after disable/uninstall.

## Required boundaries

- Do not import Electron, Node.js, host-private source, or another plugin's private source.
- Do not access the database, arbitrary IPC, shell, filesystem, or unrestricted network directly.
- Request least privilege and handle denied permissions and host errors on every API path.
- `sidebar.navigation` and `terminal.toolbar` are host-generated launch entries, not view slots for `registerView()`.
- `workspace.tab`, `workspace.secondarySidebar`, `workspace.panel`, and `workspace.header` are view areas, subject to host contribution rules.
- The manifest plugin version is for installable updates; `apiVersion` identifies the host API contract.

The packer validates the manifest and package contents and writes a `.hspkg` with a SHA-256 checksum list. A checksum is not a publisher signature.

For manifest fields, permissions, lifecycle, and supported UI slots, see the [plugin API reference](../plugin-api) and `packages/plugin-api/` source. The [feature catalog](../../user/features) describes shipped user-facing status; it does not replace plugin-specific tests.
