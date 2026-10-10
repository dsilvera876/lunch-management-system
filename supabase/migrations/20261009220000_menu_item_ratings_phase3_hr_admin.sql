-- Menu Item Ratings — Phase 3: HR administration, moderation, and provider summaries.

-- ------------------------------------------------------------
-- Moderation audit (append-only)
-- ------------------------------------------------------------

create table private.menu_item_ratings_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null
    check (action in (
      'remove_rating',
      'reset_menu_item',
      'reset_provider',
      'enable_ratings',
      'disable_ratings'
    )),
  provider_id uuid not null references public.lunch_providers(id) on delete restrict,
  provider_menu_item_id uuid references public.provider_menu_items(id) on delete set null,
  menu_item_rating_id uuid,
  reason text not null
    check (char_length(trim(reason)) >= 1 and char_length(reason) <= 500),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index menu_item_ratings_moderation_audit_provider_idx
  on private.menu_item_ratings_moderation_audit (provider_id, created_at desc);

revoke all on table private.menu_item_ratings_moderation_audit from public, anon, authenticated;

-- ------------------------------------------------------------
-- HR authorization (permanent HR only; never Support Mode)
-- ------------------------------------------------------------

create or replace function private.assert_permanent_hr_menu_item_ratings_admin()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  v_actor := (select private.current_user_id());
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if (select private.active_support_scope()) is not null then
    raise exception 'Menu item ratings administration is unavailable in Support Mode';
  end if;

  if not (select private.has_role(array['hr'])) then
    raise exception 'Permanent HR access required';
  end if;

  return v_actor;
end;
$$;

revoke all on function private.assert_permanent_hr_menu_item_ratings_admin() from public;

create or replace function private.menu_item_rating_row_is_aggregate_active(
  p_row private.menu_item_ratings,
  p_item_generation integer,
  p_provider_generation integer
)
returns boolean
language sql
immutable
as $$
  select
    p_row.removed_at is null
    and p_row.eligibility_voided_at is null
    and p_row.superseded_at is null
    and p_row.menu_item_generation = p_item_generation
    and p_row.provider_rating_generation = p_provider_generation;
$$;

revoke all on function private.menu_item_rating_row_is_aggregate_active(
  private.menu_item_ratings,
  integer,
  integer
) from public;

