-- Gatebreaker Postgres-Schema (v0.5, Entwurf). Nicht angelegt – nur im Repo.
create table if not exists players (
  id          text primary key,              -- Token / Konto-ID
  name        text not null default 'Kommandant',
  faction     text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
-- Kompletter Spielstand als JSONB (einfach, passt zum Client-Save-Format v2)
create table if not exists saves (
  player_id   text primary key references players(id) on delete cascade,
  version     int not null default 2,
  state       jsonb not null,
  updated_at  timestamptz not null default now()
);
-- Für spätere geteilte Galaxien (Mehrspieler)
create table if not exists galaxies (
  id          bigserial primary key,
  seed        bigint not null,
  created_at  timestamptz not null default now()
);
create table if not exists galaxy_members (
  galaxy_id   bigint references galaxies(id) on delete cascade,
  player_id   text references players(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (galaxy_id, player_id)
);
-- Gefechtsberichte (Audit / Anti-Cheat / Bestenlisten)
create table if not exists battle_reports (
  id          bigserial primary key,
  player_id   text references players(id) on delete cascade,
  system_id   text not null,
  winner      text,
  report      jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists battle_reports_player_idx on battle_reports(player_id, created_at desc);
-- Aktionsprotokoll (Replays, Missbrauchserkennung)
create table if not exists action_log (
  id          bigserial primary key,
  player_id   text references players(id) on delete cascade,
  action      text not null,
  args        jsonb,
  err         text,
  at          timestamptz not null default now()
);
