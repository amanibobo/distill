create table if not exists watches (
  id text primary key default gen_random_uuid()::text,
  name text not null check (length(name) between 1 and 80),
  site text not null references sites(id) on delete cascade,
  area geometry(Polygon, 4326) not null,
  created_at timestamptz not null default now()
);

create index if not exists watches_site_idx on watches (site);
create index if not exists watches_area_idx on watches using gist (area);

create table if not exists alerts (
  id bigint generated always as identity primary key,
  watch_id text not null references watches(id) on delete cascade,
  pass_date date not null,
  event_id text not null references events(id) on delete cascade,
  change_type text not null,
  area_km2 real not null check (area_km2 > 0),
  created_at timestamptz not null default now(),
  unique (watch_id, pass_date, event_id)
);

create index if not exists alerts_watch_pass_idx on alerts (watch_id, pass_date);
