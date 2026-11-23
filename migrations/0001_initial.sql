CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, original_name TEXT NOT NULL,
  mime TEXT, size INTEGER, discipline TEXT, folder TEXT, status TEXT, object_key TEXT,
  extracted TEXT, questions_count INTEGER DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, file_id TEXT, discipline TEXT, question TEXT,
  answer TEXT, short_answer TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_user ON questions(user_id);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, question_id TEXT NOT NULL, status TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cards_user ON cards(user_id);
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, discipline TEXT, correct INTEGER, total INTEGER,
  created_at TEXT, details TEXT
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
