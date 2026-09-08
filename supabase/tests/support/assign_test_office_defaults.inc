-- Assign test default delivery location after auth.users/profile fixtures exist.

\ir office_location_fixture.inc

reset role;

select private.activate_trusted_profile_default_location();

update public.profiles
set default_office_location_id = 'f0000000-0000-4000-8000-000000000001'
where default_office_location_id is null;
