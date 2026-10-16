-- The first migration: the ontology, the objects and links it describes, and
-- the saved apps and workspaces (ADR-0001, ADR-0004, ADR-0005).
--
-- Every table belongs to an owner. Row-level security is on for each, with one
-- policy: an authenticated user reads and writes the rows they own, and no
-- others. `owner` defaults to the caller, so a client never sends it.
-- `(select auth.uid())` is evaluated once per statement, not once per row.
--
-- The database does not check what `data`, `ontology` or `spec` hold: the
-- client does, against the ontology and the schemas of packages/spec
-- (ADR-0009).

-- The ontology, one row per version. A change set yields the next version,
-- and `change` is the change set that produced it.
create table public.ontology_versions (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  version int not null,
  ontology jsonb not null,
  change jsonb,
  created_at timestamptz not null default now(),
  primary key (owner, version)
);

-- One table for the objects of every type. `type_version` is the version of
-- the type the object was written at; a change to the ontology never rewrites
-- it.
create table public.objects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  type text not null,
  type_version int not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- What a link's ends reference: an object together with its owner.
  unique (owner, id)
);

create index objects_owner_type on public.objects (owner, type);
create index objects_data on public.objects using gin (data);

-- A link and both its ends belong to one owner, and the database holds it so:
-- each end is a foreign key on the owner and the object's id together. A
-- foreign key's check ignores row-level security, so a key on the id alone
-- would let one owner link to another's object, learn from the error whether
-- an id exists, and lose the link when the other owner deletes it.
create table public.links (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  link_type text not null,
  from_id uuid not null,
  to_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner, from_id) references public.objects (owner, id) on delete cascade,
  foreign key (owner, to_id) references public.objects (owner, id) on delete cascade
);

-- The foreign keys are not indexed by Postgres itself: a delete of an object
-- would scan every link.
create index links_owner_from_id on public.links (owner, from_id);
create index links_owner_to_id on public.links (owner, to_id);

-- A saved app and a saved workspace: each save is a new version, and none is
-- overwritten.
create table public.apps (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  version int not null,
  spec jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner, id, version)
);

create table public.workspaces (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  version int not null,
  spec jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner, id, version)
);

-- `updated_at` follows each update, whoever writes it.
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger objects_updated_at before update on public.objects
  for each row execute function public.set_updated_at();

create trigger links_updated_at before update on public.links
  for each row execute function public.set_updated_at();

alter table public.ontology_versions enable row level security;
alter table public.objects enable row level security;
alter table public.links enable row level security;
alter table public.apps enable row level security;
alter table public.workspaces enable row level security;

create policy "owner only" on public.ontology_versions for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

create policy "owner only" on public.objects for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

create policy "owner only" on public.links for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

create policy "owner only" on public.apps for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

create policy "owner only" on public.workspaces for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
