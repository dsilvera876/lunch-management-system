-- Restrict signup domain listing to Admin/Owner (same as domain management).

drop function if exists private.can_view_signup_email_domains();

create or replace function public.list_signup_email_domains()
returns table (
  domain text,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_auth_settings()) then
    raise exception 'Authentication settings management access required';
  end if;

  return query
  select sed.domain, sed.active, sed.created_at, sed.updated_at
  from private.signup_email_domains sed
  order by sed.domain asc;
end;
$$;
