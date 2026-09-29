-- HR cancellation of incomplete signup requests (audit-retained, non-destructive).

alter table private.signup_requests
  drop constraint if exists signup_requests_status_check;

alter table private.signup_requests
  add constraint signup_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled'));

alter table private.signup_requests
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancellation_reason text
    check (
      cancellation_reason is null
      or cancellation_reason in (
        'incorrect_email',
        'duplicate_request',
        'no_longer_needed',
        'other'
      )
    ),
  add column if not exists cancellation_note text;

create or replace function private.signup_email_has_auth_identity(p_normalized_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users au
    where private.normalize_signup_email(au.email::text) = p_normalized_email
  );
$$;

revoke all on function private.signup_email_has_auth_identity(text)
  from public, anon, authenticated;

create or replace function private.cancel_email_deliveries_for_signup_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.email_delivery_queue q
  set
    status = 'failed',
    last_error = 'Cancelled: signup request cancelled.',
    text_body = '[redacted: signup cancelled]',
    html_body = '[redacted: signup cancelled]'
  where q.status in ('pending', 'processing')
    and q.correlation_type = 'signup_request'
    and q.correlation_id = p_request_id;
end;
$$;

revoke all on function private.cancel_email_deliveries_for_signup_request(uuid)
  from public, anon, authenticated;

create or replace function public.cancel_signup_request(
  p_request_id uuid,
  p_reason text,
  p_note text default null
)
returns table (
  success boolean,
  outcome_code text,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row private.signup_requests%rowtype;
  v_reason text;
  v_note text;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_signup_requests()) then
    raise exception 'Signup request management access required';
  end if;

  v_reason := nullif(btrim(p_reason), '');
  v_note := nullif(btrim(p_note), '');

  if v_reason is null
     or v_reason not in (
       'incorrect_email',
       'duplicate_request',
       'no_longer_needed',
       'other'
     ) then
    return query
    select
      false,
      'invalid_reason'::text,
      'A valid cancellation reason is required.'::text;
    return;
  end if;

  select *
  into v_row
  from private.signup_requests sr
  where sr.id = p_request_id
  for update;

  if not found then
    return query
    select false, 'not_found'::text, 'Signup request not found.'::text;
    return;
  end if;

  if v_row.status = 'cancelled' then
    return query
    select true, 'already_cancelled'::text, 'Signup request is already cancelled.'::text;
    return;
  end if;

  if v_row.status = 'rejected' then
    return query
    select false, 'not_cancellable'::text, 'Rejected signup requests cannot be cancelled.'::text;
    return;
  end if;

  if v_row.created_profile_id is not null then
    return query
    select
      false,
      'completed'::text,
      'This signup request is already linked to a user account.'::text;
    return;
  end if;

  if v_row.status <> 'pending'
     and not (v_row.status = 'approved' and v_row.created_profile_id is null) then
    return query
    select false, 'not_cancellable'::text, 'This signup request cannot be cancelled.'::text;
    return;
  end if;

  if private.signup_email_has_auth_identity(v_row.normalized_email) then
    return query
    select
      false,
      'auth_account_exists'::text,
      'An account has already been created for this email. Manage or remove the account from User Management instead.'::text;
    return;
  end if;

  perform private.cancel_email_deliveries_for_signup_request(p_request_id);

  update private.signup_requests sr
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = v_actor,
    cancellation_reason = v_reason,
    cancellation_note = v_note
  where sr.id = p_request_id;

  return query
  select true, 'cancelled'::text, 'Signup request cancelled.'::text;
end;
$$;

revoke execute on function public.cancel_signup_request(uuid, text, text) from public, anon;
grant execute on function public.cancel_signup_request(uuid, text, text) to authenticated;

