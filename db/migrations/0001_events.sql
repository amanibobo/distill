create extension if not exists postgis;
create extension if not exists vector;

create table if not exists sites (
  id text primary key,
  name text not null,
  place text not null,
  bbox geometry(Polygon, 4326) not null,
  track int not null,
  passes jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id text primary key,
  site text not null references sites(id) on delete cascade,
  direction text not null check (direction in ('darker', 'brighter')),
  geometry geometry(MultiPolygon, 4326) not null,
  footprint_by_pass jsonb not null,
  change_type text not null check (
    change_type in ('flood', 'fire_scar', 'harvest', 'deforestation', 'glacier_movement', 'ground_deformation', 'other')
  ),
  confidence real not null check (confidence between 0 and 1),
  reason text not null,
  title text,
  summary text,
  area_km2 real not null,
  onset date not null,
  peak date not null,
  last_seen date not null,
  recovery date,
  status text not null check (status in ('growing', 'stable', 'receding', 'recovered')),
  pass_ids text[] not null,
  signature jsonb not null,
  embedding vector(32),
  cover jsonb not null,
  has_deformation boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists events_site_idx on events (site);
create index if not exists events_geometry_idx on events using gist (geometry);
create index if not exists events_type_onset_idx on events (change_type, onset);
