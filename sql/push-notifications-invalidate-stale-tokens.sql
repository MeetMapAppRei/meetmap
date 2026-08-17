-- Prevent dead FCM/APNs tokens from being revived.
-- The app previously upserted localStorage tokens as active:true on every launch,
-- which undid UNREGISTERED deactivation and silently broke Android delivery.

alter table public.device_push_tokens
  add column if not exists invalidated_at timestamptz,
  add column if not exists last_error text,
  add column if not exists last_attempt_at timestamptz;

create or replace function public.prevent_revive_invalidated_push_token()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.invalidated_at is not null
     and new.token = old.token
     and new.active = true then
    new.active := false;
    new.invalidated_at := old.invalidated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_revive_invalidated_push_token on public.device_push_tokens;
create trigger prevent_revive_invalidated_push_token
  before update on public.device_push_tokens
  for each row
  execute function public.prevent_revive_invalidated_push_token();