create or replace function private.insert_menu_item_ratings_moderation_audit(
  p_actor_id uuid,
  p_action text,
  p_provider_id uuid,
  p_provider_menu_item_id uuid,
  p_menu_item_rating_id uuid,
  p_reason text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.menu_item_ratings_moderation_audit (
    actor_id,
    action,
    provider_id,
    provider_menu_item_id,
    menu_item_rating_id,
    reason,
    payload
  )
  values (
    p_actor_id,
    p_action,
    p_provider_id,
    p_provider_menu_item_id,
    p_menu_item_rating_id,
    trim(p_reason),
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.insert_menu_item_ratings_moderation_audit(
  uuid, text, uuid, uuid, uuid, text, jsonb
) from public;

-- ------------------------------------------------------------
-- Provider-wide generation bump (all catalog items, including inactive)
-- ------------------------------------------------------------

create or replace function private.bump_provider_menu_item_rating_generations_for_provider(
  p_provider_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
begin
  update public.lunch_providers lp
  set
    current_provider_rating_generation = lp.current_provider_rating_generation + 1,
    last_provider_rating_reset_at = now(),
    updated_at = now()
  where lp.id = p_provider_id
  returning lp.current_provider_rating_generation into v_next;

  if not found then
    raise exception 'Provider does not exist';
  end if;

  update public.provider_menu_items pmi
  set
    current_rating_generation = pmi.current_rating_generation + 1,
    last_rating_reset_at = now(),
    updated_at = now()
  where pmi.provider_id = p_provider_id;

  return v_next;
end;
$$;

revoke all on function private.bump_provider_menu_item_rating_generations_for_provider(uuid) from public;

-- ------------------------------------------------------------
-- HR read: provider dashboard summary
-- ------------------------------------------------------------

create or replace function public.get_hr_provider_menu_item_ratings_dashboard(
  p_provider_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider public.lunch_providers;
  v_avg numeric;
  v_count bigint;
  v_items jsonb := '[]'::jsonb;
begin
  perform private.assert_permanent_hr_menu_item_ratings_admin();

  select *
  into v_provider
  from public.lunch_providers lp
  where lp.id = p_provider_id;

  if not found then
    raise exception 'Provider does not exist';
  end if;

  select
    coalesce(avg(mir.stars::numeric), 0),
    count(*)::bigint
  into v_avg, v_count
  from private.menu_item_ratings mir
  join public.provider_menu_items pmi on pmi.id = mir.provider_menu_item_id
  where mir.provider_id = p_provider_id
    and mir.menu_item_generation = pmi.current_rating_generation
    and mir.provider_rating_generation = v_provider.current_provider_rating_generation
    and mir.removed_at is null
    and mir.eligibility_voided_at is null
    and mir.superseded_at is null;

  select coalesce(jsonb_agg(row order by row ->> 'name'), '[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'provider_menu_item_id', pmi.id,
      'name', pmi.name,
      'active', pmi.active,
      'current_rating_generation', pmi.current_rating_generation,
      'average_stars', round(coalesce(stats.avg_stars, 0), 2),
      'rating_count', coalesce(stats.rating_count, 0)
    ) as row
    from public.provider_menu_items pmi
    left join lateral (
      select
        avg(mir.stars::numeric) as avg_stars,
        count(*)::bigint as rating_count
      from private.menu_item_ratings mir
      where mir.provider_menu_item_id = pmi.id
        and mir.menu_item_generation = pmi.current_rating_generation
        and mir.provider_rating_generation = v_provider.current_provider_rating_generation
        and mir.removed_at is null
        and mir.eligibility_voided_at is null
        and mir.superseded_at is null
    ) stats on true
    where pmi.provider_id = p_provider_id
    order by pmi.name
  ) item_rows;

  return jsonb_build_object(
    'provider_id', v_provider.id,
    'provider_name', v_provider.name,
    'ratings_enabled', coalesce(v_provider.ratings_enabled, false),
    'provider_rating_generation', v_provider.current_provider_rating_generation,
    'provider_average_stars', round(v_avg, 2),
    'provider_rating_count', v_count,
    'menu_items', v_items
  );
end;
$$;

revoke execute on function public.get_hr_provider_menu_item_ratings_dashboard(uuid)
from public, anon;

grant execute on function public.get_hr_provider_menu_item_ratings_dashboard(uuid)
to authenticated;

-- ------------------------------------------------------------
-- HR read: catalog item ratings (current generation + moderation history)
-- ------------------------------------------------------------

create or replace function public.get_hr_catalog_menu_item_ratings_detail(
  p_provider_menu_item_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item public.provider_menu_items;
  v_provider public.lunch_providers;
  v_ratings jsonb := '[]'::jsonb;
  v_avg numeric;
  v_count bigint;
begin
  perform private.assert_permanent_hr_menu_item_ratings_admin();

  select *
  into v_item
  from public.provider_menu_items pmi
  where pmi.id = p_provider_menu_item_id;

  if not found then
    raise exception 'Menu item does not exist';
  end if;

  select *
  into v_provider
  from public.lunch_providers lp
  where lp.id = v_item.provider_id;

  select
    coalesce(
      avg(mir.stars::numeric) filter (
        where mir.removed_at is null
          and mir.eligibility_voided_at is null
          and mir.superseded_at is null
      ),
      0
    ),
    count(*) filter (
      where mir.removed_at is null
        and mir.eligibility_voided_at is null
        and mir.superseded_at is null
    )::bigint
  into v_avg, v_count
  from private.menu_item_ratings mir
  where mir.provider_menu_item_id = p_provider_menu_item_id
    and mir.menu_item_generation = v_item.current_rating_generation
    and mir.provider_rating_generation = v_provider.current_provider_rating_generation;

  select coalesce(jsonb_agg(row order by (row ->> 'created_at') desc), '[]'::jsonb)
  into v_ratings
  from (
    select jsonb_build_object(
      'id', mir.id,
      'profile_id', mir.profile_id,
      'employee_name', coalesce(p.full_name, 'Staff member'),
      'stars', mir.stars,
      'created_at', mir.created_at,
      'updated_at', mir.updated_at,
      'removed_at', mir.removed_at,
      'removed_by', mir.removed_by,
      'removal_reason', mir.removal_reason,
      'eligibility_voided_at', mir.eligibility_voided_at,
      'is_active_for_aggregates',
        mir.removed_at is null
        and mir.eligibility_voided_at is null
        and mir.superseded_at is null,
      'can_remove',
        mir.removed_at is null
        and mir.eligibility_voided_at is null
        and mir.superseded_at is null
    ) as row
    from private.menu_item_ratings mir
    join public.profiles p on p.id = mir.profile_id
    where mir.provider_menu_item_id = p_provider_menu_item_id
      and mir.menu_item_generation = v_item.current_rating_generation
      and mir.provider_rating_generation = v_provider.current_provider_rating_generation
    order by mir.created_at desc
  ) rating_rows;

  return jsonb_build_object(
    'provider_menu_item_id', v_item.id,
    'name', v_item.name,
    'provider_id', v_item.provider_id,
    'current_rating_generation', v_item.current_rating_generation,
    'average_stars', round(v_avg, 2),
    'active_rating_count', v_count,
    'ratings', v_ratings
  );
end;
$$;

revoke execute on function public.get_hr_catalog_menu_item_ratings_detail(uuid)
from public, anon;

grant execute on function public.get_hr_catalog_menu_item_ratings_detail(uuid)
to authenticated;

-- ------------------------------------------------------------
-- HR read: moderation audit log
-- ------------------------------------------------------------

create or replace function public.get_hr_provider_menu_item_ratings_audit(
  p_provider_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_limit integer;
begin
  perform private.assert_permanent_hr_menu_item_ratings_admin();

  if not exists (
    select 1 from public.lunch_providers lp where lp.id = p_provider_id
  ) then
    raise exception 'Provider does not exist';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 200));

  select coalesce(jsonb_agg(row order by (row ->> 'created_at') desc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'id', a.id,
      'action', a.action,
      'reason', a.reason,
      'provider_menu_item_id', a.provider_menu_item_id,
      'menu_item_rating_id', a.menu_item_rating_id,
      'payload', a.payload,
      'created_at', a.created_at,
      'actor_id', a.actor_id,
      'actor_name', coalesce(p.full_name, 'HR user')
    ) as row
    from private.menu_item_ratings_moderation_audit a
    join public.profiles p on p.id = a.actor_id
    where a.provider_id = p_provider_id
    order by a.created_at desc
    limit v_limit
  ) audit_rows;

  return jsonb_build_object('entries', v_rows);
end;
$$;

revoke execute on function public.get_hr_provider_menu_item_ratings_audit(uuid, integer)
from public, anon;

grant execute on function public.get_hr_provider_menu_item_ratings_audit(uuid, integer)
to authenticated;

-- ------------------------------------------------------------
-- HR mutations
-- ------------------------------------------------------------

create or replace function public.hr_remove_menu_item_rating(
  p_rating_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row private.menu_item_ratings;
  v_item public.provider_menu_items;
  v_provider public.lunch_providers;
begin
  v_actor := (select private.assert_permanent_hr_menu_item_ratings_admin());

  if p_reason is null or char_length(trim(p_reason)) < 1 then
    raise exception 'A reason is required';
  end if;

  select *
  into v_row
  from private.menu_item_ratings mir
  where mir.id = p_rating_id
  for update;

  if not found then
    raise exception 'Rating does not exist';
  end if;

  select *
  into v_item
  from public.provider_menu_items pmi
  where pmi.id = v_row.provider_menu_item_id
  for update;

  select *
  into v_provider
  from public.lunch_providers lp
  where lp.id = v_item.provider_id
  for update;

  if v_row.menu_item_generation <> v_item.current_rating_generation
    or v_row.provider_rating_generation <> v_provider.current_provider_rating_generation then
    raise exception 'Rating is not in the current assessment period';
  end if;

  if v_row.removed_at is not null then
    return;
  end if;

  update private.menu_item_ratings mir
  set
    removed_at = now(),
    removed_by = v_actor,
    removal_reason = trim(p_reason),
    updated_at = now()
  where mir.id = p_rating_id;

  perform private.insert_menu_item_ratings_moderation_audit(
    v_actor,
    'remove_rating',
    v_provider.id,
    v_item.id,
    p_rating_id,
    p_reason,
    jsonb_build_object('stars', v_row.stars, 'profile_id', v_row.profile_id)
  );
end;
$$;

revoke execute on function public.hr_remove_menu_item_rating(uuid, text)
from public, anon;

grant execute on function public.hr_remove_menu_item_rating(uuid, text)
to authenticated;

create or replace function public.hr_reset_catalog_menu_item_ratings(
  p_provider_menu_item_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_item public.provider_menu_items;
  v_provider public.lunch_providers;
  v_next integer;
begin
  v_actor := (select private.assert_permanent_hr_menu_item_ratings_admin());

  if p_reason is null or char_length(trim(p_reason)) < 1 then
    raise exception 'A reason is required';
  end if;

  select *
  into v_item
  from public.provider_menu_items pmi
  where pmi.id = p_provider_menu_item_id
  for update;

  if not found then
    raise exception 'Menu item does not exist';
  end if;

  select *
  into v_provider
  from public.lunch_providers lp
  where lp.id = v_item.provider_id
  for update;

  v_next := private.bump_provider_menu_item_rating_generation(p_provider_menu_item_id);

  perform private.insert_menu_item_ratings_moderation_audit(
    v_actor,
    'reset_menu_item',
    v_provider.id,
    v_item.id,
    null,
    p_reason,
    jsonb_build_object('new_menu_item_generation', v_next)
  );

  return jsonb_build_object(
    'provider_menu_item_id', p_provider_menu_item_id,
    'current_rating_generation', v_next
  );
end;
$$;

revoke execute on function public.hr_reset_catalog_menu_item_ratings(uuid, text)
from public, anon;

grant execute on function public.hr_reset_catalog_menu_item_ratings(uuid, text)
to authenticated;

create or replace function public.hr_reset_provider_menu_item_ratings(
  p_provider_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_next integer;
begin
  v_actor := (select private.assert_permanent_hr_menu_item_ratings_admin());

  if p_reason is null or char_length(trim(p_reason)) < 1 then
    raise exception 'A reason is required';
  end if;

  perform 1
  from public.lunch_providers lp
  where lp.id = p_provider_id
  for update;

  if not found then
    raise exception 'Provider does not exist';
  end if;

  v_next := private.bump_provider_menu_item_rating_generations_for_provider(p_provider_id);

  perform private.insert_menu_item_ratings_moderation_audit(
    v_actor,
    'reset_provider',
    p_provider_id,
    null,
    null,
    p_reason,
    jsonb_build_object('new_provider_rating_generation', v_next)
  );

  return jsonb_build_object(
    'provider_id', p_provider_id,
    'provider_rating_generation', v_next
  );
end;
$$;

revoke execute on function public.hr_reset_provider_menu_item_ratings(uuid, text)
from public, anon;

grant execute on function public.hr_reset_provider_menu_item_ratings(uuid, text)
to authenticated;

create or replace function public.hr_set_provider_menu_item_ratings_enabled(
  p_provider_id uuid,
  p_enabled boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_provider public.lunch_providers;
begin
  v_actor := (select private.assert_permanent_hr_menu_item_ratings_admin());

  if p_enabled is null then
    raise exception 'Enabled flag is required';
  end if;

  if p_enabled = false and (p_reason is null or char_length(trim(p_reason)) < 1) then
    raise exception 'A reason is required when disabling ratings';
  end if;

  select *
  into v_provider
  from public.lunch_providers lp
  where lp.id = p_provider_id
  for update;

  if not found then
    raise exception 'Provider does not exist';
  end if;

  if coalesce(v_provider.ratings_enabled, false) = p_enabled then
    return jsonb_build_object(
      'provider_id', p_provider_id,
      'ratings_enabled', p_enabled
    );
  end if;

  update public.lunch_providers lp
  set
    ratings_enabled = p_enabled,
    updated_at = now()
  where lp.id = p_provider_id;

  perform private.insert_menu_item_ratings_moderation_audit(
    v_actor,
    case when p_enabled then 'enable_ratings' else 'disable_ratings' end,
    p_provider_id,
    null,
    null,
    coalesce(nullif(trim(p_reason), ''), 'Ratings enabled'),
    jsonb_build_object('ratings_enabled', p_enabled)
  );

  return jsonb_build_object(
    'provider_id', p_provider_id,
    'ratings_enabled', p_enabled
  );
end;
$$;

revoke execute on function public.hr_set_provider_menu_item_ratings_enabled(uuid, boolean, text)
from public, anon;

grant execute on function public.hr_set_provider_menu_item_ratings_enabled(uuid, boolean, text)
to authenticated;
