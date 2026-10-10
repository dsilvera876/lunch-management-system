-- Menu Item Ratings — Phase 2: batch summaries and interaction hints for Staff UI.

create or replace function private.staff_menu_item_rating_can_submit_or_update(
  p_profile_id uuid,
  p_provider_menu_item_id uuid,
  p_menu_item_generation integer,
  p_existing private.menu_item_ratings
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_delivery record;
begin
  if p_existing.id is not null and p_existing.removed_at is not null then
    return false;
  end if;

  select *
  into v_delivery
  from private.latest_qualifying_menu_item_rating_delivery(
    p_profile_id,
    p_provider_menu_item_id
  );

  if v_delivery.order_id is null then
    return false;
  end if;

  if p_existing.id is null then
    return true;
  end if;

  if p_existing.eligibility_voided_at is not null then
    return true;
  end if;

  if v_delivery.order_id <> p_existing.source_order_id then
    return true;
  end if;

  if v_delivery.meal_receipt_at > p_existing.last_qualifying_delivery_at then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function private.staff_menu_item_rating_can_submit_or_update(uuid, uuid, integer, private.menu_item_ratings) from public;

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
      and mir.removed_at is null
      and mir.eligibility_voided_at is null
      and mir.superseded_at is null;

    select
      coalesce(avg(mir.stars::numeric), 0),
      count(*)::bigint
    into v_avg, v_count
    from private.menu_item_ratings mir
    where mir.provider_menu_item_id = v_id
      and mir.menu_item_generation = v_item.current_rating_generation
      and mir.removed_at is null
      and mir.eligibility_voided_at is null
      and mir.superseded_at is null;

    v_can := private.staff_menu_item_rating_can_submit_or_update(
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
        'can_submit_or_update', v_can
      )
    );
  end loop;

  return jsonb_build_object('summaries', v_rows);
end;
$$;

revoke execute on function public.get_staff_menu_item_rating_summaries(uuid[])
from public, anon;

grant execute on function public.get_staff_menu_item_rating_summaries(uuid[])
to authenticated;
