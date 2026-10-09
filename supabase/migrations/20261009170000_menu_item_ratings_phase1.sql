-- Menu Item Ratings — Phase 1: schema, delivery eligibility, Staff RPCs, summaries.

-- ------------------------------------------------------------
-- Provider / catalog generation columns
-- ------------------------------------------------------------

alter table public.lunch_providers
  add column if not exists ratings_enabled boolean not null default false,
  add column if not exists current_provider_rating_generation integer not null default 1
    check (current_provider_rating_generation >= 1),
  add column if not exists last_provider_rating_reset_at timestamptz;

alter table public.provider_menu_items
  add column if not exists current_rating_generation integer not null default 1
    check (current_rating_generation >= 1),
  add column if not exists last_rating_reset_at timestamptz;

comment on column public.lunch_providers.ratings_enabled
  is 'When false, Staff menu-item rating RPCs reject all access for this provider.';
comment on column public.lunch_providers.current_provider_rating_generation
  is 'Provider-level assessment generation; snapshotted on each rating row for future HR resets.';
comment on column public.provider_menu_items.current_rating_generation
  is 'Menu-item assessment generation; one rating row per profile per generation.';

-- ------------------------------------------------------------
-- Private rating history
-- ------------------------------------------------------------

create table private.menu_item_ratings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider_menu_item_id uuid not null references public.provider_menu_items(id) on delete restrict,
  provider_id uuid not null references public.lunch_providers(id) on delete restrict,
  menu_item_generation integer not null check (menu_item_generation >= 1),
  provider_rating_generation integer not null check (provider_rating_generation >= 1),
  stars smallint not null check (stars between 1 and 5),
  source_order_id uuid not null references public.orders(id) on delete restrict,
  source_order_item_id uuid references public.order_items(id) on delete set null,
  last_qualifying_delivery_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  removal_reason text
    check (removal_reason is null or char_length(removal_reason) <= 500),
  eligibility_voided_at timestamptz,
  superseded_at timestamptz,
  constraint menu_item_ratings_profile_item_generation_unique
    unique (profile_id, provider_menu_item_id, menu_item_generation)
);

create index menu_item_ratings_item_generation_active_idx
  on private.menu_item_ratings (provider_menu_item_id, menu_item_generation)
  where removed_at is null
    and eligibility_voided_at is null
    and superseded_at is null;

create index menu_item_ratings_source_order_idx
  on private.menu_item_ratings (source_order_id);

revoke all on table private.menu_item_ratings from public, anon, authenticated;

create trigger menu_item_ratings_set_updated_at
  before update on private.menu_item_ratings
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------------
-- Authoritative meal-receipt evidence (not orders.updated_at)
-- ------------------------------------------------------------

