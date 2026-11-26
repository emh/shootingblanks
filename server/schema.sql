PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS visits (
    id TEXT NOT NULL,
    player_id TEXT NOT NULL REFERENCES players(id),
    visited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    referrer_host TEXT,
    PRIMARY KEY (player_id, id)
);
CREATE TABLE IF NOT EXISTS visit_attribution (
    player_id TEXT NOT NULL,
    visit_id TEXT NOT NULL,
    source TEXT,
    medium TEXT,
    campaign TEXT,
    PRIMARY KEY (player_id, visit_id),
    FOREIGN KEY (player_id, visit_id) REFERENCES visits(player_id, id)
);
CREATE TABLE IF NOT EXISTS puzzles (
    id INTEGER PRIMARY KEY,
    phrase TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS daily_puzzles (
    day TEXT PRIMARY KEY,
    puzzle_id INTEGER NOT NULL REFERENCES puzzles(id)
);
CREATE TABLE IF NOT EXISTS calendar (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    day_zero TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    day TEXT NOT NULL,
    slot TEXT NOT NULL DEFAULT 'daily',
    puzzle_id INTEGER NOT NULL REFERENCES puzzles(id),
    revealed INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'playing' CHECK (status IN ('playing','solved','revealed')),
    score INTEGER,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    UNIQUE (player_id, day, slot)
);
CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id),
    version INTEGER NOT NULL,
    guess TEXT NOT NULL,
    revealed INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (game_id, version)
);
CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    game_id INTEGER UNIQUE REFERENCES games(id),
    heard_before TEXT CHECK (heard_before IN ('yes','no')),
    comment TEXT NOT NULL CHECK (length(comment) <= 1000),
    screen TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((game_id IS NULL AND heard_before IS NULL AND length(comment) > 0)
        OR (game_id IS NOT NULL AND heard_before IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS games_day ON games(day);
CREATE INDEX IF NOT EXISTS visits_time ON visits(visited_at);
CREATE INDEX IF NOT EXISTS games_started ON games(started_at);
CREATE INDEX IF NOT EXISTS games_finished ON games(finished_at);
CREATE INDEX IF NOT EXISTS attempts_time ON attempts(attempted_at);
CREATE INDEX IF NOT EXISTS feedback_time ON feedback(created_at);
CREATE INDEX IF NOT EXISTS feedback_comments_time ON feedback(created_at, id) WHERE comment <> '';
CREATE INDEX IF NOT EXISTS feedback_player_time ON feedback(player_id, created_at) WHERE game_id IS NULL;

-- The dashboard refreshes fixed blocks of 500 rowids per source. Each revision
-- identifies the snapshot a builder can publish while it holds the refresh lease.
CREATE TABLE IF NOT EXISTS analytics_dirty_parts (
    kind TEXT NOT NULL,
    part INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (kind, part)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS analytics_daily_summaries (
    kind TEXT NOT NULL,
    part INTEGER NOT NULL,
    day TEXT NOT NULL,
    piece INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (kind, part, day, piece)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS analytics_summaries_day ON analytics_daily_summaries(day);
CREATE TABLE IF NOT EXISTS analytics_summary_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    generation INTEGER NOT NULL DEFAULT 0,
    initial_ready INTEGER NOT NULL DEFAULT 0,
    refreshed_at INTEGER NOT NULL DEFAULT 0,
    next_refresh INTEGER NOT NULL DEFAULT 0,
    lease_token TEXT,
    lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS analytics_report_cache (
    days INTEGER PRIMARY KEY,
    day TEXT NOT NULL,
    generation INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    payload TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS analytics_visit_insert AFTER INSERT ON visits
BEGIN
    INSERT INTO analytics_dirty_parts(kind, part) VALUES ('visits', (NEW.rowid - 1) / 500)
    ON CONFLICT(kind, part) DO UPDATE SET revision = revision + 1;
END;
-- Tags may arrive after the original visit. Rebuild that visit's own block.
CREATE TRIGGER IF NOT EXISTS analytics_attribution_insert AFTER INSERT ON visit_attribution
BEGIN
    INSERT INTO analytics_dirty_parts(kind, part)
    SELECT 'visits', (rowid - 1) / 500 FROM visits WHERE player_id = NEW.player_id AND id = NEW.visit_id
    ON CONFLICT(kind, part) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER IF NOT EXISTS analytics_attribution_change AFTER UPDATE OF source, medium, campaign ON visit_attribution
WHEN OLD.source IS NOT NEW.source OR OLD.medium IS NOT NEW.medium OR OLD.campaign IS NOT NEW.campaign
BEGIN
    INSERT INTO analytics_dirty_parts(kind, part)
    SELECT 'visits', (rowid - 1) / 500 FROM visits WHERE player_id = NEW.player_id AND id = NEW.visit_id
    ON CONFLICT(kind, part) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER IF NOT EXISTS analytics_game_insert AFTER INSERT ON games
BEGIN
    INSERT INTO analytics_dirty_parts(kind, part) VALUES ('games', (NEW.rowid - 1) / 500)
    ON CONFLICT(kind, part) DO UPDATE SET revision = revision + 1;
END;
-- Intermediate reveals and unsuccessful guesses leave all the fields below
-- unchanged. The guess itself is tracked by the trigger on attempts.
CREATE TRIGGER IF NOT EXISTS analytics_game_result AFTER UPDATE OF started_at, finished_at, score, status ON games
WHEN OLD.started_at IS NOT NEW.started_at OR OLD.finished_at IS NOT NEW.finished_at
    OR OLD.score IS NOT NEW.score OR OLD.status IS NOT NEW.status
BEGIN
    INSERT INTO analytics_dirty_parts(kind, part) VALUES ('games', (NEW.rowid - 1) / 500)
    ON CONFLICT(kind, part) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER IF NOT EXISTS analytics_attempt_insert AFTER INSERT ON attempts
BEGIN
    INSERT INTO analytics_dirty_parts(kind, part) VALUES ('attempts', (NEW.rowid - 1) / 500)
    ON CONFLICT(kind, part) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER IF NOT EXISTS analytics_feedback_insert AFTER INSERT ON feedback
BEGIN
    INSERT INTO analytics_dirty_parts(kind, part) VALUES ('feedback', (NEW.rowid - 1) / 500)
    ON CONFLICT(kind, part) DO UPDATE SET revision = revision + 1;
END;

-- Register existing blocks once. MAX(rowid) seeks to the end of each source.
-- Reapplying this schema leaves published summaries and the queue intact.
CREATE TRIGGER IF NOT EXISTS analytics_initialize AFTER INSERT ON analytics_summary_state
BEGIN
    INSERT INTO analytics_dirty_parts(kind, part)
    WITH RECURSIVE last_parts(kind, last_part) AS (
        SELECT 'visits', (MAX(rowid) - 1) / 500 FROM visits
        UNION ALL SELECT 'games', (MAX(rowid) - 1) / 500 FROM games
        UNION ALL SELECT 'attempts', (MAX(rowid) - 1) / 500 FROM attempts
        UNION ALL SELECT 'feedback', (MAX(rowid) - 1) / 500 FROM feedback
    ), parts(kind, part, last_part) AS (
        SELECT kind, 0, last_part FROM last_parts WHERE last_part >= 0
        UNION ALL SELECT kind, part + 1, last_part FROM parts WHERE part < last_part
    )
    SELECT kind, part FROM parts WHERE true
    ON CONFLICT(kind, part) DO NOTHING;
END;
INSERT OR IGNORE INTO analytics_summary_state (id) VALUES (1);
