-- Event duplicate prevention rollout (title + date + city)
-- PREPARED ONLY: do not run until rollout window.
-- Safe target for all clients (desktop, mobile web, Android).

-- 1) Audit duplicates that would conflict with the unique index.
with normalized as (
  select
    id,
    created_at,
    user_id,
    title,
    date,
    city,
    lower(regexp_replace(trim(coalesce(title, '')), '\\s+', ' ', 'g')) as n_title,
    lower(regexp_replace(trim(coalesce(city, '')), '\\s+', ' ', 'g')) as n_city
  from events
)
select
  n_title,
  date,
  n_city,
  count(*) as duplicate_count,
  array_agg(id order by created_at asc) as event_ids
from normalized
where n_title <> '' and n_city <> ''
group by n_title, date, n_city
having count(*) > 1
order by duplicate_count desc, date desc;

-- 2) OPTIONAL cleanup helper (preview only):
-- Keep earliest row, list rows that would be removed.
with normalized as (
  select
    id,
    created_at,
    lower(regexp_replace(trim(coalesce(title, '')), '\\s+', ' ', 'g')) as n_title,
    date,
    lower(regexp_replace(trim(coalesce(city, '')), '\\s+', ' ', 'g')) as n_city,
    row_number() over (
      partition by lower(regexp_replace(trim(coalesce(title, '')), '\\s+', ' ', 'g')),
                   date,
                   lower(regexp_replace(trim(coalesce(city, '')), '\\s+', ' ', 'g'))
      order by created_at asc, id asc
    ) as rn
  from events
)
select id, created_at, n_title, date, n_city
from normalized
where n_title <> '' and n_city <> '' and rn > 1
order by date desc, created_at desc;

-- 3) Rollout index (run only after duplicate cleanup returns 0 rows).
-- This enforces uniqueness for non-empty title/city pairs on the same date.
-- Note: CONCURRENTLY cannot run inside a transaction block.
create unique index concurrently if not exists events_title_date_city_unique
on events (
  lower(regexp_replace(trim(coalesce(title, '')), '\\s+', ' ', 'g')),
  date,
  lower(regexp_replace(trim(coalesce(city, '')), '\\s+', ' ', 'g'))
)
where coalesce(trim(title), '') <> ''
  and coalesce(trim(city), '') <> '';

-- 4) Verification (partial title+date+city index)
select indexname, indexdef
from pg_indexes
where tablename = 'events'
  and indexname = 'events_title_date_city_unique';

-- 5) If duplicates still appear, the index may be missing in Supabase or rows can share the same
--    flyer with slightly different `city` strings (bypassing the partial index). Re-run section 4;
--    if no row is returned, create section 3 again (alone, not in a transaction).

-- 6) Optional stricter rule: one row per normalized title per date (ignores city/venue spelling).
--    Run the audit below first; delete/remerge duplicates, then run this CREATE alone (CONCURRENTLY).
create or replace function public.norm_event_text(t text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(t, '')), '\\s+', ' ', 'g'));
$$;

-- create unique index concurrently if not exists events_norm_title_date_unique
-- on public.events (public.norm_event_text(title), date)
-- where coalesce(trim(title), '') <> '';

-- 7) Audit: duplicate normalized title + date (for stricter index in section 6)
with normalized as (
  select
    id,
    created_at,
    user_id,
    title,
    date,
    city,
    lower(regexp_replace(trim(coalesce(title, '')), '\\s+', ' ', 'g')) as n_title
  from events
)
select
  n_title,
  date,
  count(*) as duplicate_count,
  array_agg(id order by created_at asc) as event_ids
from normalized
where n_title <> ''
group by n_title, date
having count(*) > 1
order by duplicate_count desc, date desc;

-- 8) All UNIQUE indexes on events (see what is actually deployed)
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'events'
  and indexdef ilike '%unique%'
order by indexname;
