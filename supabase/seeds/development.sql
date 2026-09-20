-- Local development seed (DEVELOPMENT ONLY — never use in staging/production).
--
-- Development accounts (password for all): LunchTest123!
--   owner@lunch.test, hr@lunch.test, accounts@lunch.test
--   staff1@lunch.test, staff2@lunch.test
--
-- Load with: npx supabase db reset
-- Configured in supabase/config.toml [db.seed] sql_paths.
-- See docs/development-seed.md

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- Helpers (dropped at end of this file)
-- ------------------------------------------------------------

create or replace function private.dev_seed_create_auth_user(
  p_id uuid,
  p_email text,
  p_full_name text,
  p_password text default 'LunchTest123!'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    is_sso_user,
    is_anonymous
  )
  values (
    p_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name),
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    p_id,
    p_id,
    p_id::text,
    jsonb_build_object(
      'sub', p_id::text,
      'email', p_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  )
  on conflict do nothing;
end;
$$;

create or replace function private.dev_seed_extend_lunch_day_deadline(p_lunch_day_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.lunch_days
  set order_deadline = now() + interval '365 days'
  where id = p_lunch_day_id;
$$;

create or replace function private.dev_seed_insert_meal_order(
  p_order_id uuid,
  p_profile_id uuid,
  p_provider_id uuid,
  p_order_date date,
  p_order_group_id uuid,
  p_main_menu_item_id uuid,
  p_side_menu_item_id uuid,
  p_office_location_id uuid,
  p_special_instructions text,
  p_meal_quantity integer default 1,
  p_created_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lunch_day_id uuid;
  v_main_snapshot_id uuid;
  v_side_snapshot_id uuid;
  v_location public.office_locations%rowtype;
begin
  perform private.activate_bypass_order_deadline();
  v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, p_order_date);
  perform private.dev_seed_extend_lunch_day_deadline(v_lunch_day_id);

  select *
  into v_location
  from public.office_locations
  where id = p_office_location_id;

  select mi.id
  into v_main_snapshot_id
  from public.menu_items mi
  where mi.lunch_day_id = v_lunch_day_id
    and mi.provider_menu_item_id = p_main_menu_item_id;

  select mi.id
  into v_side_snapshot_id
  from public.menu_items mi
  where mi.lunch_day_id = v_lunch_day_id
    and mi.provider_menu_item_id = p_side_menu_item_id;

  insert into public.orders (
    id,
    profile_id,
    lunch_day_id,
    status,
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
    p_order_id,
    p_profile_id,
    v_lunch_day_id,
    'submitted',
    p_special_instructions,
    p_meal_quantity,
    v_location.id,
    v_location.name,
    v_location.address,
    p_order_group_id,
    p_created_at,
    p_created_at
  );

  insert into public.order_items (order_id, menu_item_id, quantity)
  values
    (p_order_id, v_main_snapshot_id, p_meal_quantity),
    (p_order_id, v_side_snapshot_id, p_meal_quantity);
end;
$$;

create or replace function private.dev_seed_insert_standalone_order(
  p_order_id uuid,
  p_profile_id uuid,
  p_provider_id uuid,
  p_order_date date,
  p_order_group_id uuid,
  p_menu_item_id uuid,
  p_quantity integer,
  p_office_location_id uuid,
  p_special_instructions text,
  p_created_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lunch_day_id uuid;
  v_snapshot_id uuid;
  v_location public.office_locations%rowtype;
begin
  perform private.activate_bypass_order_deadline();
  v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, p_order_date);
  perform private.dev_seed_extend_lunch_day_deadline(v_lunch_day_id);

  select *
  into v_location
  from public.office_locations
  where id = p_office_location_id;

  select mi.id
  into v_snapshot_id
  from public.menu_items mi
  where mi.lunch_day_id = v_lunch_day_id
    and mi.provider_menu_item_id = p_menu_item_id;

  insert into public.orders (
    id,
    profile_id,
    lunch_day_id,
    status,
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
    p_order_id,
    p_profile_id,
    v_lunch_day_id,
    'submitted',
    p_special_instructions,
    null,
    v_location.id,
    v_location.name,
    v_location.address,
    p_order_group_id,
    p_created_at,
    p_created_at
  );

  insert into public.order_items (order_id, menu_item_id, quantity)
  values (p_order_id, v_snapshot_id, p_quantity);
end;
$$;

create or replace function private.dev_seed_finalize_order(
  p_order_id uuid,
  p_status text,
  p_delivery_state text,
  p_financial_disposition text,
  p_actual_delivery_date date default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders
  set
    status = p_status,
    delivery_state = p_delivery_state,
    financial_disposition = p_financial_disposition,
    actual_delivery_date = p_actual_delivery_date,
    updated_at = now()
  where id = p_order_id;
$$;

-- ------------------------------------------------------------
-- Fixed development identities
-- ------------------------------------------------------------

do $$
begin
  perform private.dev_seed_create_auth_user(
    '10000001-0001-4001-8001-000000000001',
    'owner@lunch.test',
    'Dev Owner'
  );
  perform private.dev_seed_create_auth_user(
    '10000002-0002-4002-8002-000000000002',
    'hr@lunch.test',
    'Dev HR'
  );
  perform private.dev_seed_create_auth_user(
    '10000003-0003-4003-8003-000000000003',
    'accounts@lunch.test',
    'Dev Accounts'
  );
  perform private.dev_seed_create_auth_user(
    '10000004-0004-4004-8004-000000000004',
    'staff1@lunch.test',
    'Dev Staff One'
  );
  perform private.dev_seed_create_auth_user(
    '10000005-0005-4005-8005-000000000005',
    'staff2@lunch.test',
    'Dev Staff Two'
  );
end;
$$;

select private.apply_profile_role('10000001-0001-4001-8001-000000000001', 'owner');
select private.apply_profile_role('10000002-0002-4002-8002-000000000002', 'hr');
select private.apply_profile_role('10000003-0003-4003-8003-000000000003', 'accounts');

update public.app_settings
set
  daily_lunch_subsidy = 500,
  order_cutoff_time = '16:00:00'
where id = 1;

insert into public.office_locations (
  id,
  name,
  description,
  address,
  is_active
)
values
  (
    '20000001-0001-4001-8001-000000000001',
    'Camp Road',
    'Primary development office',
    '12 Camp Road, Kingston',
    true
  ),
  (
    '20000002-0002-4002-8002-000000000002',
    'Office 2',
    'Secondary development office',
    '45 Hope Road, Kingston',
    true
  );

do $$
begin
  perform private.activate_trusted_profile_default_location();
  update public.profiles
  set default_office_location_id = '20000001-0001-4001-8001-000000000001'
  where id in (
    '10000004-0004-4004-8004-000000000004',
    '10000001-0001-4001-8001-000000000001'
  );
  update public.profiles
  set default_office_location_id = '20000002-0002-4002-8002-000000000002'
  where id = '10000005-0005-4005-8005-000000000005';
  perform set_config('app.trusted_profile_default_location', 'false', true);
end;
$$;

insert into public.lunch_providers (
  id,
  name,
  active,
  primary_order_email
)
values
  (
    '30000001-0001-4001-8001-000000000001',
    'Alberries Caterors',
    true,
    'orders-alberries@lunch.test'
  ),
  (
    '30000002-0002-4002-8002-000000000002',
    'Davis Catering',
    true,
    'orders-davis@lunch.test'
  ),
  (
    '30000003-0003-4003-8003-000000000003',
    'Peel Good Food',
    true,
    'orders-peel@lunch.test'
  );

insert into public.provider_menu_items (
  id,
  provider_id,
  name,
  price,
  item_type,
  unit_label,
  display_category,
  active
)
values
  ('31000001-0001-4001-8001-000000000001', '30000001-0001-4001-8001-000000000001', 'BBQ Chicken', 850, 'main', 'Each', 'Mains', true),
  ('31000002-0002-4002-8002-000000000002', '30000001-0001-4001-8001-000000000001', 'Fried Chicken', 850, 'main', 'Each', 'Mains', true),
  ('31000011-0011-4011-8011-000000000011', '30000001-0001-4001-8001-000000000001', 'Plain Rice', 0, 'side', 'Each', 'Sides', true),
  ('31000012-0012-4012-8012-000000000012', '30000001-0001-4001-8001-000000000001', 'Rice and Peas', 0, 'side', 'Each', 'Sides', true),
  ('31000013-0013-4013-8013-000000000013', '30000001-0001-4001-8001-000000000001', 'Steamed Vegetables', 0, 'side', 'Each', 'Sides', true),
  ('31000014-0014-4014-8014-000000000014', '30000001-0001-4001-8001-000000000001', 'Tossed Vegetables', 0, 'side', 'Each', 'Sides', true),
  ('31000021-0021-4021-8021-000000000021', '30000002-0002-4002-8002-000000000002', 'Fried Chicken', 1000, 'main', 'Each', 'Mains', true),
  ('31000022-0022-4022-8022-000000000022', '30000002-0002-4002-8002-000000000002', 'Curried Chicken', 1000, 'main', 'Each', 'Mains', true),
  ('31000031-0031-4031-8031-000000000031', '30000002-0002-4002-8002-000000000002', 'Plain Rice', 0, 'side', 'Each', 'Sides', true),
  ('31000032-0032-4032-8032-000000000032', '30000002-0002-4002-8002-000000000002', 'Rice and Peas', 0, 'side', 'Each', 'Sides', true),
  ('31000033-0033-4033-8033-000000000033', '30000002-0002-4002-8002-000000000002', 'Cran Water', 200, 'standalone', 'Each', 'Drinks', true),
  ('31000034-0034-4034-8034-000000000034', '30000002-0002-4002-8002-000000000002', 'Coconut Water', 250, 'standalone', 'Each', 'Drinks', true),
  ('31000041-0041-4041-8041-000000000041', '30000003-0003-4003-8003-000000000003', 'Banana', 100, 'standalone', 'Each', 'Fruit', true),
  ('31000042-0042-4042-8042-000000000042', '30000003-0003-4003-8003-000000000003', 'Cantaloupe (1 LB)', 300, 'standalone', 'LB', 'Fruit', true),
  ('31000043-0043-4043-8043-000000000043', '30000003-0003-4003-8003-000000000003', 'Red Seedless Grapes (1/4 LB)', 87.50, 'standalone', '1/4 LB', 'Fruit', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select pmi.id, wd.weekday
from public.provider_menu_items pmi
cross join generate_series(1, 5) as wd(weekday);

do $$
declare
  v_jm_today date;
  v_curr_start date;
  v_curr_end date;
  v_prev_start date;
  v_prev_end date;
  v_upcoming_order date;
  v_upcoming_delivery date;
  v_past_delivery date;
  v_past_order date;
  v_prev_period_order date;
  v_cursor date;
  v_i integer;
  v_staff1 uuid := '10000004-0004-4004-8004-000000000004';
  v_staff2 uuid := '10000005-0005-4005-8005-000000000005';
  v_camp uuid := '20000001-0001-4001-8001-000000000001';
  v_alberries uuid := '30000001-0001-4001-8001-000000000001';
  v_davis uuid := '30000002-0002-4002-8002-000000000002';
  v_peel uuid := '30000003-0003-4003-8003-000000000003';
begin
  v_jm_today := (timezone('America/Jamaica', now()))::date;

  v_curr_start := date_trunc('month', v_jm_today::timestamp)::date;
  v_curr_end := (date_trunc('month', v_jm_today::timestamp) + interval '1 month - 1 day')::date;
  v_prev_end := v_curr_start - 1;
  v_prev_start := v_prev_end - 27;

  perform set_config('app.allow_lunch_period_write', 'true', true);
  perform set_config('app.allow_lunch_period_current_change', 'true', true);

  insert into public.lunch_periods (
    id,
    label,
    start_date,
    end_date,
    is_current,
    status,
    created_by,
    updated_by
  )
  values
    (
      '40000001-0001-4001-8001-000000000001',
      'Dev Previous Payroll',
      v_prev_start,
      v_prev_end,
      false,
      'open',
      '10000003-0003-4003-8003-000000000003',
      '10000003-0003-4003-8003-000000000003'
    ),
    (
      '40000002-0002-4002-8002-000000000002',
      'Dev Current Payroll',
      v_curr_start,
      v_curr_end,
      false,
      'open',
      '10000003-0003-4003-8003-000000000003',
      '10000003-0003-4003-8003-000000000003'
    );

  perform set_config('app.allow_lunch_period_write', 'false', true);
  perform set_config('app.allow_lunch_period_current_change', 'false', true);

  v_cursor := v_jm_today;
  v_upcoming_order := null;
  for v_i in 1..21 loop
    if public.iso_weekday(v_cursor) is not null
       and public.delivery_date_for_order_date(v_cursor) > v_jm_today then
      if now() <= public.order_deadline_for_order_date(v_cursor) then
        v_upcoming_order := v_cursor;
        exit;
      elsif v_upcoming_order is null then
        v_upcoming_order := v_cursor;
      end if;
    end if;
    v_cursor := v_cursor + 1;
  end loop;

  if v_upcoming_order is null then
    raise exception 'Unable to derive upcoming order date for development seed';
  end if;

  v_upcoming_delivery := public.delivery_date_for_order_date(v_upcoming_order);

  v_past_delivery := null;
  v_cursor := v_jm_today - 1;
  for v_i in 1..21 loop
    if public.iso_weekday(v_cursor) is not null then
      v_past_delivery := v_cursor;
      exit;
    end if;
    v_cursor := v_cursor - 1;
  end loop;

  if v_past_delivery is null then
    raise exception 'Unable to derive past delivery date for development seed';
  end if;

  v_past_order := public.order_date_for_delivery_date(v_past_delivery);
  v_prev_period_order := greatest(v_prev_start, v_prev_start + ((v_prev_end - v_prev_start) / 2));

  while public.iso_weekday(v_prev_period_order) is null loop
    v_prev_period_order := v_prev_period_order + 1;
  end loop;

  -- Staff 1 upcoming grouped checkout (Alberries meal + Peel fruit)
  perform private.dev_seed_insert_meal_order(
    '60000001-0001-4001-8001-000000000001',
    v_staff1,
    v_alberries,
    v_upcoming_order,
    '50000001-0001-4001-8001-000000000001',
    '31000002-0002-4002-8002-000000000002',
    '31000012-0012-4012-8012-000000000012',
    v_camp,
    'Extra gravy',
    1,
    now() - interval '2 hours'
  );
  perform private.dev_seed_insert_standalone_order(
    '60000002-0002-4002-8002-000000000002',
    v_staff1,
    v_peel,
    v_upcoming_order,
    '50000001-0001-4001-8001-000000000001',
    '31000041-0041-4041-8041-000000000041',
    2,
    v_camp,
    'Green bananas only',
    now() - interval '2 hours'
  );

  -- Staff 1 past delivered multi-provider checkout
  perform private.dev_seed_insert_meal_order(
    '60000003-0003-4003-8003-000000000003',
    v_staff1,
    v_alberries,
    v_past_order,
    '50000002-0002-4002-8002-000000000002',
    '31000001-0001-4001-8001-000000000001',
    '31000011-0011-4011-8011-000000000011',
    v_camp,
    null,
    1,
    now() - interval '8 days'
  );
  perform private.dev_seed_insert_meal_order(
    '60000004-0004-4004-8004-000000000004',
    v_staff1,
    v_davis,
    v_past_order,
    '50000002-0002-4002-8002-000000000002',
    '31000022-0022-4022-8022-000000000022',
    '31000032-0032-4032-8032-000000000032',
    v_camp,
    null,
    1,
    now() - interval '8 days'
  );
  perform private.dev_seed_finalize_order(
    '60000003-0003-4003-8003-000000000003',
    'submitted',
    'delivered',
    'chargeable',
    v_past_delivery
  );
  perform private.dev_seed_finalize_order(
    '60000004-0004-4004-8004-000000000004',
    'submitted',
    'delivered',
    'chargeable',
    v_past_delivery
  );

  -- Two checkouts on the same past delivery date (repeat Alberries)
  perform private.dev_seed_insert_meal_order(
    '60000005-0005-4005-8005-000000000005',
    v_staff1,
    v_alberries,
    v_past_order,
    '50000006-0006-4006-8006-000000000006',
    '31000002-0002-4002-8002-000000000002',
    '31000013-0013-4013-8013-000000000013',
    v_camp,
    null,
    1,
    now() - interval '7 days'
  );
  perform private.dev_seed_finalize_order(
    '60000005-0005-4005-8005-000000000005',
    'submitted',
    'delivered',
    'chargeable',
    v_past_delivery
  );

  perform private.dev_seed_insert_meal_order(
    '60000006-0006-4006-8006-000000000006',
    v_staff1,
    v_alberries,
    v_past_order,
    '50000007-0007-4007-8007-000000000007',
    '31000001-0001-4001-8001-000000000001',
    '31000014-0014-4014-8014-000000000014',
    v_camp,
    null,
    1,
    now() - interval '6 days'
  );
  perform private.dev_seed_finalize_order(
    '60000006-0006-4006-8006-000000000006',
    'submitted',
    'delivered',
    'chargeable',
    v_past_delivery
  );

  -- Cancelled grouped checkouts (3 recent)
  perform private.dev_seed_insert_meal_order(
    '60000007-0007-4007-8007-000000000007',
    v_staff1,
    v_alberries,
    v_past_order,
    '50000003-0003-4003-8003-000000000003',
    '31000002-0002-4002-8002-000000000002',
    '31000012-0012-4012-8012-000000000012',
    v_camp,
    null,
    1,
    now() - interval '5 days'
  );
  perform private.dev_seed_finalize_order(
    '60000007-0007-4007-8007-000000000007',
    'cancelled',
    'resolved',
    'waived',
    null
  );

  perform private.dev_seed_insert_meal_order(
    '60000008-0008-4008-8008-000000000008',
    v_staff1,
    v_davis,
    v_past_order,
    '50000004-0004-4004-8004-000000000004',
    '31000021-0021-4021-8021-000000000021',
    '31000031-0031-4031-8031-000000000031',
    v_camp,
    null,
    1,
    now() - interval '4 days'
  );
  perform private.dev_seed_finalize_order(
    '60000008-0008-4008-8008-000000000008',
    'cancelled',
    'resolved',
    'waived',
    null
  );

  perform private.dev_seed_insert_standalone_order(
    '60000009-0009-4009-8009-000000000009',
    v_staff1,
    v_peel,
    v_past_order,
    '50000005-0005-4005-8005-000000000005',
    '31000043-0043-4043-8043-000000000043',
    1,
    v_camp,
    null,
    now() - interval '3 days'
  );
  perform private.dev_seed_finalize_order(
    '60000009-0009-4009-8009-000000000009',
    'cancelled',
    'resolved',
    'waived',
    null
  );

  -- Staff 1 spend in previous finalized period
  perform private.dev_seed_insert_meal_order(
    '60000010-0010-4010-8010-000000000010',
    v_staff1,
    v_davis,
    v_prev_period_order,
    '50000008-0008-4008-8008-000000000008',
    '31000021-0021-4021-8021-000000000021',
    '31000032-0032-4032-8032-000000000032',
    v_camp,
    null,
    1,
    now() - interval '40 days'
  );
  perform private.dev_seed_finalize_order(
    '60000010-0010-4010-8010-000000000010',
    'submitted',
    'delivered',
    'chargeable',
    public.delivery_date_for_order_date(v_prev_period_order)
  );

  -- Staff 2 lighter current-period history (subsidy partially used)
  perform private.dev_seed_insert_meal_order(
    '60000011-0011-4011-8011-000000000011',
    v_staff2,
    v_alberries,
    v_past_order,
    '50000009-0009-4009-8009-000000000009',
    '31000002-0002-4002-8002-000000000002',
    '31000012-0012-4012-8012-000000000012',
    '20000002-0002-4002-8002-000000000002',
    null,
    1,
    now() - interval '6 days'
  );
  perform private.dev_seed_finalize_order(
    '60000011-0011-4011-8011-000000000011',
    'submitted',
    'delivered',
    'chargeable',
    v_past_delivery
  );

  perform set_config('app.allow_lunch_period_write', 'true', true);
  update public.lunch_periods
  set
    status = 'finalized',
    finalized_daily_subsidy = 500,
    updated_by = '10000003-0003-4003-8003-000000000003'
  where id = '40000001-0001-4001-8001-000000000001';

  perform set_config('app.allow_lunch_period_current_change', 'true', true);
  update public.lunch_periods
  set
    is_current = false,
    updated_by = '10000003-0003-4003-8003-000000000003'
  where is_current = true;
  update public.lunch_periods
  set
    is_current = true,
    updated_by = '10000003-0003-4003-8003-000000000003'
  where id = '40000002-0002-4002-8002-000000000002';

  perform set_config('app.allow_lunch_period_write', 'false', true);
  perform set_config('app.allow_lunch_period_current_change', 'false', true);
end;
$$;

drop function if exists private.dev_seed_finalize_order(uuid, text, text, text, date);
drop function if exists private.dev_seed_insert_standalone_order(
  uuid, uuid, uuid, date, uuid, uuid, integer, uuid, text, timestamptz
);
drop function if exists private.dev_seed_insert_meal_order(
  uuid, uuid, uuid, date, uuid, uuid, uuid, uuid, text, integer, timestamptz
);
drop function if exists private.dev_seed_extend_lunch_day_deadline(uuid);
drop function if exists private.dev_seed_create_auth_user(uuid, text, text, text);
