import { STAFF_SEED } from "./seed-fixtures";
import {
  E2E_HR_PROFILE_ID,
  E2E_STAFF1_OFFICE_LOCATION_ID,
  E2E_STAFF1_PROFILE_ID,
} from "./e2e-ordering-fixture";
import { runLocalDbExec, runLocalDbQuery } from "./e2e-local-db";

export const E2E_DELIVERIES_RAPID_ORDER_IDS = [
  "e2e00001-0001-4001-8001-000000000001",
  "e2e00002-0002-4002-8002-000000000002",
  "e2e00003-0003-4003-8003-000000000003",
  "e2e00004-0004-4004-8004-000000000004",
] as const;

const E2E_DELIVERIES_RAPID_GROUP_IDS = [
  "e2e00011-0001-4011-8011-000000000011",
  "e2e00012-0002-4012-8022-000000000012",
  "e2e00013-0003-4013-8033-000000000013",
  "e2e00014-0004-4014-8044-000000000014",
] as const;

const STAFF_PROFILE_IDS = [
  E2E_STAFF1_PROFILE_ID,
  "10000005-0005-4005-8005-000000000005",
  "10000006-0006-4006-8006-000000000006",
  E2E_STAFF1_PROFILE_ID,
] as const;

export function applyAdminDeliveriesRapidReconciliationFixture(): void {
  runLocalDbExec(`
    do $$
    declare
      v_delivery_date date := private.jamaica_today_date();
      v_order_date date;
      v_lunch_day_id uuid;
      v_main_menu_id uuid;
      v_side_menu_id uuid;
      v_location public.office_locations%rowtype;
      v_i integer;
      v_order_id uuid;
      v_profile_id uuid;
      v_group_id uuid;
    begin
      if extract(isodow from v_delivery_date) >= 6 then
        raise exception 'Deliveries reconciliation fixture requires a Jamaica weekday';
      end if;

      select *
      into v_location
      from public.office_locations
      where id = '${E2E_STAFF1_OFFICE_LOCATION_ID}'::uuid;

      v_order_date := public.order_date_for_delivery_date(v_delivery_date, v_location.id);
      if v_order_date is null then
        raise exception 'No order date maps to Jamaica today delivery date';
      end if;

      if v_order_date = private.jamaica_today_date() then
        perform public.materialize_provider_snapshots_for_order_date(v_order_date);
      end if;

      v_lunch_day_id := private.ensure_provider_lunch_day(
        '${STAFF_SEED.providerAlberries}'::uuid,
        v_order_date
      );

      select mi.id
      into v_main_menu_id
      from public.menu_items mi
      join public.provider_menu_items pmi on pmi.id = mi.provider_menu_item_id
      where mi.lunch_day_id = v_lunch_day_id
        and pmi.item_type = 'main'
      order by mi.name
      limit 1;

      select mi.id
      into v_side_menu_id
      from public.menu_items mi
      join public.provider_menu_items pmi on pmi.id = mi.provider_menu_item_id
      where mi.lunch_day_id = v_lunch_day_id
        and pmi.item_type = 'side'
      order by mi.name
      limit 1;

      if v_main_menu_id is null or v_side_menu_id is null then
        raise exception 'Alberries snapshot menu missing for Jamaica today after materialization';
      end if;

      perform private.activate_bypass_order_deadline();

      delete from public.order_delivery_events
      where order_id in (
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[0]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[1]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[2]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[3]}'::uuid
      );

      delete from public.order_items
      where order_id in (
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[0]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[1]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[2]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[3]}'::uuid
      );

      delete from public.orders
      where id in (
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[0]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[1]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[2]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[3]}'::uuid
      );

      delete from public.order_items oi
      using public.orders o
      join public.lunch_days ld on ld.id = o.lunch_day_id
      where oi.order_id = o.id
        and ld.lunch_date = v_delivery_date
        and ld.provider_id = '${STAFF_SEED.providerAlberries}'::uuid
        and o.delivery_state = 'pending'
        and o.id not in (
          '${E2E_DELIVERIES_RAPID_ORDER_IDS[0]}'::uuid,
          '${E2E_DELIVERIES_RAPID_ORDER_IDS[1]}'::uuid,
          '${E2E_DELIVERIES_RAPID_ORDER_IDS[2]}'::uuid,
          '${E2E_DELIVERIES_RAPID_ORDER_IDS[3]}'::uuid
        );

      delete from public.orders o
      using public.lunch_days ld
      where o.lunch_day_id = ld.id
        and ld.lunch_date = v_delivery_date
        and ld.provider_id = '${STAFF_SEED.providerAlberries}'::uuid
        and o.delivery_state = 'pending'
        and o.id not in (
          '${E2E_DELIVERIES_RAPID_ORDER_IDS[0]}'::uuid,
          '${E2E_DELIVERIES_RAPID_ORDER_IDS[1]}'::uuid,
          '${E2E_DELIVERIES_RAPID_ORDER_IDS[2]}'::uuid,
          '${E2E_DELIVERIES_RAPID_ORDER_IDS[3]}'::uuid
        );

      delete from public.order_items
      where order_id in (
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[0]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[1]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[2]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[3]}'::uuid
      );

      delete from public.orders
      where id in (
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[0]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[1]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[2]}'::uuid,
        '${E2E_DELIVERIES_RAPID_ORDER_IDS[3]}'::uuid
      );

      for v_i in 1..4 loop
        v_order_id := (array[
          '${E2E_DELIVERIES_RAPID_ORDER_IDS[0]}'::uuid,
          '${E2E_DELIVERIES_RAPID_ORDER_IDS[1]}'::uuid,
          '${E2E_DELIVERIES_RAPID_ORDER_IDS[2]}'::uuid,
          '${E2E_DELIVERIES_RAPID_ORDER_IDS[3]}'::uuid
        ])[v_i];
        v_profile_id := (array[
          '${STAFF_PROFILE_IDS[0]}'::uuid,
          '${STAFF_PROFILE_IDS[1]}'::uuid,
          '${STAFF_PROFILE_IDS[2]}'::uuid,
          '${STAFF_PROFILE_IDS[3]}'::uuid
        ])[v_i];
        v_group_id := (array[
          '${E2E_DELIVERIES_RAPID_GROUP_IDS[0]}'::uuid,
          '${E2E_DELIVERIES_RAPID_GROUP_IDS[1]}'::uuid,
          '${E2E_DELIVERIES_RAPID_GROUP_IDS[2]}'::uuid,
          '${E2E_DELIVERIES_RAPID_GROUP_IDS[3]}'::uuid
        ])[v_i];

        insert into public.orders (
          id,
          profile_id,
          lunch_day_id,
          status,
          delivery_state,
          financial_disposition,
          is_late_order,
          special_instructions,
          meal_quantity,
          office_location_id,
          office_location_name,
          office_location_address,
          order_group_id,
          created_at,
          updated_at
        )
        values (
          v_order_id,
          v_profile_id,
          v_lunch_day_id,
          'submitted',
          'pending',
          'chargeable',
          false,
          'E2E rapid deliveries reconciliation ' || v_i::text,
          1,
          v_location.id,
          v_location.name,
          v_location.address,
          v_group_id,
          now(),
          now()
        );

        insert into public.order_items (order_id, menu_item_id, lunch_day_id, quantity, unit_price)
        values
          (v_order_id, v_main_menu_id, v_lunch_day_id, 1, 10),
          (v_order_id, v_side_menu_id, v_lunch_day_id, 1, 5);
      end loop;
    end;
    $$;
  `);
}

