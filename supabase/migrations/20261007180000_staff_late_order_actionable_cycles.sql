-- Exclude provider/delivery cycles already covered by pending/fulfilled staff late-order state.

create or replace function private.staff_late_order_new_request_blocked_for_cycle(
  p_profile_id uuid,
  p_provider_id uuid,
  p_scheduled_delivery_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.staff_late_order_requests r
    where r.requester_profile_id = p_profile_id
      and r.provider_id = p_provider_id
      and r.scheduled_delivery_date = p_scheduled_delivery_date
      and r.status in ('pending', 'fulfilled')
  )
  or coalesce(
    private.profile_has_submitted_late_order(
      p_profile_id,
      p_provider_id,
      p_scheduled_delivery_date
    ),
    false
  );
$$;

revoke all on function private.staff_late_order_new_request_blocked_for_cycle(uuid, uuid, date) from public;

create or replace function public.list_staff_late_order_eligible_cycles(
  p_office_location_id uuid default null
)
returns table (
  provider_id uuid,
  provider_name text,
  order_date date,
  scheduled_delivery_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_today date := private.jamaica_today_date();
  v_location_id uuid;
  v_delivery date;
  v_order_date date;
  v_provider record;
  v_next_delivery date;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_active_lunch_ordering_profile(v_actor) then
    return;
  end if;

  if p_office_location_id is not null then
    if not exists (
      select 1
      from public.office_locations ol
      where ol.id = p_office_location_id
        and ol.is_active = true
    ) then
      raise exception 'Delivery location is invalid or inactive';
    end if;
    v_location_id := p_office_location_id;
  else
    select p.default_office_location_id into v_location_id from public.profiles p where p.id = v_actor;
    if v_location_id is null then
      return;
    end if;

    if not exists (
      select 1
      from public.office_locations ol
      where ol.id = v_location_id
        and ol.is_active = true
    ) then
      return;
    end if;
  end if;

  v_next_delivery := public.delivery_date_for_order_date(v_today, v_location_id);

  for v_provider in
    select lp.id, lp.name
    from public.lunch_providers lp
    where lp.active and lp.accepts_late_orders
    order by lp.name
  loop
    for v_delivery in
      select dd.delivery_date
      from (
        select v_today as delivery_date
        union
        select v_next_delivery
      ) dd
      where dd.delivery_date is not null
    loop
      begin
        perform private.assert_staff_late_order_request_window(
          v_actor,
          v_provider.id,
          v_delivery,
          now(),
          v_location_id
        );

        if private.staff_late_order_new_request_blocked_for_cycle(
          v_actor,
          v_provider.id,
          v_delivery
        ) then
          continue;
        end if;

        v_order_date := public.order_date_for_delivery_date(v_delivery, v_location_id);
        provider_id := v_provider.id;
        provider_name := v_provider.name;
        order_date := v_order_date;
        scheduled_delivery_date := v_delivery;
        return next;
      exception when others then
        continue;
      end;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.list_staff_late_order_eligible_cycles(uuid) from public, anon;
grant execute on function public.list_staff_late_order_eligible_cycles(uuid) to authenticated;

-- Align write path with eligibility: one pending or fulfilled submission per employee + provider + delivery date.

drop index if exists private.staff_late_order_requests_one_pending_idx;

create unique index staff_late_order_requests_one_active_submission_idx
  on private.staff_late_order_requests (requester_profile_id, provider_id, scheduled_delivery_date)
  where status in ('pending', 'fulfilled');

create or replace function private.assert_staff_late_order_submission_slot_available(
  p_profile_id uuid,
  p_provider_id uuid,
  p_scheduled_delivery_date date
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from private.staff_late_order_requests r
    where r.requester_profile_id = p_profile_id
      and r.provider_id = p_provider_id
      and r.scheduled_delivery_date = p_scheduled_delivery_date
      and r.status in ('pending', 'fulfilled')
  ) then
    raise exception 'A late order request already exists for this provider and delivery date';
  end if;

  if private.profile_has_submitted_late_order(
    p_profile_id,
    p_provider_id,
    p_scheduled_delivery_date
  ) then
    raise exception 'A late order already exists for this provider and delivery date';
  end if;
end;
$$;

revoke all on function private.assert_staff_late_order_submission_slot_available(uuid, uuid, date) from public;

create or replace function public.create_staff_late_order_request(
  p_provider_id uuid,
  p_scheduled_delivery_date date,
  p_requested_summary text,
  p_quantity integer default 1,
  p_special_instructions text default null,
  p_office_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_location_id uuid;
  v_order_date date;
  v_summary text := btrim(p_requested_summary);
  v_instructions text;
  v_request_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if v_summary is null or char_length(v_summary) = 0 or char_length(v_summary) > 500 then
    raise exception 'Request summary is required';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Quantity must be between 1 and 10';
  end if;

  v_instructions := nullif(btrim(coalesce(p_special_instructions, '')), '');
  if v_instructions is not null and char_length(v_instructions) > 500 then
    raise exception 'Special instructions are too long';
  end if;

  v_location_id := private.resolve_staff_late_order_office_location(v_actor, p_office_location_id);

  perform private.assert_staff_late_order_request_window(
    v_actor,
    p_provider_id,
    p_scheduled_delivery_date,
    now(),
    v_location_id
  );

  perform private.assert_staff_late_order_submission_slot_available(
    v_actor,
    p_provider_id,
    p_scheduled_delivery_date
  );

  v_order_date := public.order_date_for_delivery_date(p_scheduled_delivery_date, v_location_id);

  insert into private.staff_late_order_requests (
    requester_profile_id, provider_id, office_location_id, order_date, scheduled_delivery_date,
    status, requested_summary, quantity, special_instructions
  )
  values (
    v_actor, p_provider_id, v_location_id, v_order_date, p_scheduled_delivery_date,
    'pending', v_summary, p_quantity, v_instructions
  )
  returning id into v_request_id;

  perform private.insert_staff_late_order_request_event(
    v_request_id, 'submitted', v_actor,
    jsonb_build_object('provider_id', p_provider_id, 'scheduled_delivery_date', p_scheduled_delivery_date)
  );

  perform private.safe_notify_hr_late_order_submitted(v_request_id);
  return v_request_id;
exception
  when unique_violation then
    raise exception 'A late order request already exists for this provider and delivery date';
end;
$$;

revoke execute on function public.create_staff_late_order_request(uuid, date, text, integer, text, uuid) from public, anon;
grant execute on function public.create_staff_late_order_request(uuid, date, text, integer, text, uuid) to authenticated;
