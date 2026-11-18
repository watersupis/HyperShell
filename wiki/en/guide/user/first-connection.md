# First Connection and File Transfer

This guide assumes HyperShell is installed and you have authorized access to the SSH host.

## Add and connect to a host

1. Create a host entry and enter its name, address, port, and username.
2. Choose password or private-key authentication. Keep private keys on your machine; do not paste them into notes or plugin settings.
3. Save the host, then double-click it to connect. Quick Connect (`Ctrl+K`) can connect to an unsaved target.
4. Verify the server host fingerprint on first connection using an independent trusted channel, such as confirmation from the server administrator. If a previously saved fingerprint changes, stop and investigate before replacing it.

If authentication fails, recheck the address, port, username, and authentication method. For a private key, confirm that the corresponding public key is configured on the server. If using SSH config or an agent, check whether the system OpenSSH client can reach the same target. Do not repeatedly retry blindly or copy passwords/private-key contents into logs.

## Use the terminal workspace

An SSH terminal opens in the central workspace. Switch sessions using tabs. Split panes change the layout; they do not merge sessions. Confirm the active tab and target host before entering commands.

## Open SFTP

1. Open **Settings > Plugins**, enable the built-in SFTP plugin, and restart when requested.
2. Select a host and use its file entry or context menu to open SFTP.
3. The local and remote panes show separate directories. Double-click a folder to navigate into it.

## Transfer files

- Drag from the local pane to the remote pane to upload; drag the other way to download.
- Drag within one pane to move an item to another folder.
- Cross-pane drag and drop transfers a copy; it is not a cross-host cut operation.
- Use the pane's path and navigation controls to check the current directory and refresh its listing; file copy/paste actions apply to the current pane.
- Check the destination path and filename before transfer; choose overwrite, skip, or rename when a name conflict appears.
- Confirm task status and failure details in the transfer queue. For large files or unstable networks, do not assume a task completed just because its dialog closed.
- Treat remote deletion as potentially irreversible. Keep independent backups of important data, and confirm the target app version and data scope before restoring an app backup.

## Bookmarks, sync, and operation history

The SFTP bottom panel contains Bookmarks, Logs, Sync, and Transfers. Save frequently used remote paths as bookmarks and select them later to return. Operation logs list file actions; successful uploads, downloads, moves, or renames can show an Undo action when the operation has undo data. This is not general version control, so keep separate backups of important files.

Sync lets you choose local-to-remote, remote-to-local, or bidirectional operation, enter both directory paths, and optionally provide comma-separated exclude patterns. Check both paths and the direction before starting. Bidirectional sync affects both sides; it is not upload-only. Orphan deletion is disabled in the current implementation. Watch the progress and confirm the task finishes without errors.

## Edit a remote file

Open a file from the remote listing to edit it. Binary files open read-only to avoid corrupting them through text conversion; use an appropriate local tool and transfer the result if you need to modify one. If a text file changes on the server after you opened it, saving prompts you to overwrite the remote version, reload, save a copy, or cancel. Reload discards your unsaved local edits. Before overwriting, confirm that you do not need the other changes.

For unavailable local home/drive listings or a changed remote host key, see [troubleshooting](./troubleshooting).
