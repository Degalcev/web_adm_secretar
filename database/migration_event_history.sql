-- EventHistory: таблица истории изменений мероприятий
CREATE TABLE IF NOT EXISTS event_history (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users.id ON DELETE SET NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    action VARCHAR(50) NOT NULL,
    changes JSONB
);

CREATE INDEX IF NOT EXISTS idx_event_history_event_id ON event_history(event_id);
CREATE INDEX IF NOT EXISTS idx_event_history_timestamp ON event_history(timestamp);
