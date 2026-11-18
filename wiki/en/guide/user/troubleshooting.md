# Troubleshooting

## A feature entry is missing

Open **Settings > Plugins**, enable the built-in plugin, and restart when requested. External plugins require a valid `.hspkg` installation and appropriate permission grants. An installable package is not proof that its features are implemented.

## SSH hangs while connecting

Check the address, port, username, and authentication method. Then use `ssh -v user@host` from a system terminal to inspect network access, SSH configuration, and ProxyJump. Verify the host fingerprint on first connection. Never share passwords, private keys, or raw credentials in logs.

If system `ssh` works but HyperShell does not, compare the saved host's authentication method, identity file, and target parameters, and check which app build is running. For agent authentication, confirm the agent is running and has the required key loaded.

## The host fingerprint changed

A changed fingerprint can follow a server rebuild or key rotation, result from connecting to the wrong target, or indicate a man-in-the-middle risk. Verify the new fingerprint with the server administrator through an independent trusted channel. Do not approve replacement before verification, and do not reuse trust records across unrelated hosts or ports.

## SFTP is empty or local directories fail to load

Confirm the SFTP plugin is enabled and the SSH session is healthy. If local home/drive enumeration reports `No handler registered for 'fs:get-home'` or `fs:get-drives`, the running main process may not have registered the local filesystem IPC. Fully quit and restart the latest build, and verify Electron is not loading stale `dist` output. If it persists, capture the startup log and build version. If directories load but transfers fail, inspect the queue error and destination path; check remote permissions, free space, and network state.

## Electron reports a native module ABI error

Rebuild native dependencies for the current Electron runtime:

```powershell
pnpm --filter @hypershell/desktop rebuild:native
```

If regular Node tests cannot load the SQLite native module after Electron E2E, rebuild it for the Node runtime used by those tests. Distinguish ABI loading errors from application assertion failures.

## A plugin view is blank

Check its package version, permission grants, API compatibility, and actual implementation status. Source edits do not update an installed `.hspkg`; rebuild, repackage, install/update, and restart if requested. Remove secrets and sensitive host data from logs before sharing them.
