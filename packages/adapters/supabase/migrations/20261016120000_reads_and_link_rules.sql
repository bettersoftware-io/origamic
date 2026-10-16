-- The second migration: how the object store reads a view, how the library
-- lists the latest of each spec, and how a link holds to its link type's
-- cardinality (the first slice, part 7).
--
-- A view's order and filters are those of core's ObjectStorePort contract
-- (packages/core/src/ports/objectStorePort.ts), which PostgREST's query
-- builder cannot say: text compared and sorted by its code units, values of
-- two types ordered by type, `gt` and `lt` only between two numbers or two
-- strings, `contains` ignoring case with every character taken literally, and
-- a property an object does not have read as null and sorted last either way.
-- So a view is read through one function, `view_objects`.

-- A property's value as a view reads it: one the object does not have, or a
-- JSON null, is SQL null.
create function public.view_value(data jsonb, property text) returns jsonb
language sql immutable
set search_path = ''
as $$
  select nullif(data -> property, 'null'::jsonb);
$$;

-- Two values in order: -1, 0 or 1. Two numbers as numbers, two strings by
-- their code units (`collate "C"`: the database's own collation orders text
-- otherwise). Anything else has no order, and gives null.
create function public.view_compare(lhs jsonb, rhs jsonb) returns int
language plpgsql immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(lhs) = 'number' and jsonb_typeof(rhs) = 'number' then
    return sign(lhs::numeric - rhs::numeric)::int;
  end if;

  if jsonb_typeof(lhs) = 'string' and jsonb_typeof(rhs) = 'string' then
    return case
      when (lhs #>> '{}') collate "C" < (rhs #>> '{}') collate "C" then -1
      when (lhs #>> '{}') collate "C" > (rhs #>> '{}') collate "C" then 1
      else 0
    end;
  end if;

  return null;
end;
$$;

-- Whether a value passes one filter. Never null, so that a filter that does
-- not hold is false and not unknown.
create function public.view_matches(value jsonb, op text, operand jsonb) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  wanted jsonb := nullif(operand, 'null'::jsonb);
begin
  case op
    when 'eq' then
      return value is not distinct from wanted;
    when 'neq' then
      return value is distinct from wanted;
    when 'contains' then
      -- `\`, `%` and `_` are escaped, so each stands for itself.
      return coalesce(
        jsonb_typeof(value) = 'string'
          and jsonb_typeof(wanted) = 'string'
          and (value #>> '{}') ilike '%' || replace(replace(replace(
            wanted #>> '{}', '\', '\\'), '%', '\%'), '_', '\_') || '%',
        false
      );
    when 'gt' then
      return coalesce(public.view_compare(value, wanted) > 0, false);
    when 'lt' then
      return coalesce(public.view_compare(value, wanted) < 0, false);
    else
      raise exception 'a view has no filter "%"', op using errcode = '22023';
  end case;
end;
$$;

-- The rank of a value's type in an order, as Postgres orders jsonb: strings,
-- then numbers, then booleans. A view reads only scalars.
create function public.view_rank(value jsonb) returns int
language sql immutable
set search_path = ''
as $$
  select case jsonb_typeof(value)
    when 'string' then 1
    when 'number' then 2
    when 'boolean' then 3
    else 4
  end;
$$;

-- The objects of one type that a view reads, filtered, and cut to its
-- limit, each with its place in the view's order (`ordinal`, from 1): a
-- caller orders by it.
--
--   query = { "type": "Book",
--             "filter": [{ "property": "rating", "op": "gt", "value": 3 }],
--             "sort": [{ "property": "rating", "dir": "desc" }],
--             "limit": 10 }
--
-- `security invoker`: it runs as the caller, so row-level security keeps it
-- to the caller's own objects. Nothing the query holds is written into the
-- SQL: every property name and value is bound as a parameter, and an `op` or
-- a `dir` is one of a list, or refused.
create function public.view_objects(query jsonb)
returns table (id uuid, type text, type_version int, data jsonb, ordinal bigint)
language plpgsql stable
security invoker
set search_path = ''
as $$
declare
  filter jsonb;
  key jsonb;
  dir text;
  properties text[] := '{}';
  ordering text := '';
begin
  if jsonb_typeof(query -> 'type') is distinct from 'string' then
    raise exception 'a view reads the objects of one type' using errcode = '22023';
  end if;

  for filter in select value from jsonb_array_elements(coalesce(query -> 'filter', '[]'::jsonb)) loop
    if jsonb_typeof(filter -> 'property') is distinct from 'string'
      or (filter ->> 'op') is null
      or (filter ->> 'op') not in ('eq', 'neq', 'contains', 'gt', 'lt') then
      raise exception 'a view filters a property by eq, neq, contains, gt or lt' using errcode = '22023';
    end if;
  end loop;

  for key in select value from jsonb_array_elements(coalesce(query -> 'sort', '[]'::jsonb)) loop
    dir := case key ->> 'dir' when 'asc' then 'asc' when 'desc' then 'desc' end;

    if dir is null or jsonb_typeof(key -> 'property') is distinct from 'string' then
      raise exception 'a view sorts by a property, asc or desc' using errcode = '22023';
    end if;

    properties := properties || (key ->> 'property');
    -- The nth key: present before missing, either way; then by type; then by
    -- value within the type. Only the key's position and its direction, one
    -- of two words, are written into the SQL.
    ordering := ordering || format(
      '(public.view_value(o.data, $2[%1$s]) is null), '
      'public.view_rank(public.view_value(o.data, $2[%1$s])) %2$s, '
      '(case when jsonb_typeof(public.view_value(o.data, $2[%1$s])) = ''string'' '
      'then public.view_value(o.data, $2[%1$s]) #>> ''{}'' end) collate "C" %2$s, '
      '(case when jsonb_typeof(public.view_value(o.data, $2[%1$s])) = ''number'' '
      'then public.view_value(o.data, $2[%1$s])::numeric end) %2$s, '
      '(case when jsonb_typeof(public.view_value(o.data, $2[%1$s])) = ''boolean'' '
      'then public.view_value(o.data, $2[%1$s])::boolean end) %2$s, ',
      cardinality(properties),
      dir
    );
  end loop;

  return query execute format(
    'select s.id, s.type, s.type_version, s.data, s.ordinal '
    'from ('
    '  select o.id, o.type, o.type_version, o.data,'
    '    row_number() over (order by %s o.created_at, o.id) as ordinal'
    '  from public.objects o'
    '  where o.type = $1'
    '    and not exists ('
    '      select 1 from jsonb_array_elements($3) f'
    '      where not public.view_matches(public.view_value(o.data, f ->> ''property''), f ->> ''op'', f -> ''value'')'
    '    )'
    ') s '
    'where $4 is null or s.ordinal <= $4 '
    'order by s.ordinal',
    ordering
  )
  using
    query ->> 'type',
    properties,
    coalesce(query -> 'filter', '[]'::jsonb),
    (query ->> 'limit')::int;
end;
$$;

-- Only a signed-in user reads a view; row-level security does the rest.
revoke execute on function public.view_value(jsonb, text) from public, anon;
revoke execute on function public.view_compare(jsonb, jsonb) from public, anon;
revoke execute on function public.view_matches(jsonb, text, jsonb) from public, anon;
revoke execute on function public.view_rank(jsonb) from public, anon;
revoke execute on function public.view_objects(jsonb) from public, anon;
grant execute on function public.view_value(jsonb, text) to authenticated;
grant execute on function public.view_compare(jsonb, jsonb) to authenticated;
grant execute on function public.view_matches(jsonb, text, jsonb) to authenticated;
grant execute on function public.view_rank(jsonb) to authenticated;
grant execute on function public.view_objects(jsonb) to authenticated;

-- The latest version of each app and of each workspace, which is what the
-- library lists. `security_invoker`: read as the caller, so row-level
-- security keeps each to the caller's own rows.
create view public.latest_apps with (security_invoker = true) as
  select distinct on (owner, id) owner, id, version, spec
  from public.apps
  order by owner, id, version desc;

create view public.latest_workspaces with (security_invoker = true) as
  select distinct on (owner, id) owner, id, version, spec
  from public.workspaces
  order by owner, id, version desc;

revoke all on public.latest_apps, public.latest_workspaces from anon;

-- A link carries its link type's cardinality, as the ontology gave it when
-- the link was written. The database does not read the ontology (ADR-0009),
-- so this is what lets a unique index hold a link to its cardinality: the
-- check and the write are one statement, and two writes at once cannot both
-- pass it. A link written before this migration constrains nothing new.
alter table public.links
  add column cardinality text not null default 'many-to-many'
  check (cardinality in ('one-to-one', 'one-to-many', 'many-to-many'));

alter table public.links alter column cardinality drop default;

-- No pair is linked twice by one link type.
create unique index links_one_pair on public.links (owner, link_type, from_id, to_id);

-- One-to-one: an object is the near end of one link of the type at most.
create unique index links_one_from on public.links (owner, link_type, from_id)
  where cardinality = 'one-to-one';

-- One-to-one and one-to-many: an object is the far end of one at most.
create unique index links_one_to on public.links (owner, link_type, to_id)
  where cardinality <> 'many-to-many';