export function restoreAdminDeliveriesRapidReconciliationFixture(): void {
  const orderIdList = E2E_DELIVERIES_RAPID_ORDER_IDS.map((id) => `'${id}'::uuid`).join(", ");

  runLocalDbExec(`
    delete from public.order_delivery_events where order_id in (${orderIdList})
  `);
  runLocalDbExec(`
    delete from public.order_items where order_id in (${orderIdList})
  `);
  runLocalDbExec(`
    delete from public.orders where id in (${orderIdList})
  `);
}

export function countDeliveredRapidReconciliationOrders(): number {
  const rows = runLocalDbQuery(`
    select count(*)::integer as c
    from public.orders
    where id in (
      '${E2E_DELIVERIES_RAPID_ORDER_IDS[0]}'::uuid,
      '${E2E_DELIVERIES_RAPID_ORDER_IDS[1]}'::uuid,
      '${E2E_DELIVERIES_RAPID_ORDER_IDS[2]}'::uuid,
      '${E2E_DELIVERIES_RAPID_ORDER_IDS[3]}'::uuid
    )
      and delivery_state = 'delivered'
      and status = 'fulfilled';
  `);

  return Number(rows[0]?.c ?? 0);
}

export function assertDeliveriesFixtureEnvironment(): void {
  if (!E2E_HR_PROFILE_ID) {
    throw new Error("Missing HR profile id for deliveries fixture");
  }
}
