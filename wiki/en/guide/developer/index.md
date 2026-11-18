# Developer Guide

This guide is for HyperShell contributors and plugin authors. Source code, manifests, schemas, workspace scripts, and tests define current behavior; the guide explains how to understand and verify them.

## Development paths

- [Environment and startup](./getting-started): install the workspace, run the app, and rebuild native modules for Electron.
- [Architecture and code map](./architecture): understand Electron, Workbench, platform services, and plugin boundaries.
- [IPC and process boundaries](./ipc-reference) and [data model and migrations](./data-model): locate cross-process contracts and persistence sources of truth.
- [Configuration and environment](./configuration): find development, test, and packaging variables.
- [External plugin development](./plugins/): create, authorize, package, and install a plugin from the template.
- [Plugin API and slots](./plugin-api): review manifest permissions and supported UI contributions.
- [Build, test, and package](./build-test): run validation and build the desktop app or plugin packages.
- [Decision history](./decision-history): review useful design context, not a current roadmap.

## Core conventions

- Keep plugin-specific behavior, UI, state, and tests in the owning plugin directory. The host provides generic capabilities and must not add plugin-ID business branches.
- When adding a host API, update its types, schema, authorization, lifecycle cleanup, and tests together.
- Do not treat historical plans, design files, or old test counts as current implementation facts.
