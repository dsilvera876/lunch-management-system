-- Require provider order email for active lunch providers (format + presence).
-- No schema default on primary_order_email; tests/seeds must set fixture emails explicitly.

alter table public.lunch_providers
  alter column primary_order_email drop default;

create or replace function private.validate_provider_late_order_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_order_date date;
  v_delivery_date date;
  v_deadline timestamptz;
  v_send_at timestamptz;
begin
  if new.primary_order_email is not null
     and length(trim(new.primary_order_email)) > 0
     and new.primary_order_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid provider order email';
  end if;

  if new.active
     and (
       new.primary_order_email is null
       or length(trim(new.primary_order_email)) = 0
     ) then
    raise exception 'Active providers require a provider order email';
  end if;

  if new.supplemental_dispatch_mode = 'automatic'
     and new.accepts_late_orders = true
     and new.automatic_supplement_send_day is not null
     and new.automatic_supplement_send_time is not null
     and new.late_order_deadline_day is not null
     and new.late_order_deadline_time is not null then
    v_order_date := current_date;
    v_delivery_date := public.delivery_date_for_order_date(v_order_date);

    if v_delivery_date is not null then
      v_send_at := public.provider_late_order_anchor_at(
        new.automatic_supplement_send_day,
        new.automatic_supplement_send_time,
        v_order_date,
        v_delivery_date
      );
      v_deadline := public.provider_late_order_anchor_at(
        new.late_order_deadline_day,
        new.late_order_deadline_time,
        v_order_date,
        v_delivery_date
      );

      if v_send_at > v_deadline then
        raise exception 'Automatic supplement send time must be on or before the late-order deadline';
      end if;
    end if;
  end if;

  return new;
end;
$$;
