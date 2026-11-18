# Plugin API and UI Slots

The external plugin contract is currently defined in `packages/plugin-api/`. This page is an overview; the schema and runtime source remain authoritative.

## Manifest essentials

| Field | Contract |
| --- | --- |
| `formatVersion` | Currently `1` |
| `id` | Stable, globally unique reverse-domain-style identifier |
| `version` | `major.minor.patch`; increment for every installable update |
| `apiVersion` | Host API contract version; do not increment for every plugin release |
| `entrypoint` | Relative package path, normally `dist/index.js` |
| `permissions` | Minimum supported permissions required by the feature |
| `contributions` | Contribution types such as `commands`, `views`, or `settings` |
| `ui.slots` | Host entry points and view slots actually used by the plugin |

The schema rejects unknown fields, duplicate permissions, and unsafe entry paths. A manifest declaration is not a user grant; the host checks authorization at call time.

## Current permission identifiers

The enum is defined in `packages/plugin-api/src/manifest.ts`:

- Snippets: `snippets.read`, `snippets.write`, `snippets.execute`
- Command history: `command-history.read`, `command-history.clear`
- Sessions: `sessions.read`, `sessions.broadcast`
- Hosts and monitoring: `hosts.read`, `monitoring.read`, `monitoring.history.delete`
- Diagnostics, processes, and Docker: `diagnostics.local`, `processes.read`, `processes.terminate`, `docker.manage`
- Plugin storage: `storage.read`, `storage.write`

Presence in the schema does not prove that an RPC or plugin feature is fully implemented. Verify host authorization, plugin manifests, and the feature catalog.

## Launch entries and views

| Identifier | Meaning |
| --- | --- |
| `sidebar.navigation` | Manifest-driven host launch entry, not a registered view |
| `terminal.toolbar` | Host launch entry, often with current-host context; not permission |
| `workspace.tab` | Central workspace tab view |
| `workspace.secondarySidebar` | Right auxiliary view |
| `workspace.panel` | Bottom panel view |
| `workspace.header` | Header contribution mounted under host-defined conditions |
| `workspace.toolbar` | Plugin command toolbar contribution, not a `registerView()` slot |

`registerView()` accepts supported view slots; commands use `registerCommand()`. `ui.hostContextMenu` is another host launch integration, not a DOM slot. Manifest declarations and actual registrations must agree.

## Lifecycle and acceptance

Every registration, listener, timer, pending operation, and other resource created by `activate(context)` must be disposable. Verify cleanup when a view closes and when a plugin is disabled, uninstalled, or loses permission. Host API errors should be handled explicitly; denied permissions must not fall back to direct IPC, filesystem, or command execution.

Reference source: `packages/plugin-api/src/manifest.ts` and `runtime.ts`.
