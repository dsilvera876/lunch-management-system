-- Menu Item Ratings — allow unlimited star edits for an existing valid rating in the current generation.

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

  if p_existing.id is not null
     and p_existing.removed_at is null
     and p_existing.eligibility_voided_at is null then
    return true;
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

  return true;
end;
$$;

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
  into v_existing
  from private.menu_item_ratings mir
  where mir.profile_id = v_user_id
    and mir.provider_menu_item_id = p_provider_menu_item_id
    and mir.menu_item_generation = v_context.menu_item_generation
  for update;

  if v_existing.id is not null then
    if v_existing.removed_at is not null then
      raise exception 'This rating was removed and cannot be resubmitted for the current period';
    end if;

    if v_existing.eligibility_voided_at is null then
      if v_existing.stars = p_stars::smallint then
        return;
      end if;

      update private.menu_item_ratings
      set
        stars = p_stars::smallint,
        updated_at = now()
      where id = v_existing.id;

      return;
    end if;
  end if;

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

  if v_existing.id is not null then
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