create or replace function public.mark_signup_request_approved(
  p_request_id uuid,
  p_employee_id text default null
)
returns table (
  request_id uuid,
  email text,
  full_name text,
  normalized_email text,
  status text,
  created_profile_id uuid,
  requested_employee_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row private.signup_requests%rowtype;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_signup_requests()) then
    raise exception 'Signup request management access required';
  end if;

  select *
  into v_row
  from private.signup_requests sr
  where sr.id = p_request_id;

  if not found then
    raise exception 'Signup request not found';
  end if;

  if v_row.status = 'rejected' then
    raise exception 'Signup request was rejected';
  end if;

  if v_row.status = 'cancelled' then
    raise exception 'Signup request was cancelled';
  end if;

  perform private.assert_valid_staff_employee_id(p_employee_id);

  perform private.assert_signup_employee_id_available(
    p_employee_id,
    v_row.created_profile_id
  );

  if v_row.status = 'pending' then
    update private.signup_requests sr
    set
      status = 'approved',
      reviewed_at = now(),
      reviewed_by = v_actor,
      requested_employee_id = coalesce(p_employee_id, sr.requested_employee_id),
      rejection_reason = null
    where sr.id = p_request_id
    returning * into v_row;
  elsif v_row.status = 'approved' then
    if p_employee_id is not null
       and v_row.requested_employee_id is distinct from p_employee_id then
      update private.signup_requests sr
      set requested_employee_id = p_employee_id
      where sr.id = p_request_id
      returning * into v_row;
    end if;
  end if;

  return query
  select
    v_row.id,
    v_row.email,
    v_row.full_name,
    v_row.normalized_email,
    v_row.status,
    v_row.created_profile_id,
    v_row.requested_employee_id;
end;
$$;