create or replace function private.order_verified_meal_receipt_at(p_order_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.delivery_state = 'delivered' then (
      select max(e.created_at)
      from public.order_delivery_events e
      where e.order_id = p_order_id
        and e.event_type = 'marked_delivered'
    )
    when o.delivery_state = 'resolved' then (
      select max(e.created_at)
      from public.order_delivery_events e
      where e.order_id = p_order_id
        and e.event_type = 'replacement_delivered'
    )
    else null
  end
  from public.orders o
  where o.id = p_order_id;
$$;

revoke all on function private.order_verified_meal_receipt_at(uuid) from public;

create or replace function private.order_has_verified_meal_receipt(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.order_verified_meal_receipt_at(p_order_id) is not null;
$$;

revoke all on function private.order_has_verified_meal_receipt(uuid) from public;

-- ------------------------------------------------------------
-- Latest qualifying delivery line for Staff + catalog item
-- ------------------------------------------------------------

create or replace function private.latest_qualifying_menu_item_rating_delivery(
  p_profile_id uuid,
  p_provider_menu_item_id uuid
)
returns table (
  order_id uuid,
  order_item_id uuid,
  meal_receipt_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with reset_watermark as (
    select coalesce(pmi.last_rating_reset_at, '-infinity'::timestamptz) as watermark
    from public.provider_menu_items pmi
    where pmi.id = p_provider_menu_item_id
  ),
  qualifying_orders as (
    select distinct
      o.id as order_id,
      private.order_verified_meal_receipt_at(o.id) as meal_receipt_at,
      o.created_at as order_created_at
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    cross join reset_watermark rw
    where o.profile_id = p_profile_id
      and mi.provider_menu_item_id = p_provider_menu_item_id
      and o.status <> 'cancelled'
      and private.order_has_verified_meal_receipt(o.id)
      and private.order_verified_meal_receipt_at(o.id) >= rw.watermark
  ),
  latest_order as (
    select qo.order_id, qo.meal_receipt_at
    from qualifying_orders qo
    order by qo.meal_receipt_at desc, qo.order_created_at desc, qo.order_id desc
    limit 1
  )
  select
    lo.order_id,
    oi.id as order_item_id,
    lo.meal_receipt_at
  from latest_order lo
  join public.order_items oi on oi.order_id = lo.order_id
  join public.menu_items mi on mi.id = oi.menu_item_id
  where mi.provider_menu_item_id = p_provider_menu_item_id
  order by oi.id
  limit 1;
$$;

revoke all on function private.latest_qualifying_menu_item_rating_delivery(uuid, uuid) from public;

-- ------------------------------------------------------------
-- Invalidate ratings when delivery evidence is withdrawn
-- ------------------------------------------------------------

create or replace function private.invalidate_menu_item_ratings_for_order(p_order_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.menu_item_ratings mir
  set eligibility_voided_at = now()
  where mir.source_order_id = p_order_id
    and mir.removed_at is null
    and mir.eligibility_voided_at is null
    and mir.superseded_at is null;
$$;

revoke all on function private.invalidate_menu_item_ratings_for_order(uuid) from public;

create or replace function private.menu_item_ratings_on_delivery_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type = 'charge_waived' then
    perform private.invalidate_menu_item_ratings_for_order(new.order_id);
  elsif new.event_type = 'order_adjusted'
    and coalesce(new.payload ->> 'action', '') = 'reverted_to_pending' then
    perform private.invalidate_menu_item_ratings_for_order(new.order_id);
  end if;

  return new;
end;
$$;

revoke all on function private.menu_item_ratings_on_delivery_event() from public;

drop trigger if exists menu_item_ratings_delivery_event_invalidation
  on public.order_delivery_events;

create trigger menu_item_ratings_delivery_event_invalidation
  after insert on public.order_delivery_events
  for each row execute function private.menu_item_ratings_on_delivery_event();

-- ------------------------------------------------------------
-- Generation guards (concurrency with future HR resets)
-- ------------------------------------------------------------

create or replace function private.assert_menu_item_rating_generation_current()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.provider_menu_items;
  v_provider public.lunch_providers;
begin
  select *
  into v_item
  from public.provider_menu_items
  where id = new.provider_menu_item_id;

  if not found then
    raise exception 'Menu item does not exist';
  end if;

  select *
  into v_provider
  from public.lunch_providers
  where id = v_item.provider_id;

  if new.menu_item_generation <> v_item.current_rating_generation then
    raise exception 'Menu item rating generation is no longer current';
  end if;

  if new.provider_rating_generation <> v_provider.current_provider_rating_generation then
    raise exception 'Provider rating generation is no longer current';
  end if;

  if new.provider_id <> v_item.provider_id then
    raise exception 'Provider mismatch for menu item rating';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_menu_item_rating_generation_current() from public;

create trigger menu_item_ratings_generation_guard
  before insert or update on private.menu_item_ratings
  for each row execute function private.assert_menu_item_rating_generation_current();

-- Reserved for Phase 2 HR resets; serializes generation bumps per catalog item.
create or replace function private.bump_provider_menu_item_rating_generation(
  p_provider_menu_item_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
begin
  update public.provider_menu_items pmi
  set
    current_rating_generation = pmi.current_rating_generation + 1,
    last_rating_reset_at = now(),
    updated_at = now()
  where pmi.id = p_provider_menu_item_id
  returning pmi.current_rating_generation into v_next;

  if not found then
    raise exception 'Menu item does not exist';
  end if;

  return v_next;
end;
$$;

revoke all on function private.bump_provider_menu_item_rating_generation(uuid) from public;

-- ------------------------------------------------------------
-- Staff RPCs
-- ------------------------------------------------------------

create or replace function private.assert_staff_menu_item_ratings_available(
  p_provider_menu_item_id uuid
)
returns table (
  provider_menu_item_id uuid,
  provider_id uuid,
  menu_item_generation integer,
  provider_rating_generation integer,
  ratings_enabled boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.provider_menu_items;
  v_provider public.lunch_providers;
begin
  select *
  into v_item
  from public.provider_menu_items
  where id = p_provider_menu_item_id;

  if not found then
    raise exception 'Menu item does not exist';
  end if;

  select *
  into v_provider
  from public.lunch_providers
  where id = v_item.provider_id;

  if not coalesce(v_provider.ratings_enabled, false) then
    raise exception 'Menu item ratings are not available';
  end if;

  return query
  select
    v_item.id,
    v_item.provider_id,
    v_item.current_rating_generation,
    v_provider.current_provider_rating_generation,
    v_provider.ratings_enabled;
end;
$$;

revoke all on function private.assert_staff_menu_item_ratings_available(uuid) from public;

create or replace function public.upsert_my_menu_item_rating(
  p_provider_menu_item_id uuid,
  p_stars integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_context record;
  v_delivery record;
  v_existing private.menu_item_ratings;
begin
  v_user_id := (select private.current_user_id());
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if (select private.active_support_scope()) is not null then
    raise exception 'Support Mode is read-only';
  end if;

  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Stars must be between 1 and 5';
  end if;

  select *
  into v_context
  from private.assert_staff_menu_item_ratings_available(p_provider_menu_item_id);

  perform 1
  from public.provider_menu_items pmi
  where pmi.id = p_provider_menu_item_id
  for update;

  select *
  into v_delivery
  from private.latest_qualifying_menu_item_rating_delivery(
    v_user_id,
    p_provider_menu_item_id
  );

  if v_delivery.order_id is null then
    raise exception 'A verified delivery is required before rating this item';
  end if;

  perform 1
  from public.orders o
  where o.id = v_delivery.order_id
    and o.profile_id = v_user_id
  for update;

  if not (select private.order_has_verified_meal_receipt(v_delivery.order_id)) then
    raise exception 'A verified delivery is required before rating this item';
  end if;

  select *
  into v_existing
  from private.menu_item_ratings mir
  where mir.profile_id = v_user_id
    and mir.provider_menu_item_id = p_provider_menu_item_id
    and mir.menu_item_generation = v_context.menu_item_generation
  for update;

  if found then
    if v_existing.removed_at is not null then
      raise exception 'This rating was removed and cannot be resubmitted for the current period';
    end if;

    if v_existing.eligibility_voided_at is null
      and v_existing.stars = p_stars::smallint
      and v_existing.source_order_id = v_delivery.order_id
      and v_existing.source_order_item_id = v_delivery.order_item_id then
      return;
    end if;

    if v_existing.eligibility_voided_at is null
      and v_delivery.order_id = v_existing.source_order_id
      and v_delivery.meal_receipt_at <= v_existing.last_qualifying_delivery_at then
      raise exception 'Another qualifying delivery is required to update your rating';
    end if;

    update private.menu_item_ratings
    set
      stars = p_stars::smallint,
      source_order_id = v_delivery.order_id,
      source_order_item_id = v_delivery.order_item_id,
      last_qualifying_delivery_at = v_delivery.meal_receipt_at,
      eligibility_voided_at = null,
      updated_at = now()
    where id = v_existing.id;

    return;
  end if;

  insert into private.menu_item_ratings (
    profile_id,
    provider_menu_item_id,
    provider_id,
    menu_item_generation,
    provider_rating_generation,
    stars,
    source_order_id,
    source_order_item_id,
    last_qualifying_delivery_at
  )
  values (
    v_user_id,
    v_context.provider_menu_item_id,
    v_context.provider_id,
    v_context.menu_item_generation,
    v_context.provider_rating_generation,
    p_stars::smallint,
    v_delivery.order_id,
    v_delivery.order_item_id,
    v_delivery.meal_receipt_at
  );
end;
$$;

revoke execute on function public.upsert_my_menu_item_rating(uuid, integer)
from public, anon;

grant execute on function public.upsert_my_menu_item_rating(uuid, integer)
to authenticated;

create or replace function public.get_staff_menu_item_rating_summary(
  p_provider_menu_item_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_context record;
  v_my_stars smallint;
  v_avg numeric;
  v_count bigint;
begin
  v_user_id := (select private.current_user_id());
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_context
  from private.assert_staff_menu_item_ratings_available(p_provider_menu_item_id);

  select mir.stars
  into v_my_stars
  from private.menu_item_ratings mir
  where mir.profile_id = v_user_id
    and mir.provider_menu_item_id = p_provider_menu_item_id
    and mir.menu_item_generation = v_context.menu_item_generation
    and mir.removed_at is null
    and mir.eligibility_voided_at is null
    and mir.superseded_at is null;

  select
    coalesce(avg(mir.stars::numeric), 0),
    count(*)::bigint
  into v_avg, v_count
  from private.menu_item_ratings mir
  where mir.provider_menu_item_id = p_provider_menu_item_id
    and mir.menu_item_generation = v_context.menu_item_generation
    and mir.removed_at is null
    and mir.eligibility_voided_at is null
    and mir.superseded_at is null;

  return jsonb_build_object(
    'provider_menu_item_id', p_provider_menu_item_id,
    'average_stars', round(v_avg, 2),
    'rating_count', v_count,
    'my_stars', v_my_stars,
    'menu_item_generation', v_context.menu_item_generation
  );
end;
$$;

revoke execute on function public.get_staff_menu_item_rating_summary(uuid)
from public, anon;

grant execute on function public.get_staff_menu_item_rating_summary(uuid)
to authenticated;
