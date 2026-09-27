-- Admin-managed authentication domains and email delivery settings.

create extension if not exists supabase_vault with schema vault;

-- ------------------------------------------------------------
-- Authorization helpers
-- ------------------------------------------------------------

create or replace function private.can_manage_auth_settings()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['admin', 'owner']);
$$;

revoke all on function private.can_manage_auth_settings() from public;
grant execute on function private.can_manage_auth_settings() to authenticated;

create or replace function private.can_view_signup_email_domains()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr', 'admin', 'owner']);
$$;

revoke all on function private.can_view_signup_email_domains() from public;
grant execute on function private.can_view_signup_email_domains() to authenticated;

-- ------------------------------------------------------------
-- Domain normalization
-- ------------------------------------------------------------

create or replace function private.normalize_signup_email_domain(p_domain text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_domain text;
begin
  if p_domain is null then
    return null;
  end if;

  v_domain := lower(btrim(p_domain));
  v_domain := regexp_replace(v_domain, '^https?://', '');
  v_domain := regexp_replace(v_domain, '/.*$', '');
  v_domain := regexp_replace(v_domain, '^@+', '');

  if v_domain = '' or v_domain ~ '\s' or v_domain ~ '@' then
    return null;
  end if;

  if v_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
    return null;
  end if;

  return v_domain;
end;
$$;

revoke all on function private.normalize_signup_email_domain(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Domain audit
-- ------------------------------------------------------------

create table if not exists private.signup_email_domain_audit (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  action text not null
    check (action in ('added', 'enabled', 'disabled')),
  previous_active boolean,
  new_active boolean,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index signup_email_domain_audit_changed_at_idx
  on private.signup_email_domain_audit (changed_at desc);

revoke all on table private.signup_email_domain_audit from public, anon, authenticated;

-- ------------------------------------------------------------
-- Domain RPCs
-- ------------------------------------------------------------

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

  if not (select private.can_view_signup_email_domains()) then
    raise exception 'Signup domain visibility access required';
  end if;

  return query
  select sed.domain, sed.active, sed.created_at, sed.updated_at
  from private.signup_email_domains sed
  order by sed.domain asc;
end;
$$;

revoke execute on function public.list_signup_email_domains() from public, anon;
grant execute on function public.list_signup_email_domains() to authenticated;

create or replace function public.add_signup_email_domain(p_domain text)
returns table (
  domain text,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
  v_actor uuid;
  v_previous_active boolean;
  v_existed boolean;
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

  v_actor := private.current_user_id();
  v_existed := false;

  select sed.active
  into v_previous_active
  from private.signup_email_domains sed
  where sed.domain = v_domain;

  if found then
    v_existed := true;
  end if;

  if v_existed then
    if v_previous_active then
      return query
      select sed.domain, sed.active, sed.created_at, sed.updated_at
      from private.signup_email_domains sed
      where sed.domain = v_domain;
      return;
    end if;

    update private.signup_email_domains sed
    set active = true,
        updated_at = now()
    where sed.domain = v_domain;

    insert into private.signup_email_domain_audit (
      domain,
      action,
      previous_active,
      new_active,
      changed_by
    )
    values (v_domain, 'enabled', v_previous_active, true, v_actor);
  else
    insert into private.signup_email_domains (domain, active)
    values (v_domain, true);

    insert into private.signup_email_domain_audit (
      domain,
      action,
      previous_active,
      new_active,
      changed_by
    )
    values (v_domain, 'added', null, true, v_actor);
  end if;

  return query
  select sed.domain, sed.active, sed.created_at, sed.updated_at
  from private.signup_email_domains sed
  where sed.domain = v_domain;
end;
$$;

revoke execute on function public.add_signup_email_domain(text) from public, anon;
grant execute on function public.add_signup_email_domain(text) to authenticated;

create or replace function public.set_signup_email_domain_active(
  p_domain text,
  p_active boolean
)
returns table (
  domain text,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
  v_previous boolean;
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
  into v_previous
  from private.signup_email_domains sed
  where sed.domain = v_domain;

  if not found then
    raise exception 'Email domain not found';
  end if;

  if v_previous is not distinct from p_active then
    return query
    select sed.domain, sed.active, sed.created_at, sed.updated_at
    from private.signup_email_domains sed
    where sed.domain = v_domain;
    return;
  end if;

  v_actor := private.current_user_id();

  update private.signup_email_domains sed
  set active = p_active,
      updated_at = now()
  where sed.domain = v_domain;

  insert into private.signup_email_domain_audit (
    domain,
    action,
    previous_active,
    new_active,
    changed_by
  )
  values (
    v_domain,
    case when p_active then 'enabled' else 'disabled' end,
    v_previous,
    p_active,
    v_actor
  );

  return query
  select sed.domain, sed.active, sed.created_at, sed.updated_at
  from private.signup_email_domains sed
  where sed.domain = v_domain;
end;
$$;

revoke execute on function public.set_signup_email_domain_active(text, boolean) from public, anon;
grant execute on function public.set_signup_email_domain_active(text, boolean) to authenticated;

-- ------------------------------------------------------------
-- Email delivery settings
-- ------------------------------------------------------------

create table if not exists private.email_delivery_settings (
  id int primary key default 1 check (id = 1),
  provider_type text not null default 'smtp'
    check (provider_type in ('smtp')),
  provider_name text not null default '',
  smtp_host text not null default '',
  smtp_port int not null default 587
    check (smtp_port > 0 and smtp_port <= 65535),
  smtp_security text not null default 'starttls'
    check (smtp_security in ('tls', 'starttls', 'none')),
  smtp_username text not null default '',
  smtp_password_secret_id uuid,
  from_email text not null default '',
  from_name text not null default '',
  reply_to_email text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  last_test_at timestamptz,
  last_test_status text
    check (last_test_status is null or last_test_status in ('success', 'failure')),
  last_test_error text
);

insert into private.email_delivery_settings (id)
values (1)
on conflict (id) do nothing;

revoke all on table private.email_delivery_settings from public, anon, authenticated;

create table if not exists private.email_delivery_settings_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  field_category text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index email_delivery_settings_audit_changed_at_idx
  on private.email_delivery_settings_audit (changed_at desc);

revoke all on table private.email_delivery_settings_audit from public, anon, authenticated;

create or replace function private.sanitize_email_delivery_error(p_error text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    regexp_replace(
      coalesce(nullif(btrim(p_error), ''), 'Email delivery failed'),
      '(password|secret|token|apikey|authorization|bearer|smtp_pass)[=:][^\s]+',
      '\1=[redacted]',
      'gi'
    ),
    500
  );
$$;

revoke all on function private.sanitize_email_delivery_error(text) from public, anon, authenticated;

create or replace function private.replace_email_smtp_secret(p_secret text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if p_secret is null or btrim(p_secret) = '' then
    return null;
  end if;

  v_secret_id := vault.create_secret(
    btrim(p_secret),
    'email_delivery_smtp_password',
    'Application SMTP credentials'
  );

  return v_secret_id;
end;
$$;

revoke all on function private.replace_email_smtp_secret(text) from public, anon, authenticated;

create or replace function public.get_email_delivery_settings()
returns table (
  provider_type text,
  provider_name text,
  smtp_host text,
  smtp_port int,
  smtp_security text,
  smtp_username text,
  smtp_password_configured boolean,
  from_email text,
  from_name text,
  reply_to_email text,
  enabled boolean,
  updated_at timestamptz,
  last_test_at timestamptz,
  last_test_status text,
  last_test_error text
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
  select
    eds.provider_type,
    eds.provider_name,
    eds.smtp_host,
    eds.smtp_port,
    eds.smtp_security,
    eds.smtp_username,
    eds.smtp_password_secret_id is not null,
    eds.from_email,
    eds.from_name,
    eds.reply_to_email,
    eds.enabled,
    eds.updated_at,
    eds.last_test_at,
    eds.last_test_status,
    eds.last_test_error
  from private.email_delivery_settings eds
  where eds.id = 1;
end;
$$;

revoke execute on function public.get_email_delivery_settings() from public, anon;
grant execute on function public.get_email_delivery_settings() to authenticated;

create or replace function public.update_email_delivery_settings(
  p_provider_type text,
  p_provider_name text,
  p_smtp_host text,
  p_smtp_port int,
  p_smtp_security text,
  p_smtp_username text,
  p_smtp_password text,
  p_from_email text,
  p_from_name text,
  p_reply_to_email text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_old_secret uuid;
  v_new_secret uuid;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_auth_settings()) then
    raise exception 'Authentication settings management access required';
  end if;

  if p_provider_type is distinct from 'smtp' then
    raise exception 'Unsupported email provider type';
  end if;

  if p_smtp_security not in ('tls', 'starttls', 'none') then
    raise exception 'Invalid SMTP security mode';
  end if;

  if p_smtp_port <= 0 or p_smtp_port > 65535 then
    raise exception 'Invalid SMTP port';
  end if;

  v_actor := private.current_user_id();

  select eds.smtp_password_secret_id
  into v_old_secret
  from private.email_delivery_settings eds
  where eds.id = 1
  for update;

  v_new_secret := v_old_secret;

  if p_smtp_password is not null and btrim(p_smtp_password) <> '' then
    v_new_secret := private.replace_email_smtp_secret(p_smtp_password);
    if v_old_secret is not null and v_old_secret <> v_new_secret then
      delete from vault.secrets where id = v_old_secret;
    end if;

    insert into private.email_delivery_settings_audit (action, field_category, changed_by)
    values ('credentials_replaced', 'smtp_password', v_actor);
  end if;

  update private.email_delivery_settings eds
  set
    provider_type = 'smtp',
    provider_name = coalesce(nullif(btrim(p_provider_name), ''), eds.provider_name),
    smtp_host = coalesce(nullif(btrim(p_smtp_host), ''), eds.smtp_host),
    smtp_port = p_smtp_port,
    smtp_security = p_smtp_security,
    smtp_username = coalesce(nullif(btrim(p_smtp_username), ''), eds.smtp_username),
    smtp_password_secret_id = v_new_secret,
    from_email = coalesce(nullif(btrim(p_from_email), ''), eds.from_email),
    from_name = coalesce(nullif(btrim(p_from_name), ''), eds.from_name),
    reply_to_email = nullif(btrim(p_reply_to_email), ''),
    enabled = coalesce(p_enabled, eds.enabled),
    updated_at = now(),
    updated_by = v_actor
  where eds.id = 1;

  insert into private.email_delivery_settings_audit (action, field_category, changed_by)
  values ('settings_updated', 'email_delivery', v_actor);
end;
$$;

revoke execute on function public.update_email_delivery_settings(
  text, text, text, int, text, text, text, text, text, text, boolean
) from public, anon;
grant execute on function public.update_email_delivery_settings(
  text, text, text, int, text, text, text, text, text, text, boolean
) to authenticated;

create or replace function public.record_email_delivery_test_result(
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_auth_settings()) then
    raise exception 'Authentication settings management access required';
  end if;

  v_actor := private.current_user_id();

  update private.email_delivery_settings eds
  set
    last_test_at = now(),
    last_test_status = case when p_success then 'success' else 'failure' end,
    last_test_error = case
      when p_success then null
      else private.sanitize_email_delivery_error(p_error)
    end
  where eds.id = 1;

  insert into private.email_delivery_settings_audit (action, field_category, changed_by)
  values (
    case when p_success then 'test_email_succeeded' else 'test_email_failed' end,
    'test_email',
    v_actor
  );
end;
$$;

revoke execute on function public.record_email_delivery_test_result(boolean, text) from public, anon;
grant execute on function public.record_email_delivery_test_result(boolean, text) to authenticated;

create or replace function public.service_get_email_delivery_runtime()
returns table (
  provider_type text,
  provider_name text,
  smtp_host text,
  smtp_port int,
  smtp_security text,
  smtp_username text,
  smtp_password text,
  from_email text,
  from_name text,
  reply_to_email text,
  enabled boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  select
    eds.provider_type,
    eds.provider_name,
    eds.smtp_host,
    eds.smtp_port,
    eds.smtp_security,
    eds.smtp_username,
    eds.smtp_password_secret_id,
    eds.from_email,
    eds.from_name,
    eds.reply_to_email,
    eds.enabled
  into
    provider_type,
    provider_name,
    smtp_host,
    smtp_port,
    smtp_security,
    smtp_username,
    v_secret_id,
    from_email,
    from_name,
    reply_to_email,
    enabled
  from private.email_delivery_settings eds
  where eds.id = 1;

  smtp_password := null;
  if v_secret_id is not null then
    select ds.decrypted_secret
    into smtp_password
    from vault.decrypted_secrets ds
    where ds.id = v_secret_id;
  end if;

  return next;
end;
$$;

revoke execute on function public.service_get_email_delivery_runtime() from public, anon, authenticated;
grant execute on function public.service_get_email_delivery_runtime() to service_role;
