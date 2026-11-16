-- One row per time the watch job asked ASF for passes newer than the site's last processed pass.
create table if not exists watch_scans (
  id bigint generated always as identity primary key,
  watch_id text not null references watches(id) on delete cascade,
  checked_at timestamptz not null default now(),
  newest_pass_date date,
  new_passes jsonb not null default '[]'::jsonb
);

create index if not exists watch_scans_watch_checked_idx on watch_scans (watch_id, checked_at desc);

-- A NISAR granule over a watch that Distill has not read yet. Kept apart from alerts, which are
-- tied to a detected event with a type and an area.
create table if not exists pass_alerts (
  id bigint generated always as identity primary key,
  watch_id text not null references watches(id) on delete cascade,
  pass_date date not null,
  granule_id text not null,
  track int not null,
  created_at timestamptz not null default now(),
  unique (watch_id, granule_id)
);

create index if not exists pass_alerts_watch_pass_idx on pass_alerts (watch_id, pass_date);
