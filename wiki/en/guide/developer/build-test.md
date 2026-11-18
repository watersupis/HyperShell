# Build, Test, and Package

## Common validation

```powershell
pnpm build
pnpm lint
pnpm test
pnpm --filter @hypershell/ui run test:e2e
pnpm --filter @hypershell/desktop run test:e2e
```

Browser E2E validates renderer workflows. Electron E2E uses the real preload, IPC, native modules, and windows. They cover different boundaries and are not interchangeable.

For a narrow change, run the owning workspace tests first. UI and Desktop have separate Vitest configs; run shared, session-core, and db projects from the repository root:

```powershell
pnpm --filter @hypershell/ui exec vitest run
pnpm --filter @hypershell/desktop exec vitest run
pnpm exec vitest run --project @hypershell/shared
pnpm exec vitest run --project @hypershell/session-core
pnpm exec vitest run --project @hypershell/db
```

Target one UI test with `pnpm --filter @hypershell/ui exec vitest run tests/unit/<test-file>`. Electron E2E should use an isolated `HYPERSHELL_DATA_DIR`; see [environment setup](./getting-started).

Place tests in the owning module's `tests/unit/` or `tests/e2e/`; built-in plugin tests belong to that plugin. Browser E2E has no real preload and cannot prove IPC or native-module behavior. Plugin changes should also cover lifecycle cleanup, denied permissions, invalid input, and view closure.

## Electron E2E and ABI

Build the app and rebuild native modules for Electron before Electron E2E:

```powershell
pnpm --filter @hypershell/desktop run build:bundle
pnpm --filter @hypershell/desktop rebuild:native
pnpm --filter @hypershell/desktop run test:e2e
```

If Node tests then fail to load `better-sqlite3`, rebuild it for the Node runtime used by those tests. Diagnose ABI loading errors separately from application assertion failures.

## Package a plugin

```powershell
pnpm --filter @hypershell/plugin-my-tool build
pnpm plugin:pack -- plugins/external/my-tool
```

The `.hspkg` is written under the plugin's `.packages/` directory. Install it in the desktop app and verify permissions, views, invalid input, and cleanup after uninstall. A successful build alone does not prove an installed plugin works.

## Desktop release builds

```powershell
pnpm release:windows:unsigned
pnpm release:mac:unsigned
pnpm release:linux:unsigned
```

Check current `package.json`, Electron Builder configuration, and release scripts for exact artifacts and platform prerequisites. Never commit signing keys, passwords, or tokens. A release also requires validation gates and the platform smoke checklist.

For Windows signing, configure `CSC_LINK` and `CSC_KEY_PASSWORD`, then run `pnpm release:manifest` to create the checksums and artifact manifest. Publish only files listed by that manifest.

### Windows release smoke test

On a clean Windows 10/11 environment, record pass/fail for each applicable item and attach screenshots, short recordings, or logs:

- Launch the workbench and confirm the tray icon appears; open Quick Connect with `Ctrl+K`.
- Open an SSH session; check `vim`, `tmux`, and `htop` rendering and terminal resize behavior.
- Test password, key, agent, and `~/.ssh/config` authentication as applicable to the release.
- If serial is in scope, connect a real COM device and check local echo and DTR/RTS.
- Open multiple sessions; verify disconnect state updates and recovery prompts after restart.
- If broadcast is in scope, confirm its persistent warning and that input reaches only selected targets.

Record the date, tester, version, artifact name, signing status, each result, blockers, approver, and evidence. A successful build is not a substitute for product acceptance.