create or replace function public.request_external_signup(
  p_full_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_normalized text;
  v_domain text;
  v_request_id uuid;
begin
  v_name := nullif(btrim(p_full_name), '');
  v_normalized := private.normalize_signup_email(p_email);

  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_name');
  end if;

  if v_normalized is null
     or v_normalized !~ '^[^@]+@[^@]+\.[^@]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;

  v_domain := private.extract_signup_email_domain(v_normalized);

  if v_domain is not null
     and private.is_active_company_signup_domain(v_domain) then
    return jsonb_build_object('ok', false, 'code', 'company_email');
  end if;

  if private.signup_email_has_application_account(v_normalized) then
    return jsonb_build_object(
      'ok', false,
      'code', 'unavailable',
      'message', 'This email address cannot be used for a new access request.'
    );
  end if;

  if exists (
    select 1
    from private.signup_requests sr
    where sr.normalized_email = v_normalized
      and sr.status = 'pending'
  ) then
    return jsonb_build_object('ok', true, 'code', 'already_pending');
  end if;

  if exists (
    select 1
    from private.signup_requests sr
    where sr.normalized_email = v_normalized
      and sr.status = 'approved'
      and sr.created_profile_id is null
  ) then
    return jsonb_build_object('ok', true, 'code', 'already_approved');
  end if;

  insert into private.signup_requests (
    email,
    normalized_email,
    full_name,
    status
  )
  values (
    v_normalized,
    v_normalized,
    v_name,
    'pending'
  )
  returning id into v_request_id;

  return jsonb_build_object('ok', true, 'code', 'submitted', 'request_id', v_request_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'code', 'already_pending');
end;
$$;

drop function if exists public.search_signup_requests(text, text, integer, integer);

create or replace function public.search_signup_requests(
  p_search text default null,
  p_status text default 'pending',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  request_id uuid,
  full_name text,
  email text,
  status text,
  requested_at timestamptz,
  requested_employee_id text,
  created_profile_id uuid,
  invite_sent_at timestamptz,
  invite_last_error text,
  cancelled_at timestamptz,
  cancellation_reason text,
  cancellation_note text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text;
  v_limit integer;
  v_offset integer;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_signup_requests()) then
    raise exception 'Signup request management access required';
  end if;

  if p_status is not null
     and p_status not in ('pending', 'approved', 'rejected', 'cancelled') then
    raise exception 'Invalid status filter';
  end if;

  v_search := nullif(btrim(p_search), '');
  v_limit := greatest(coalesce(p_limit, 50), 1);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  with filtered as (
    select
      sr.id as request_id,
      sr.full_name,
      sr.email,
      sr.status,
      sr.requested_at,
      sr.requested_employee_id,
      sr.created_profile_id,
      sr.invite_sent_at,
      sr.invite_last_error,
      sr.cancelled_at,
      sr.cancellation_reason,
      sr.cancellation_note
    from private.signup_requests sr
    where (p_status is null or sr.status = p_status)
      and (
        v_search is null
        or sr.full_name ilike '%' || v_search || '%'
        or sr.email ilike '%' || v_search || '%'
      )
  )
  select
    f.request_id,
    f.full_name,
    f.email,
    f.status,
    f.requested_at,
    f.requested_employee_id,
    f.created_profile_id,
    f.invite_sent_at,
    f.invite_last_error,
    f.cancelled_at,
    f.cancellation_reason,
    f.cancellation_note,
    count(*) over () as total_count
  from filtered f
  order by f.requested_at desc, f.email
  limit v_limit
  offset v_offset;
end;
$$;

revoke execute on function public.search_signup_requests(text, text, integer, integer)
  from public, anon;
grant execute on function public.search_signup_requests(text, text, integer, integer)
  to authenticated;

drop function if exists public.get_signup_request(uuid);

create or replace function public.get_signup_request(p_request_id uuid)
returns table (
  request_id uuid,
  full_name text,
  email text,
  status text,
  requested_at timestamptz,
  requested_employee_id text,
  created_profile_id uuid,
  invite_sent_at timestamptz,
  invite_last_error text,
  cancelled_at timestamptz,
  cancellation_reason text,
  cancellation_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_worker_service_caller()) then
    if (select private.current_user_id()) is null then
      raise exception 'Authentication required';
    end if;

    if not (select private.can_manage_signup_requests()) then
      raise exception 'Signup request management access required';
    end if;
  end if;

  return query
  select
    sr.id as request_id,
    sr.full_name,
    sr.email,
    sr.status,
    sr.requested_at,
    sr.requested_employee_id,
    sr.created_profile_id,
    sr.invite_sent_at,
    sr.invite_last_error,
    sr.cancelled_at,
    sr.cancellation_reason,
    sr.cancellation_note
  from private.signup_requests sr
  where sr.id = p_request_id;
end;
$$;

revoke execute on function public.get_signup_request(uuid) from public, anon;
grant execute on function public.get_signup_request(uuid) to authenticated;
grant execute on function public.get_signup_request(uuid) to service_role;

create or replace function private.lookup_user_import_signup_request(p_normalized_email text)
returns table (
  request_id uuid,
  status text,
  created_profile_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    sr.id,
    sr.status,
    sr.created_profile_id
  from private.signup_requests sr
  where sr.normalized_email = p_normalized_email
    and sr.status <> 'cancelled'
  order by sr.requested_at desc
  limit 1;
$$;

create or replace function public.authorize_rejected_signup_for_bulk_import(
  p_request_id uuid,
  p_employee_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row private.signup_requests%rowtype;
begin
  v_actor := (select private.current_user_id());

  if not (select private.is_worker_service_caller())
     and not (select private.can_manage_user_import()) then
    raise exception 'Bulk user import access required';
  end if;

  select *
  into v_row
  from private.signup_requests sr
  where sr.id = p_request_id
  for update;

  if not found then
    raise exception 'Signup request not found';
  end if;

  perform private.assert_valid_staff_employee_id(p_employee_id);
  perform private.assert_signup_employee_id_available(
    p_employee_id,
    v_row.created_profile_id
  );

  if v_row.status = 'cancelled' then
    raise exception 'Cancelled signup requests cannot be reopened; create a new onboarding request';
  end if;

  if v_row.status = 'rejected' then
    update private.signup_requests sr
    set
      status = 'approved',
      prior_rejection_reason = sr.rejection_reason,
      rejection_reason = null,
      reviewed_at = now(),
      reviewed_by = coalesce(v_actor, sr.reviewed_by),
      approval_source = 'bulk_import',
      requested_employee_id = coalesce(p_employee_id, sr.requested_employee_id)
    where sr.id = p_request_id
    returning * into v_row;
  elsif v_row.status = 'pending' then
    update private.signup_requests sr
    set
      status = 'approved',
      reviewed_at = now(),
      reviewed_by = coalesce(v_actor, sr.reviewed_by),
      approval_source = 'bulk_import',
      requested_employee_id = coalesce(p_employee_id, sr.requested_employee_id)
    where sr.id = p_request_id
    returning * into v_row;
  elsif v_row.status = 'approved' then
    if p_employee_id is not null then
      update private.signup_requests sr
      set requested_employee_id = p_employee_id
      where sr.id = p_request_id;
    end if;
  else
    raise exception 'Unsupported signup request state';
  end if;

  return p_request_id;
end;
$$;

create or replace function public.ensure_signup_request_for_bulk_import(
  p_email text,
  p_full_name text,
  p_employee_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized text;
  v_existing uuid;
  v_existing_status text;
  v_id uuid;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  v_normalized := private.normalize_signup_email(p_email);

  select sr.id, sr.status
  into v_existing, v_existing_status
  from private.signup_requests sr
  where sr.normalized_email = v_normalized
    and sr.status <> 'cancelled'
  order by sr.requested_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into private.signup_requests (
    email,
    normalized_email,
    full_name,
    status,
    reviewed_at,
    approval_source,
    requested_employee_id
  )
  values (
    v_normalized,
    v_normalized,
    btrim(p_full_name),
    'approved',
    now(),
    'bulk_import',
    p_employee_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function private.classify_user_import_row(
  p_row_number integer,
  p_full_name text,
  p_email text,
  p_employee_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_normalized text;
  v_profile record;
  v_signup record;
  v_owner uuid;
begin
  v_name := nullif(btrim(p_full_name), '');
  v_normalized := private.normalize_signup_email(p_email);

  if v_name is null then
    return jsonb_build_object(
      'row_number', p_row_number,
      'classification', 'error',
      'action_code', 'error',
      'preview_message', 'Full name is required.',
      'blocking', true
    );
  end if;

  if v_normalized is null or v_normalized !~ '^[^@]+@[^@]+\.[^@]+$' then
    return jsonb_build_object(
      'row_number', p_row_number,
      'classification', 'error',
      'action_code', 'error',
      'preview_message', 'Email address is invalid.',
      'blocking', true
    );
  end if;

  if p_employee_id is not null and p_employee_id !~ '^[0-9]{4}$' then
    return jsonb_build_object(
      'row_number', p_row_number,
      'classification', 'error',
      'action_code', 'error',
      'preview_message', 'Employee ID must be exactly four digits (for example, 0054).',
      'blocking', true
    );
  end if;

  select *
  into v_profile
  from private.lookup_user_import_profile(v_normalized) l;

  if v_profile.profile_id is not null then
    if v_profile.account_status = 'inactive' then
      return jsonb_build_object(
        'row_number', p_row_number,
        'classification', 'existing_inactive',
        'action_code', 'skip_inactive',
        'preview_message', 'Existing inactive user — review required. Reactivate through Users before importing.',
        'blocking', false,
        'profile_id', v_profile.profile_id
      );
    end if;

    if v_profile.role in ('owner', 'admin', 'accounts', 'hr') then
      return jsonb_build_object(
        'row_number', p_row_number,
        'classification', 'existing_privileged',
        'action_code', 'update_existing',
        'preview_message', format('Existing %s user — update profile; preserve role.', v_profile.role),
        'blocking', false,
        'profile_id', v_profile.profile_id
      );
    end if;

    return jsonb_build_object(
      'row_number', p_row_number,
      'classification', 'existing_active',
      'action_code', 'update_existing',
      'preview_message', 'Existing active user — update profile only.',
      'blocking', false,
      'profile_id', v_profile.profile_id
    );
  end if;

  select *
  into v_signup
  from private.lookup_user_import_signup_request(v_normalized) l;

  if v_signup.request_id is not null then
    if v_signup.status = 'pending' then
      return jsonb_build_object(
        'row_number', p_row_number,
        'classification', 'pending_signup',
        'action_code', 'approve_and_invite',
        'preview_message', 'Pending signup request — approve + create + invite.',
        'blocking', false,
        'signup_request_id', v_signup.request_id
      );
    end if;

    if v_signup.status = 'approved' and v_signup.created_profile_id is null then
      return jsonb_build_object(
        'row_number', p_row_number,
        'classification', 'approved_incomplete',
        'action_code', 'resume_invite',
        'preview_message', 'Approved signup — resume invitation.',
        'blocking', false,
        'signup_request_id', v_signup.request_id
      );
    end if;

    if v_signup.status = 'rejected' then
      return jsonb_build_object(
        'row_number', p_row_number,
        'classification', 'previously_rejected',
        'action_code', 'authorize_and_invite',
        'preview_message', 'Previously rejected — import will authorize + create + invite.',
        'blocking', false,
        'signup_request_id', v_signup.request_id
      );
    end if;
  end if;

  if private.is_active_company_signup_domain(
    private.extract_signup_email_domain(v_normalized)
  ) then
    return jsonb_build_object(
      'row_number', p_row_number,
      'classification', 'new_company',
      'action_code', 'create_and_invite',
      'preview_message', 'New user — create Staff account + invite.',
      'blocking', false
    );
  end if;

  return jsonb_build_object(
    'row_number', p_row_number,
    'classification', 'new_external',
    'action_code', 'create_and_invite',
    'preview_message', 'New external user — HR import approval + create + invite.',
    'blocking', false
  );
end;
$$;
