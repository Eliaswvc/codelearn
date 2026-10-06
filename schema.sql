-- CodeLearn · esquema para Neon (PostgreSQL)
-- Pégalo completo en Neon > SQL Editor y ejecútalo.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         CITEXT      NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS progress (
  user_id    BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_progress_updated ON progress(updated_at);

-- Comprobar:
-- SELECT id, name, email, created_at, last_login FROM users;
