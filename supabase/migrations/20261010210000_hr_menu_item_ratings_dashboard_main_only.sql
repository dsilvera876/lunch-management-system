-- HR ratings dashboard: list and aggregate main menu items only.

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
    and pmi.item_type = 'main'
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
      and pmi.item_type = 'main'
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
