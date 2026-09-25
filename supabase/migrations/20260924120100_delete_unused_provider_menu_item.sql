-- ============================================================
-- Safe permanent deletion for never-used provider menu items
-- ============================================================

create or replace function public.delete_unused_provider_menu_item(
  p_provider_id uuid,
  p_menu_item_id uuid
)
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
    raise exception 'Not authorized to delete provider menu items';
  end if;

  if not exists (
    select 1
    from public.provider_menu_items
    where id = p_menu_item_id
      and provider_id = p_provider_id
    for update
  ) then
    raise exception 'Menu item does not exist';
  end if;

  if exists (
    select 1
    from public.menu_items
    where provider_menu_item_id = p_menu_item_id
  ) then
    raise exception
      'This item has been used in menus or orders and cannot be permanently deleted. Deactivate it instead.';
  end if;

  delete from public.provider_menu_items
  where id = p_menu_item_id
    and provider_id = p_provider_id;
end;
$$;

revoke all on function public.delete_unused_provider_menu_item(uuid, uuid) from public;
grant execute on function public.delete_unused_provider_menu_item(uuid, uuid) to authenticated;
