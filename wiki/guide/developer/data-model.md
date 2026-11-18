# 数据模型与迁移

数据库字段和升级顺序以 `packages/db/src/migrations/` 为准；仓储行为以 `packages/db/src/repositories/` 为准。本页提供领域地图，不复制字段清单，避免与实际 schema 漂移。

## 数据域

| 数据域 | 代表内容 | 阅读入口 |
| --- | --- | --- |
| 连接配置 | hosts、host groups、tags、认证配置、主机环境变量 | `packages/db/src/migrations/001_init.sql` 及后续主机迁移 |
| 终端与恢复 | sessions、saved sessions、workspace/layout 状态、插件恢复数据 | `010_saved_sessions.sql`、`016_saved_sessions_transports.sql`、`020_saved_session_plugin_data.sql` |
| 文件与操作 | SFTP bookmarks、操作记录 | `002_sftp_bookmarks.sql`、`019_sftp_operation_logs.sql` |
| 本地/串口 | serial profiles、local profiles 和环境变量 | `001_init.sql`、`015_local_profiles.sql` |
| 应用与扩展 | app settings、插件存储 | `001_init.sql`、`021_plugin_storage.sql` |
| 信任与历史 | host fingerprints、connection history、recordings | `007_host_fingerprints.sql`、`008_session_recordings.sql`、`009_connection_history.sql`、`022_session_recording_file_path.sql` |

数据库迁移编号是升级历史，不保证每个编号只对应一张表。当前迁移集合及执行器可通过 `packages/db/src/migrations/` 和 `packages/db/src/index.ts` 中的 `openDatabase()` 核对；不要根据旧文档推断 schema 版本。

## 变更规则

- 新字段、索引和表通过新的向前迁移加入；不要改写已发布迁移来表达新升级路径。
- 迁移需兼容已有用户数据库，考虑重复启动、空数据库和旧版本数据；检查迁移框架对事务与幂等性的实际保证。
- 通用表和数据库设施归 `packages/db/`；插件私有状态优先由插件仓储/API 所有者管理，不让通用仓储了解插件内部结构。
- 对 saved-session 插件扩展保持数据不透明；迁移旧专属列时，明确映射来源及兼容窗口。
- 同步更新仓储、共享类型/schema（如跨进程暴露）、测试和备份/恢复路径。

## 验证

至少验证空库初始化、旧库升级、仓储读写和失败路径。数据库契约变更还要检查备份/恢复以及会话恢复相关测试。运行数据库 workspace 的测试：

```powershell
pnpm exec vitest run --project @hypershell/db
```

当前表字段以迁移 SQL 和仓储实现为准；历史文档中的列清单不具权威性。
