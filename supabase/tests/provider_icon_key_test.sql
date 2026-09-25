begin;

select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'c1111111-1111-4111-8111-111111111111',
  'provider-icon-admin@test.local',
  '{"full_name":"Provider Icon Admin"}'
);

reset role;
select private.apply_profile_role('c1111111-1111-4111-8111-111111111111', 'admin');

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'c1111111-1111-4111-8111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$
    insert into public.lunch_providers (id, name, active)
    values (
      'c2111111-1111-4111-8111-111111111111',
      'Default Icon Provider',
      true
    )
  $$,
  'New provider gets default icon_key'
);

select is(
  (select icon_key from public.lunch_providers where id = 'c2111111-1111-4111-8111-111111111111'),
  'utensils',
  'Default icon_key is utensils'
);

select lives_ok(
  $$
    update public.lunch_providers
    set icon_key = 'fruit'
    where id = 'c2111111-1111-4111-8111-111111111111'
  $$,
  'Admin can set a supported icon_key'
);

select throws_ok(
  $$
    update public.lunch_providers
    set icon_key = 'custom-svg'
    where id = 'c2111111-1111-4111-8111-111111111111'
  $$,
  '23514',
  null,
  'Unsupported icon_key is rejected by check constraint'
);

select * from finish();

rollback;
