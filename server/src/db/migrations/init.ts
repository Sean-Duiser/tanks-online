/** Schema migration — run once on startup (idempotent via IF NOT EXISTS). */
export const INIT_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT        UNIQUE NOT NULL,
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS games (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id             UUID        REFERENCES users(id),
  player2_id             UUID        REFERENCES users(id),
  current_turn_player_id UUID        REFERENCES users(id),
  game_state             JSONB       NOT NULL,
  status                 TEXT        DEFAULT 'waiting'
                                     CHECK (status IN ('waiting', 'active', 'finished')),
  winner_id              UUID        REFERENCES users(id),
  turn_number            INT         DEFAULT 0,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_invites (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID        REFERENCES users(id),
  to_username  TEXT        NOT NULL,
  game_id      UUID        REFERENCES games(id),
  status       TEXT        DEFAULT 'pending'
                           CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
`;
