-- Shared active office locations for ordering tests.
-- Safe within BEGIN/ROLLBACK test transactions only.

reset role;

insert into public.office_locations (
  id,
  name,
  description,
  address,
  is_active
)
values (
  'f0000000-0000-4000-8000-000000000001',
  'Test Office 1',
  'Primary test location',
  '100 Test Street',
  true
)
on conflict (id) do nothing;

insert into public.office_locations (
  id,
  name,
  description,
  address,
  is_active
)
values (
  'f0000000-0000-4000-8000-000000000002',
  'Test Office 2',
  'Secondary test location',
  '200 Test Avenue',
  true
)
on conflict (id) do nothing;
