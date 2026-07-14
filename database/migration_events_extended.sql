-- Расширение таблицы events: duration, organizer_type, series_id
ALTER TABLE events ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 60;
ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_type VARCHAR(10) DEFAULT 'org';
ALTER TABLE events ADD COLUMN IF NOT EXISTS series_id TEXT REFERENCES event_series(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_series_id ON events(series_id);
