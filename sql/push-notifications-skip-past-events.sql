-- Skip status/update notification jobs for events whose date is already in the past.

create or replace function public.enqueue_event_update_notification()
returns trigger
language plpgsql
security definer
as $$
declare
  event_date date;
begin
  select e.date into event_date from public.events e where e.id = new.event_id;
  if event_date is null or event_date < current_date then
    return new;
  end if;

  insert into public.notification_jobs(kind, event_id, payload)
  values (
    'event_update',
    new.event_id,
    jsonb_build_object('updateMessage', coalesce(new.message, ''))
  );
  return new;
end;
$$;

create or replace function public.enqueue_event_status_notification()
returns trigger
language plpgsql
security definer
as $$
declare
  status_label text;
  event_date date;
begin
  if tg_op = 'UPDATE' and (old.status, old.status_note) is not distinct from (new.status, new.status_note) then
    return new;
  end if;

  select e.date into event_date from public.events e where e.id = new.event_id;
  if event_date is null or event_date < current_date then
    return new;
  end if;

  status_label :=
    case lower(coalesce(new.status, 'active'))
      when 'canceled' then 'Canceled'
      when 'moved' then 'Moved'
      when 'delayed' then 'Delayed'
      else 'Updated'
    end;

  if coalesce(new.status_note, '') <> '' then
    status_label := status_label || ' - ' || new.status_note;
  end if;

  insert into public.notification_jobs(kind, event_id, payload)
  values (
    'event_status',
    new.event_id,
    jsonb_build_object('statusLabel', status_label)
  );
  return new;
end;
$$;
