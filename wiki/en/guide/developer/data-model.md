# Data Model and Migrations

Database fields and upgrade order are defined by `packages/db/src/migrations/`; repository behavior is defined by `packages/db/src/repositories/`. This page is a domain map rather than a copied field inventory that could drift.

## Data domains

| Domain | Representative data | Starting points |
| --- | --- | --- |
| Connection profiles | Hosts, groups, tags, auth profiles, host environment variables | `001_init.sql` and later host migrations |
| Terminal and recovery | Sessions, saved sessions, workspace/layout state, plugin recovery data | `010_saved_sessions.sql`, `016_saved_sessions_transports.sql`, `020_saved_session_plugin_data.sql` |
| Files and operations | SFTP bookmarks and operation history | `002_sftp_bookmarks.sql`, `019_sftp_operation_logs.sql` |
| Local and serial | Serial profiles, local profiles, and their environment variables | `001_init.sql`, `015_local_profiles.sql` |
| App and extensions | App settings and plugin storage | `001_init.sql`, `021_plugin_storage.sql` |
| Trust and history | Host fingerprints, connection history, and recordings | `007_host_fingerprints.sql`, `008_session_recordings.sql`, `009_connection_history.sql`, `022_session_recording_file_path.sql` |

Migration numbers describe upgrade history and do not imply one table per migration. Check the current set under `packages/db/src/migrations/` and the `openDatabase()` runner in `packages/db/src/index.ts`. Do not infer the schema version from older documentation.

## Change rules

- Add columns, indexes, and tables with a new forward migration. Do not rewrite a released migration to describe a new upgrade path.
- Preserve existing user databases. Consider repeated startup, empty databases, and old data; verify the migration runner's actual transaction and idempotency guarantees.
- Shared tables and database infrastructure belong in `packages/db/`. Keep plugin-private state with its owning plugin API/repository rather than teaching generic repositories plugin internals.
- Keep plugin extensions to saved-session state opaque; document the source and compatibility window when migrating a legacy plugin-specific column.
- Update repositories, shared types/schemas when exposed across processes, tests, and backup/restore paths together.

## Verification

At minimum, test fresh database initialization, an old-database upgrade, repository reads/writes, and failure paths. Schema changes should also cover backup/restore and session recovery behavior. Run the database Vitest project:

```powershell
pnpm exec vitest run --project @hypershell/db
```

Migration SQL and repository implementations are authoritative; historical field inventories are not.
