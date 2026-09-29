-- Split HR operational RLS: support/read uses can_view_lunch_operations(); mutations use can_manage only.

-- lunch_providers
drop policy if exists "Operations roles can manage providers" on public.lunch_providers;

create policy "Operational viewers can read inactive providers"
on public.lunch_providers
for select
to authenticated
using (
  not active
  and (select private.can_view_lunch_operations())
);

create policy "HR can insert providers"
on public.lunch_providers
for insert
to authenticated
with check ((select private.can_manage_lunch_operations()));

create policy "HR can update providers"
on public.lunch_providers
for update
to authenticated
using ((select private.can_manage_lunch_operations()))
with check ((select private.can_manage_lunch_operations()));

create policy "HR can delete providers"
on public.lunch_providers
for delete
to authenticated
using ((select private.can_manage_lunch_operations()));

-- provider_menu_items
drop policy if exists "Operations roles can manage provider menu items" on public.provider_menu_items;

create policy "Operational viewers can read inactive provider menu items"
on public.provider_menu_items
for select
to authenticated
using (
  (
    not active
    or exists (
      select 1
      from public.lunch_providers lp
      where lp.id = provider_id
        and not lp.active
    )
  )
  and (select private.can_view_lunch_operations())
);

create policy "HR can insert provider menu items"
on public.provider_menu_items
for insert
to authenticated
with check ((select private.can_manage_lunch_operations()));

create policy "HR can update provider menu items"
on public.provider_menu_items
for update
to authenticated
using ((select private.can_manage_lunch_operations()))
with check ((select private.can_manage_lunch_operations()));

create policy "HR can delete provider menu items"
on public.provider_menu_items
for delete
to authenticated
using ((select private.can_manage_lunch_operations()));

-- provider_menu_item_weekdays
drop policy if exists "Operations roles can manage provider menu item weekdays" on public.provider_menu_item_weekdays;

create policy "Operational viewers can read provider menu item weekdays"
on public.provider_menu_item_weekdays
for select
to authenticated
using ((select private.can_view_lunch_operations()));

create policy "HR can insert provider menu item weekdays"
on public.provider_menu_item_weekdays
for insert
to authenticated
with check ((select private.can_manage_lunch_operations()));

create policy "HR can update provider menu item weekdays"
on public.provider_menu_item_weekdays
for update
to authenticated
using ((select private.can_manage_lunch_operations()))
with check ((select private.can_manage_lunch_operations()));

create policy "HR can delete provider menu item weekdays"
on public.provider_menu_item_weekdays
for delete
to authenticated
using ((select private.can_manage_lunch_operations()));

-- office_locations (inactive / full directory for HR viewers)
create policy "Operational viewers can read all office locations"
on public.office_locations
for select
to authenticated
using ((select private.can_view_lunch_operations()));
