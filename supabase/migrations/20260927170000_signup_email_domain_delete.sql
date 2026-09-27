-- Allow permanent removal of disabled trusted signup domains with audit trail.

alter table private.signup_email_domain_audit
  drop constraint if exists signup_email_domain_audit_action_check;

alter table private.signup_email_domain_audit
  add constraint signup_email_domain_audit_action_check
  check (action in ('added', 'enabled', 'disabled', 'deleted'));

create or replace function public.delete_signup_email_domain(p_domain text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
  v_active boolean;
  v_actor uuid;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_auth_settings()) then
    raise exception 'Authentication settings management access required';
  end if;

  v_domain := private.normalize_signup_email_domain(p_domain);
  if v_domain is null then
    raise exception 'Invalid email domain';
  end if;

  select sed.active
  into v_active
  from private.signup_email_domains sed
  where sed.domain = v_domain;

  if not found then
    raise exception 'Email domain not found';
  end if;

  if v_active then
    raise exception 'Disable this domain before deleting it.';
  end if;

  v_actor := private.current_user_id();

  insert into private.signup_email_domain_audit (
    domain,
    action,
    previous_active,
    new_active,
    changed_by
  )
  values (v_domain, 'deleted', false, null, v_actor);

  delete from private.signup_email_domains sed
  where sed.domain = v_domain;
end;
$$;

revoke execute on function public.delete_signup_email_domain(text) from public, anon;
grant execute on function public.delete_signup_email_domain(text) to authenticated;
