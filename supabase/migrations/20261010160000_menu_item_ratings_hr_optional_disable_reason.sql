-- Allow optional moderation reasons when enabling/disabling provider ratings.

create or replace function public.hr_set_provider_menu_item_ratings_enabled(
  p_provider_id uuid,
  p_enabled boolean,
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
  v_reason text;
begin
  v_actor := (select private.assert_permanent_hr_menu_item_ratings_admin());

  if p_enabled is null then
    raise exception 'Enabled flag is required';
  end if;

  v_reason := left(coalesce(trim(p_reason), ''), 500);

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
    v_reason,
    jsonb_build_object('ratings_enabled', p_enabled)
  );

  return jsonb_build_object(
    'provider_id', p_provider_id,
    'ratings_enabled', p_enabled
  );
end;
$$;
