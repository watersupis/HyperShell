# Settings and Data

## Language and themes

Choose English or Simplified Chinese under **Settings > General**. The UI language applies immediately. Terminal colors and the Workbench light/dark theme are separate settings; configure terminal colors in terminal settings.

## Terminal options

Terminal settings include font family, font size, line height, letter spacing, cursor blinking, and scrollback lines. The default font stack starts with Cascadia Mono and includes system fallbacks; the default size is 13 px. Available fonts depend on the operating system. Cursor shape uses the terminal default and has no separate setting.

## Recording and idle disconnect

Terminal settings can automatically record new terminal sessions. You can also start or stop recording for an individual session from its terminal toolbar. The recording library can play, export as ASCIINEMA Cast, delete, and refresh recordings. Choose the recording folder in Settings. Recordings may contain sensitive terminal output, so handle them like protected logs. Idle disconnect can be set to 15, 30, 60, or 120 minutes, or no limit. It applies to local and remote sessions and is based on terminal input/output activity.

## Plugin settings

Some options appear only while their plugin is enabled, such as SFTP transfer concurrency and local terminal/serial entries. Automatic session recording and its output folder are terminal settings, not plugin toggles. Disabling a plugin does not normally delete its data. Uninstalling an external plugin and deleting its data are separate actions. Restart when prompted after changing built-in plugin state.

## Data location and backup

The app data directory is managed by Electron `userData`. Common defaults are:

- Windows: `%APPDATA%/HyperShell/`
- macOS: `~/Library/Application Support/HyperShell/`
- Linux: `~/.config/HyperShell/`

Hosts and settings are stored in SQLite. Exit the app before manually backing up the database, or use the in-app backup feature. Do not put passwords, private-key contents, or signing credentials in plugin data, notes, or public logs.

Under **Settings > Backup**, choose a path to create a SQLite database backup or restore from a backup file. Restore replaces the current database; the app asks for confirmation and then requires a restart. The page also lists available automatic backups. Confirm the selected file and app version before restoring, then restart when prompted. Do not replace the database file while the app is running. Store backups in a controlled location because they may contain sensitive host configuration.

## Developer and troubleshooting environment

`HYPERSHELL_DATA_DIR` selects an isolated data directory for tests. `SSHTERM_RENDERER_URL` selects a renderer URL. Filesystem-related environment variables can restrict local file access. These are runtime/test controls, not general fixes for connection problems.
