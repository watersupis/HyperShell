# Decision History

This page distills useful context from archived designs for maintaining the current system. Dates, approval labels, and implementation plans describe their original status; this is not a roadmap. Current behavior is defined by source, manifests, schemas, and tests.

## Plugin and host boundaries

Historical modularization decisions place feature-specific UI, policy, state, and tests with the feature owner; the host supplies controlled capabilities shared by multiple features. UI slots are contribution/layout contracts, not authorization. Plugin capabilities still require manifest grants and runtime RPC checks. This principle remains useful, while concrete paths and APIs are defined by the [architecture map](./architecture) and [plugin API](./plugin-api).

## SFTP data integrity

The August 2026 SFTP review grouped concerns around data integrity, task ownership, visible failures, and recoverability: conflicts must not disappear behind UI state; editing must identify data that cannot safely round-trip; writes must consider atomic replacement and remote concurrent changes; sync work should identify its session, and closing a view must not silently discard work; failed remote mutations need visible feedback. It also cautioned against judging contrast in a single dark theme; review multiple themes and keyboard/structural accessibility.

These are review and test dimensions, not guarantees for every transport/server combination. When implementation changes, inspect the SFTP transport, IPC, editor, and transfer queue, then verify protocol behavior with regression tests.

## Terminal titles and process observation

The August 2026 title designs distinguish shell-reported titles (such as OSC titles) from foreground program names inferred from a local process tree. They have different sources and trust boundaries; local observation must not be described as remote SSH process detection. Title updates should be scoped to a session, and pollers should be released with the session lifecycle. Title rules need stable precedence and coverage for transitions among the shell prompt, foreground CLIs, and restored runtime state.

Check current events, title precedence, and platform availability in session-core, desktop process-observation code, and their tests. Do not rely on an old design's task list as the current implementation.

## Local shell security and compatibility

The August 2026 local-shell design uses a boundary where the renderer sends only a profile ID and the main process resolves the executable, arguments, and working directory from persisted configuration. This prevents renderer input from selecting an arbitrary local program. The spawn environment strips Electron/Node-injected variables so shell tools do not inherit host runtime options; profile-specific environment variables remain an explicit override. Rescans preserve user edits to detected profiles while refreshing availability; detected profiles are hidden rather than deleted so reconciliation does not recreate them.

An elevated ConPTY cannot safely live inside the normal-integrity window, so the elevation design uses a separate elevated instance. Its command line carries only a profile ID, never an executable, arguments, or working directory. This boundary applies to the Windows elevation flow; verify current code for implementation and platform limits.

## Terminal rendering diagnosis

An August 2026 TUI artifact investigation used the rebuilt Electron runtime to disprove WebGL, canvas transparency, and forced repaint as the cause. Resizing triggered a full repaint but was not itself a root-cause fix. Further inspection found that forcing `convertEol` changed PTY newline/cursor semantics. The reusable lesson is to pin the actual runtime artifact and reproduction input, then change one variable at a time. Terminal byte streams should preserve PTY line-ending semantics instead of masking state errors with renderer patches. Confirm current xterm configuration and regression behavior in source and tests.

## Auto-update and release ordering

The May 2026 update proposal chose notify-and-user-confirm installation over silent self-updates and recorded a dependency between release metadata and installer artifacts: clients should not see metadata that points to an artifact that has not uploaded yet. This remains useful when using the same release protocol. Platform support, signing requirements, first-install limitations, and exact asset ordering must be rechecked against current workflows, Electron Builder config, and update service.

## Historical scope

These summaries come from completed plans/specifications and legacy requirements. Unchecked tasks, old priorities/paths/counts, and an “approved” label alone do not establish current status. If a summary conflicts with implementation, source and tests win. See [requirements and plan status](./roadmap) for roadmap context.
