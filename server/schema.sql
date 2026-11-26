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
CREATE INDEX IF NOT EXISTS games_day ON games(day);
CREATE INDEX IF NOT EXISTS visits_time ON visits(visited_at);
