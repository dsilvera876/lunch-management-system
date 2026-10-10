-- Menu Item Ratings — optional HR moderation reasons, paginated HR reads.

alter table private.menu_item_ratings_moderation_audit
  drop constraint if exists menu_item_ratings_moderation_audit_reason_check;

alter table private.menu_item_ratings_moderation_audit
  add constraint menu_item_ratings_moderation_audit_reason_check
  check (char_length(reason) <= 500);

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
    left(coalesce(trim(p_reason), ''), 500),
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

drop function if exists public.get_hr_catalog_menu_item_ratings_detail(uuid);

create or replace function public.get_hr_catalog_menu_item_ratings_detail(
  p_provider_menu_item_id uuid,
  p_page integer default 1,
  p_page_size integer default 20
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
  v_total bigint;
  v_page integer;
  v_page_size integer;
  v_offset integer;
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

  v_page := greatest(1, coalesce(p_page, 1));
  v_page_size := greatest(1, least(coalesce(p_page_size, 20), 100));
  v_offset := (v_page - 1) * v_page_size;

  select count(*)::bigint
  into v_total
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
    limit v_page_size
    offset v_offset
  ) rating_rows;

  return jsonb_build_object(
    'provider_menu_item_id', v_item.id,
    'name', v_item.name,
    'provider_id', v_item.provider_id,
    'current_rating_generation', v_item.current_rating_generation,
    'average_stars', round(v_avg, 2),
    'active_rating_count', v_count,
    'ratings', v_ratings,
    'total_count', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
end;
$$;

drop function if exists public.get_hr_provider_menu_item_ratings_audit(uuid, integer);

create or replace function public.get_hr_provider_menu_item_ratings_audit(
  p_provider_id uuid,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_page integer;
  v_page_size integer;
  v_offset integer;
  v_total bigint;
begin
  perform private.assert_permanent_hr_menu_item_ratings_admin();

  if not exists (
    select 1 from public.lunch_providers lp where lp.id = p_provider_id
  ) then
    raise exception 'Provider does not exist';
  end if;

  v_page := greatest(1, coalesce(p_page, 1));
  v_page_size := greatest(1, least(coalesce(p_page_size, 20), 100));
  v_offset := (v_page - 1) * v_page_size;

  select count(*)::bigint
  into v_total
  from private.menu_item_ratings_moderation_audit a
  where a.provider_id = p_provider_id;

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
    limit v_page_size
    offset v_offset
  ) audit_rows;

  return jsonb_build_object(
    'entries', v_rows,
    'total_count', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
end;
$$;

create or replace function public.hr_remove_menu_item_rating(
  p_rating_id uuid,
  p_reason text default ''
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
  v_reason text;
begin
  v_actor := (select private.assert_permanent_hr_menu_item_ratings_admin());

  v_reason := left(coalesce(trim(p_reason), ''), 500);

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
    removal_reason = nullif(v_reason, ''),
    updated_at = now()
  where mir.id = p_rating_id;

  perform private.insert_menu_item_ratings_moderation_audit(
    v_actor,
    'remove_rating',
    v_provider.id,
    v_item.id,
    p_rating_id,
    v_reason,
    jsonb_build_object('stars', v_row.stars, 'profile_id', v_row.profile_id)
  );
end;
$$;

create or replace function public.hr_reset_catalog_menu_item_ratings(
  p_provider_menu_item_id uuid,
  p_reason text default ''
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
  v_reason text;
begin
  v_actor := (select private.assert_permanent_hr_menu_item_ratings_admin());

  v_reason := left(coalesce(trim(p_reason), ''), 500);

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
    v_reason,
    jsonb_build_object('new_menu_item_generation', v_next)
  );

  return jsonb_build_object(
    'provider_menu_item_id', p_provider_menu_item_id,
    'current_rating_generation', v_next
  );
end;
$$;

create or replace function public.hr_reset_provider_menu_item_ratings(
  p_provider_id uuid,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_provider public.lunch_providers;
  v_next integer;
  v_reason text;
begin
  v_actor := (select private.assert_permanent_hr_menu_item_ratings_admin());

  v_reason := left(coalesce(trim(p_reason), ''), 500);

  select *
  into v_provider
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
    v_provider.id,
    null,
    null,
    v_reason,
    jsonb_build_object('new_provider_rating_generation', v_next)
  );

  return jsonb_build_object(
    'provider_id', p_provider_id,
    'current_provider_rating_generation', v_next
  );
end;
$$;

revoke execute on function public.get_hr_catalog_menu_item_ratings_detail(uuid, integer, integer)
from public, anon;

grant execute on function public.get_hr_catalog_menu_item_ratings_detail(uuid, integer, integer)
to authenticated;

revoke execute on function public.get_hr_provider_menu_item_ratings_audit(uuid, integer, integer)
from public, anon;

grant execute on function public.get_hr_provider_menu_item_ratings_audit(uuid, integer, integer)
to authenticated;
