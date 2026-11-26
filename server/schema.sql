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
