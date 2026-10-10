-- Menu Item Ratings — Phase 4: Most Popular badge eligibility (Staff summaries).

create or replace function private.staff_menu_item_rating_community_stats(
  p_provider_menu_item_id uuid,
  p_menu_item_generation integer,
  p_provider_rating_generation integer
)
returns table (
  average_stars numeric,
  rating_count bigint,
  distinct_rater_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(avg(mir.stars::numeric), 0),
    count(*)::bigint,
    count(distinct mir.profile_id)::bigint
  from private.menu_item_ratings mir
  where mir.provider_menu_item_id = p_provider_menu_item_id
    and mir.menu_item_generation = p_menu_item_generation
    and mir.provider_rating_generation = p_provider_rating_generation
    and mir.removed_at is null
    and mir.eligibility_voided_at is null
    and mir.superseded_at is null;
$$;

revoke all on function private.staff_menu_item_rating_community_stats(uuid, integer, integer)
from public;

create or replace function private.staff_menu_item_qualifies_most_popular(
  p_average_stars numeric,
  p_distinct_rater_count bigint
)
returns boolean
language sql
immutable
as $$
  select p_distinct_rater_count >= 5 and p_average_stars >= 4.5;
$$;

revoke all on function private.staff_menu_item_qualifies_most_popular(numeric, bigint)
from public;

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
  v_item_type text;
  v_my_stars smallint;
  v_avg numeric;
  v_count bigint;
  v_distinct bigint;
  v_is_most_popular boolean;
begin
  v_user_id := (select private.current_user_id());
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_context
  from private.assert_staff_menu_item_ratings_available(p_provider_menu_item_id);

  select pmi.item_type
  into v_item_type
  from public.provider_menu_items pmi
  where pmi.id = p_provider_menu_item_id;

  select mir.stars
  into v_my_stars
  from private.menu_item_ratings mir
  where mir.profile_id = v_user_id
    and mir.provider_menu_item_id = p_provider_menu_item_id
    and mir.menu_item_generation = v_context.menu_item_generation
    and mir.provider_rating_generation = v_context.provider_rating_generation
    and mir.removed_at is null
    and mir.eligibility_voided_at is null
    and mir.superseded_at is null;

  select s.average_stars, s.rating_count, s.distinct_rater_count
  into v_avg, v_count, v_distinct
  from private.staff_menu_item_rating_community_stats(
    p_provider_menu_item_id,
    v_context.menu_item_generation,
    v_context.provider_rating_generation
  ) s;

  v_is_most_popular := v_item_type = 'main'
    and private.staff_menu_item_qualifies_most_popular(v_avg, v_distinct);

  return jsonb_build_object(
    'provider_menu_item_id', p_provider_menu_item_id,
    'average_stars', round(v_avg, 2),
    'rating_count', v_count,
    'my_stars', v_my_stars,
    'menu_item_generation', v_context.menu_item_generation,
    'is_most_popular', v_is_most_popular
  );
end;
$$;

create or replace function public.get_staff_menu_item_rating_summaries(
  p_provider_menu_item_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_id uuid;
  v_item public.provider_menu_items;
  v_provider public.lunch_providers;
  v_my_stars smallint;
  v_avg numeric;
  v_count bigint;
  v_distinct bigint;
  v_is_most_popular boolean;
  v_existing private.menu_item_ratings;
  v_can boolean;
  v_rows jsonb := '[]'::jsonb;
begin
  v_user_id := (select private.current_user_id());
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_provider_menu_item_ids is null or array_length(p_provider_menu_item_ids, 1) is null then
    return jsonb_build_object('summaries', v_rows);
  end if;

  foreach v_id in array p_provider_menu_item_ids loop
    select *
    into v_item
    from public.provider_menu_items
    where id = v_id;

    if not found then
      continue;
    end if;

    select *
    into v_provider
    from public.lunch_providers
    where id = v_item.provider_id;

    if not coalesce(v_provider.ratings_enabled, false) then
      continue;
    end if;

    select mir.*
    into v_existing
    from private.menu_item_ratings mir
    where mir.profile_id = v_user_id
      and mir.provider_menu_item_id = v_id
      and mir.menu_item_generation = v_item.current_rating_generation;

    select mir.stars
    into v_my_stars
    from private.menu_item_ratings mir
    where mir.profile_id = v_user_id
      and mir.provider_menu_item_id = v_id
      and mir.menu_item_generation = v_item.current_rating_generation
      and mir.provider_rating_generation = v_provider.current_provider_rating_generation
      and mir.removed_at is null
      and mir.eligibility_voided_at is null
      and mir.superseded_at is null;

    select s.average_stars, s.rating_count, s.distinct_rater_count
    into v_avg, v_count, v_distinct
    from private.staff_menu_item_rating_community_stats(
      v_id,
      v_item.current_rating_generation,
      v_provider.current_provider_rating_generation
    ) s;

    v_is_most_popular := v_item.item_type = 'main'
      and private.staff_menu_item_qualifies_most_popular(v_avg, v_distinct);

    v_can := v_item.item_type = 'main'
      and private.staff_menu_item_rating_can_submit_or_update(
        v_user_id,
        v_id,
        v_item.current_rating_generation,
        v_existing
      );

    v_rows := v_rows || jsonb_build_array(
      jsonb_build_object(
        'provider_menu_item_id', v_id,
        'average_stars', round(v_avg, 2),
        'rating_count', v_count,
        'my_stars', v_my_stars,
        'can_submit_or_update', v_can,
        'is_most_popular', v_is_most_popular
      )
    );
  end loop;

  return jsonb_build_object('summaries', v_rows);
end;
$$;

-- Staff may rate main menu items only (sides, standalone, and other catalog types are excluded).
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
  v_item_type text;
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

  select pmi.item_type
  into v_item_type
  from public.provider_menu_items pmi
  where pmi.id = p_provider_menu_item_id;

  if v_item_type is distinct from 'main' then
    raise exception 'Only main menu items can be rated by staff';
  end if;

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
