# Architecture and Code Map

## Runtime model

- `apps/desktop` provides Electron lifecycle, preload, security boundaries, platform capabilities, and the plugin runtime.
- `apps/ui` provides the React Workbench, shared layout, and plugin view host.
- `plugins/builtin/*` contains features shipped with the app; `plugins/external/*` contains separately packaged and installed features.
- `packages/plugin-api` and `plugin-sdk` define plugin contracts and developer helpers; `shared`, `session-core`, and `db` provide neutral shared capabilities.

External plugin views run in a restricted iframe and request capabilities through validated host messages. This is a rendering/capability boundary, not a separate OS process. Manifest declarations, user grants, and per-RPC checks all matter; a UI slot or host ID does not grant permission.

## Workbench areas

| Area | Code location | Responsibility |
| --- | --- | --- |
| Application layout and global state | `apps/ui/src/workbench/shell/` | Workbench composition, settings, and global state |
| Activity and primary sidebars | `activity-bar/`, `primary-sidebar/` | Global actions, hosts, and navigation |
| Central editor | `editor-area/` | Tabs, terminals, and splits |
| Secondary sidebar and panel | `secondary-sidebar/`, `panel/` | Resizable areas and plugin views |
| Slots and plugin host | `slots/`, `plugin-runtime/` | Registration contracts, built-in contributions, and sandboxed views |

## Ownership rules

- Put plugin-specific domain logic, state, UI, main-process adapters, and tests in the plugin directory.
- Host platform modules are for capabilities shared across features, such as OS, session, storage, security, and IPC services.
- Do not branch on plugin IDs in the host or import another plugin's private implementation.
- New shared APIs need schemas, permissions, error behavior, deactivation cleanup, and tests.

For new work, identify the owner, call boundary, and lifecycle. See [IPC and process boundaries](./ipc-reference) and [data model and migrations](./data-model) for the corresponding references. The current source tree is authoritative for paths.

## IPC and persistence

The renderer calls the main process only through explicit preload APIs; it must not construct arbitrary IPC channels. Add channel constants and schemas under `packages/shared/src/ipc/`, register and validate handlers with the owning feature, and expose only the smallest required API from preload. Plugin-specific handlers must follow plugin lifecycle cleanup.

SQLite connections, migrations, and shared database infrastructure belong to `packages/db/`; plugin-specific repositories belong to their owning plugin. Add forward migrations that safely upgrade existing databases, and test old and fresh database paths. See the [IPC reference](./ipc-reference) and [data model guide](./data-model).
