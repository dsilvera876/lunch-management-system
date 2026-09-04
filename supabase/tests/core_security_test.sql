begin;

select plan(6);

select has_table(
  'public',
  'profiles',
  'profiles table exists'
);

select has_table(
  'public',
  'lunch_days',
  'lunch_days table exists'
);

select has_table(
  'public',
  'menu_items',
  'menu_items table exists'
);

select has_table(
  'public',
  'orders',
  'orders table exists'
);

select has_table(
  'public',
  'order_items',
  'order_items table exists'
);

select results_eq(
  $$
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'profiles',
        'lunch_days',
        'menu_items',
        'orders',
        'order_items'
      )
      and c.relrowsecurity = true
  $$,
  array[5::bigint],
  'RLS is enabled on all five application tables'
);

select * from finish();

rollback;