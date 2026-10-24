-- Gatebreaker Postgres-Schema (v0.6). Nur im Repo, nicht angelegt.
create table if not exists players (
  id           text primary key,
  invite_hash  text unique not null,        -- SHA-256 des Einladungscodes (ein Konto pro Code)
  token_hash   text unique,                 -- SHA-256 des aktuellen Sitzungstokens
  name         text not null default 'Kommandant',
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
create table if not exists saves (
  player_id    text primary key references players(id) on delete cascade,
  version      int not null,                -- Save-Version (src/game/saveio.js SAVE_VERSION)
  game_version text,
  state        jsonb not null,
  updated_at   timestamptz not null default now()
);
create table if not exists battle_reports (
  id bigserial primary key, player_id text references players(id) on delete cascade,
  system_id text not null, winner text, report jsonb not null, created_at timestamptz not null default now()
);
create index if not exists battle_reports_player_idx on battle_reports(player_id, created_at desc);
create table if not exists feedback (
  id bigserial primary key, player_id text references players(id) on delete set null,
  game_version text, body jsonb not null, created_at timestamptz not null default now()
);
