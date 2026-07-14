-- EventSeries: правила повторения мероприятий
CREATE TABLE IF NOT EXISTS event_series (
    id TEXT PRIMARY KEY,
    freq VARCHAR(20) NOT NULL DEFAULT 'weekly',
    interval_val INTEGER NOT NULL DEFAULT 1,
    by_day TEXT[] DEFAULT '{}',
    until DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- EventSeriesExceptions: исключения из серии
CREATE TABLE IF NOT EXISTS event_series_exceptions (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES event_series(id) ON DELETE CASCADE,
    original_date DATE NOT NULL,
    event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL DEFAULT 'skip',
    new_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_series_exceptions_series_id ON event_series_exceptions(series_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_series_exceptions_series_date ON event_series_exceptions(series_id, original_date);
