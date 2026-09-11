-- ============================================================
-- Safe permanent deletion for never-used providers and locations
-- ============================================================

create or replace function public.delete_unused_lunch_provider(p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_lunch_operations()) then
    raise exception 'Not authorized to delete lunch providers';
  end if;

  if not exists (
    select 1
    from public.lunch_providers
    where id = p_provider_id
    for update
  ) then
    raise exception 'Provider does not exist';
  end if;

  if exists (
    select 1
    from public.provider_menu_items
    where provider_id = p_provider_id
  ) then
    raise exception
      'This provider has existing menu or order history and cannot be deleted. Deactivate it instead.';
  end if;

  if exists (
    select 1
    from public.lunch_days
    where provider_id = p_provider_id
  ) then
    raise exception
      'This provider has existing menu or order history and cannot be deleted. Deactivate it instead.';
  end if;

  if exists (
    select 1
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where ld.provider_id = p_provider_id
  ) then
    raise exception
      'This provider has existing menu or order history and cannot be deleted. Deactivate it instead.';
  end if;

  if exists (
    select 1
    from public.provider_late_order_dispatches
    where provider_id = p_provider_id
  ) then
    raise exception
      'This provider has existing menu or order history and cannot be deleted. Deactivate it instead.';
  end if;

  if exists (
    select 1
    from public.provider_late_order_automatic_opportunities
    where provider_id = p_provider_id
  ) then
    raise exception
      'This provider has existing menu or order history and cannot be deleted. Deactivate it instead.';
  end if;

  delete from public.lunch_providers
  where id = p_provider_id;
end;
$$;

revoke all on function public.delete_unused_lunch_provider(uuid) from public;
grant execute on function public.delete_unused_lunch_provider(uuid) to authenticated;

create or replace function public.delete_unused_office_location(p_office_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_lunch_operations()) then
    raise exception 'Not authorized to delete office locations';
  end if;

  if not exists (
    select 1
    from public.office_locations
    where id = p_office_location_id
    for update
  ) then
    raise exception 'Office location does not exist';
  end if;

  if exists (
    select 1
    from public.profiles
    where default_office_location_id = p_office_location_id
  ) then
    raise exception
      'This office location is already in use and cannot be deleted. Deactivate it instead.';
  end if;

  if exists (
    select 1
    from public.orders
    where office_location_id = p_office_location_id
  ) then
    raise exception
      'This office location is already in use and cannot be deleted. Deactivate it instead.';
  end if;

  delete from public.office_locations
  where id = p_office_location_id;
end;
$$;

revoke all on function public.delete_unused_office_location(uuid) from public;
grant execute on function public.delete_unused_office_location(uuid) to authenticated;
