# IPC and Process Boundaries

This page is a guide, not a copied channel inventory that can quickly go stale. Current channel constants, request/response schemas, and preload methods are authoritative.

## Sources of truth

| Contract | Location |
| --- | --- |
| Channel names and domain groups | `packages/shared/src/ipc/channels.ts` |
| Request and response schemas | `packages/shared/src/ipc/schemas.ts`, `packages/shared/src/ipc/sftpSchemas.ts` |
| Shared types and domain contracts | `packages/shared/src/ipc/contracts.ts` and neighboring modules |
| Public preload API | `apps/desktop/src/preload/` |
| Main-process handler registration | `apps/desktop/src/main/ipc/` and owning plugin adapters |
| IPC tests | Owning workspace tests and Electron E2E |

Channels are grouped by domains such as sessions, hosts, settings, filesystem, and plugins. Check the code before assuming a capability is absent, and verify that preload methods and handlers agree.

## Call path

The renderer calls a narrow preload API. Preload validates boundary data and calls a main-process handler, which validates input again before invoking the owning capability. Events pushed to the renderer must also use shared schemas. UI code must not call `ipcRenderer` directly, construct arbitrary channels, or expose a generic invoke primitive as a plugin capability.

An IPC change typically updates:

1. The channel constant and shared request/response schemas.
2. The explicit preload method and its types.
3. The owning handler, authorization checks, and lifecycle cleanup.
4. Tests for both directions; use Electron E2E for behavior crossing the real Electron boundary.

## Plugin boundary

Plugin RPC is authorized by the host runtime against manifest permissions and validated on every call. Plugin views use sandbox messages and do not receive arbitrary IPC channels. A UI slot, a `hostId` in launch context, or a plugin's own permission claim does not grant access. New APIs need defined denial behavior, error semantics, and cleanup on disable/uninstall.

## Verification

Run tests for the owning workspace. Changes involving the real preload or main-process bridge require Electron E2E; Browser E2E has no real preload and cannot prove the IPC contract. See the [build and test guide](./build-test) for current commands.
