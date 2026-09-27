-- ============================================================
-- Complete inactive-account enforcement (remaining auth.uid paths)
-- ============================================================

 CREATE OR REPLACE FUNCTION private.resolve_active_office_location_snapshot(p_office_location_id uuid DEFAULT NULL::uuid, OUT o_location_id uuid, OUT o_location_name text, OUT o_location_address text)
  RETURNS record
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO ''
 AS $function$
 declare
   v_user_id uuid;
   v_resolved_id uuid;
 begin
   v_user_id := (select private.current_user_id());

   if v_user_id is null then
     raise exception 'Authentication required';
   end if;

   v_resolved_id := p_office_location_id;

   if v_resolved_id is null then
     select pr.default_office_location_id
     into v_resolved_id
     from public.profiles pr
     where pr.id = v_user_id;
   end if;

   if v_resolved_id is null then
     raise exception 'Delivery location is required';
   end if;

   select ol.id, ol.name, ol.address
   into o_location_id, o_location_name, o_location_address
   from public.office_locations ol
   where ol.id = v_resolved_id
     and ol.is_active = true;

   if not found then
     raise exception 'Delivery location is invalid or inactive';
   end if;
 end;
 $function$;

 CREATE OR REPLACE FUNCTION public.fetch_hr_late_order_snapshot_menu(p_provider_id uuid, p_delivery_date date)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
 AS $function$
 declare
   v_order_date date;
   v_jamaica_today date := private.jamaica_today_date();
   v_lunch_day_id uuid;
   v_items jsonb;
   v_accepts boolean;
 begin
   if (select private.current_user_id()) is null then
     raise exception 'Authentication required';
   end if;

   if not (select private.can_view_all_orders()) then
     raise exception 'HR late-order access required';
   end if;

   select lp.accepts_late_orders
   into v_accepts
   from public.lunch_providers lp
   where lp.id = p_provider_id
     and lp.active = true;

   if not coalesce(v_accepts, false) then
     raise exception 'Provider does not accept late orders';
   end if;

   v_order_date := public.order_date_for_delivery_date(p_delivery_date);

   if v_order_date is null
      or public.delivery_date_for_order_date(v_order_date) <> p_delivery_date then
     return jsonb_build_object(
       'status', 'invalid_cycle',
       'order_date', null,
       'delivery_date', p_delivery_date,
       'menu_items', '[]'::jsonb
     );
   end if;

   v_lunch_day_id := private.lookup_provider_lunch_day_snapshot(
     p_provider_id,
     v_order_date
   );

   if v_lunch_day_id is null then
     if v_order_date < v_jamaica_today then
       return jsonb_build_object(
         'status', 'historical_unavailable',
         'order_date', v_order_date,
         'delivery_date', p_delivery_date,
         'menu_items', '[]'::jsonb
       );
     elsif v_order_date = v_jamaica_today then
       v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
     else
       return jsonb_build_object(
         'status', 'future_unavailable',
         'order_date', v_order_date,
         'delivery_date', p_delivery_date,
         'menu_items', '[]'::jsonb
       );
     end if;
   elsif v_order_date = v_jamaica_today then
     v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
   end if;

   select coalesce(
     jsonb_agg(
       jsonb_build_object(
         'id', mi.id,
         'name', mi.name,
         'description', mi.description,
         'price', mi.price,
         'item_type', mi.item_type,
         'unit_label', mi.unit_label,
         'display_category', mi.display_category
       )
       order by mi.item_type, mi.name
     ),
     '[]'::jsonb
   )
   into v_items
   from public.menu_items mi
   where mi.lunch_day_id = v_lunch_day_id
     and mi.is_active = true;

   return jsonb_build_object(
     'status', 'available',
     'order_date', v_order_date,
     'delivery_date', p_delivery_date,
     'menu_items', v_items
   );
 end;
 $function$;

 CREATE OR REPLACE FUNCTION public.create_hr_late_order(p_profile_id uuid, p_provider_id uuid, p_delivery_date date, p_items jsonb, p_special_instructions text DEFAULT NULL::text, p_office_location_id uuid DEFAULT NULL::uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
 AS $function$
 declare
   v_actor uuid;
   v_order_date date;
   v_lunch_day_id uuid;
   v_jamaica_today date := private.jamaica_today_date();
   v_company_deadline timestamptz;
   v_provider_deadline timestamptz;
   v_meal_quantity integer;
   v_items jsonb;
   v_item jsonb;
   v_menu_item_id uuid;
   v_quantity integer;
   v_order_id uuid;
   v_location_id uuid;
   v_location_name text;
   v_location_address text;
   v_special_instructions text;
   v_accepts boolean;
 begin
   v_actor := (select private.current_user_id());

   if v_actor is null then
     raise exception 'Authentication required';
   end if;

   if not (select private.can_view_all_orders()) then
     raise exception 'HR late-order access required';
   end if;

   if not exists (
     select 1
     from public.profiles pr
     where pr.id = p_profile_id
   ) then
     raise exception 'Employee not found';
   end if;

   select lp.accepts_late_orders
   into v_accepts
   from public.lunch_providers lp
   where lp.id = p_provider_id
     and lp.active = true;

   if not coalesce(v_accepts, false) then
     raise exception 'Provider does not accept late orders';
   end if;

   v_order_date := public.order_date_for_delivery_date(p_delivery_date);

   if v_order_date is null then
     raise exception 'Invalid delivery date';
   end if;

   if public.delivery_date_for_order_date(v_order_date) <> p_delivery_date then
     raise exception 'Delivery date does not match order cycle';
   end if;

   perform private.validate_order_date_not_in_finalized_period(v_order_date);

   v_company_deadline := public.order_deadline_for_order_date(v_order_date);

   if now() <= v_company_deadline then
     raise exception 'Normal ordering is still open; use standard ordering';
   end if;

   v_provider_deadline := public.provider_late_order_deadline_at(
     p_provider_id,
     v_order_date,
     p_delivery_date
   );

   if v_provider_deadline is null then
     raise exception 'Provider late-order deadline is not configured';
   end if;

   if now() > v_provider_deadline then
     raise exception 'Provider late-order deadline has passed';
   end if;

   v_lunch_day_id := private.lookup_provider_lunch_day_snapshot(
     p_provider_id,
     v_order_date
   );

   if v_lunch_day_id is null then
     if v_order_date < v_jamaica_today then
       raise exception 'The menu snapshot for this provider and order date is unavailable.';
     elsif v_order_date = v_jamaica_today then
       v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
     else
       raise exception 'The menu snapshot for this provider and order date is unavailable.';
     end if;
   elsif v_order_date = v_jamaica_today then
     v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
   end if;

   v_meal_quantity := private.validate_snapshot_order_payload(v_lunch_day_id, p_items);
   v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

   if jsonb_array_length(v_items) = 0 then
     raise exception 'Order must contain at least one item';
   end if;

   select *
   into v_location_id, v_location_name, v_location_address
   from private.resolve_hr_order_office_location_snapshot(p_office_location_id);

   v_special_instructions :=
     private.normalize_special_instructions(p_special_instructions);

   if length(trim(coalesce(p_special_instructions, ''))) > 0
      and v_special_instructions is null then
     raise exception 'Special instructions are too long';
   end if;

   perform private.activate_bypass_order_deadline();

   insert into public.orders (
     profile_id,
     lunch_day_id,
     meal_quantity,
     office_location_id,
     office_location_name,
     office_location_address,
     special_instructions,
     is_late_order,
     late_order_created_by,
     late_order_approved_at,
     late_order_approved_by
   )
   values (
     p_profile_id,
     v_lunch_day_id,
     v_meal_quantity,
     v_location_id,
     v_location_name,
     v_location_address,
     v_special_instructions,
     true,
     v_actor,
     now(),
     v_actor
   )
   returning id into v_order_id;

   for v_item in
     select value
     from jsonb_array_elements(v_items)
   loop
     begin
       v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
       v_quantity := (v_item ->> 'quantity')::integer;
     exception
       when others then
         raise exception 'Invalid order item';
     end;

     if v_quantity is null or v_quantity <= 0 then
       raise exception 'Quantity must be greater than zero';
     end if;

     insert into public.order_items (
       order_id,
       menu_item_id,
       lunch_day_id,
       quantity
     )
     values (
       v_order_id,
       v_menu_item_id,
       v_lunch_day_id,
       v_quantity
     );
   end loop;

   return v_order_id;
 end;
 $function$;

 CREATE OR REPLACE FUNCTION public.claim_provider_late_order_supplement(p_provider_id uuid, p_scheduled_delivery_date date)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
 AS $function$
 declare
   v_actor uuid;
 begin
   v_actor := (select private.current_user_id());

   if v_actor is null then
     raise exception 'Authentication required';
   end if;

   if not (select private.can_view_all_orders()) then
     raise exception 'HR late-order access required';
   end if;

   return private.claim_provider_late_order_supplement_core(
     p_provider_id,
     p_scheduled_delivery_date,
     'manual',
     v_actor,
     'manual_hr',
     false
   );
 end;
 $function$;

 CREATE OR REPLACE FUNCTION public.finalize_provider_late_order_supplement(p_dispatch_id uuid, p_success boolean, p_error_summary text DEFAULT NULL::text, p_transport_metadata jsonb DEFAULT NULL::jsonb, p_attention_required boolean DEFAULT false)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
 AS $function$
 declare
   v_actor uuid;
 begin
   v_actor := (select private.current_user_id());

   if v_actor is null then
     raise exception 'Authentication required';
   end if;

   if not (select private.can_view_all_orders()) then
     raise exception 'HR late-order access required';
   end if;

   perform private.finalize_provider_late_order_supplement_core(
     p_dispatch_id,
     p_success,
     p_error_summary,
     p_transport_metadata,
     p_attention_required
   );
 end;
 $function$;

 CREATE OR REPLACE FUNCTION public.acknowledge_provider_late_order_dispatch_not_received(p_dispatch_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
 AS $function$
 declare
   v_actor uuid;
 begin
   v_actor := (select private.current_user_id());

   if v_actor is null then
     raise exception 'Authentication required';
   end if;

   if not (select private.can_view_all_orders()) then
     raise exception 'HR late-order access required';
   end if;

   update public.provider_late_order_dispatches
   set status = 'failed',
       error_summary = left(
         'HR confirmed provider did not receive email; retry allowed after provider confirmation.',
         500
       )
   where id = p_dispatch_id
     and status = 'attention_required';

   if not found then
     raise exception 'Dispatch is not awaiting review';
   end if;

   insert into public.provider_late_order_dispatch_reviews (
     dispatch_id,
     resolution,
     resolved_by,
     notes
   )
   values (
     p_dispatch_id,
     'confirmed_not_received',
     v_actor,
     'HR confirmed provider did not receive the supplemental email.'
   );
 end;
 $function$;

 CREATE OR REPLACE FUNCTION public.acknowledge_provider_late_order_dispatch_received(p_dispatch_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
 AS $function$
 declare
   v_actor uuid;
   v_dispatch record;
   v_order_id uuid;
   v_order_ids jsonb;
   v_order_count integer := 0;
 begin
   v_actor := (select private.current_user_id());

   if v_actor is null then
     raise exception 'Authentication required';
   end if;

   if not (select private.can_view_all_orders()) then
     raise exception 'HR late-order access required';
   end if;

   select *
   into v_dispatch
   from public.provider_late_order_dispatches
   where id = p_dispatch_id
     and status = 'attention_required'
   for update;

   if not found then
     raise exception 'Dispatch is not awaiting review';
   end if;

   v_order_ids := coalesce(v_dispatch.message_metadata -> 'order_ids', '[]'::jsonb);
   v_order_count := jsonb_array_length(v_order_ids);

   for v_order_id in
     select value::uuid
     from jsonb_array_elements_text(v_order_ids)
   loop
     if not exists (
       select 1
       from public.orders o
       where o.id = v_order_id
         and o.is_late_order = true
         and o.status = 'submitted'
         and not (select private.late_order_is_dispatched(o.id))
     ) then
       raise exception 'Late order % is no longer eligible for dispatch', v_order_id;
     end if;

     insert into public.provider_late_order_dispatch_orders (
       dispatch_id,
       order_id
     )
     values (
       p_dispatch_id,
       v_order_id
     );
   end loop;

   update public.provider_late_order_dispatches
   set status = 'sent',
       sent_at = coalesce(sent_at, now()),
       error_summary = null
   where id = p_dispatch_id;

   perform private.finalize_automatic_opportunity_for_dispatch(
     p_dispatch_id,
     'sent',
     v_order_count
   );

   insert into public.provider_late_order_dispatch_reviews (
     dispatch_id,
     resolution,
     resolved_by,
     notes
   )
   values (
     p_dispatch_id,
     'confirmed_received',
     v_actor,
     'HR confirmed provider received the supplemental email without resending.'
   );
 end;
 $function$;

 CREATE OR REPLACE FUNCTION public.delete_unused_lunch_provider(p_provider_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
 AS $function$
 begin
   if (select private.current_user_id()) is null then
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
 $function$;

 CREATE OR REPLACE FUNCTION public.delete_unused_office_location(p_office_location_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
 AS $function$
 begin
   if (select private.current_user_id()) is null then
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
 $function$;

 CREATE OR REPLACE FUNCTION public.delete_unused_provider_menu_item(p_provider_id uuid, p_menu_item_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
 AS $function$
 begin
   if (select private.current_user_id()) is null then
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
 $function$;


-- ------------------------------------------------------------
-- RLS: inactive JWT must not self-read application rows
-- ------------------------------------------------------------

drop policy if exists "Users can view their own orders" on public.orders;
create policy "Users can view their own orders"
on public.orders
for select
to authenticated
using (profile_id = (select private.current_user_id()));

drop policy if exists "Users can view their own order items" on public.order_items;
create policy "Users can view their own order items"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.profile_id = (select private.current_user_id())
  )
);

drop policy if exists "Users can view their default office location" on public.office_locations;
create policy "Users can view their default office location"
on public.office_locations
for select
to authenticated
using (
  id = (
    select pr.default_office_location_id
    from public.profiles pr
    where pr.id = (select private.current_user_id())
  )
);
