-- Keep saved-session extension state opaque to the shared database repository.
ALTER TABLE saved_sessions ADD COLUMN plugin_data_json TEXT NOT NULL DEFAULT '{}';

-- Preserve metadata written by the legacy Claude-specific recovery column.
-- This is a one-time compatibility mapping; runtime code uses plugin_data_json.
UPDATE saved_sessions
SET plugin_data_json = json_set(
  plugin_data_json,
  '$."local-terminal".claudeSessionId',
  claude_session_id
)
WHERE claude_session_id IS NOT NULL
  AND json_extract(plugin_data_json, '$."local-terminal".claudeSessionId') IS NULL;
