-- HR bulk user import (Phase 1 launch/migration tool).

alter table private.signup_requests
  add column if not exists approval_source text
    check (approval_source is null or approval_source in ('external_request', 'hr_approval', 'bulk_import')),
  add column if not exists prior_rejection_reason text;

create table private.user_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'processing', 'completed', 'failed')),
  total_rows integer not null default 0 check (total_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  succeeded_rows integer not null default 0 check (succeeded_rows >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  completed_at timestamptz
);

create table private.user_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references private.user_import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  full_name text not null,
  email text not null,
  normalized_email text not null,
  employee_id text,
  classification text not null,
  preview_message text not null,
  action_code text not null,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'processing', 'succeeded', 'skipped', 'failed')),
  profile_id uuid references public.profiles(id) on delete set null,
  signup_request_id uuid,
  result_message text,
  claimed_at timestamptz,
  processed_at timestamptz,
  constraint user_import_rows_employee_id_format_check
    check (employee_id is null or employee_id ~ '^[0-9]{4}$'),
  constraint user_import_rows_batch_row_unique unique (batch_id, row_number)
);

create index user_import_batches_status_idx
  on private.user_import_batches (status, created_at desc);

create index user_import_rows_batch_status_idx
  on private.user_import_rows (batch_id, status, row_number);

revoke all on table private.user_import_batches from public, anon, authenticated;
revoke all on table private.user_import_rows from public, anon, authenticated;

create or replace function private.can_manage_user_import()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr']);
$$;

revoke all on function private.can_manage_user_import() from public, anon, authenticated;
grant execute on function private.can_manage_user_import() to authenticated;

create or replace function private.lookup_user_import_profile(p_normalized_email text)
returns table (
  profile_id uuid,
  full_name text,
  role text,
  account_status text,
  employee_id text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    p.role,
    p.account_status,
    sr.employee_id
  from public.profiles p
  inner join auth.users au on au.id = p.id
  left join private.staff_registry sr on sr.profile_id = p.id
  where private.normalize_signup_email(au.email::text) = p_normalized_email
  limit 1;
$$;

revoke all on function private.lookup_user_import_profile(text) from public, anon, authenticated;

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
  order by sr.requested_at desc
  limit 1;
$$;

revoke all on function private.lookup_user_import_signup_request(text) from public, anon, authenticated;

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

revoke all on function private.classify_user_import_row(integer, text, text, text) from public, anon, authenticated;

create or replace function public.validate_user_import_rows(p_rows jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_row_number integer;
  v_name text;
  v_email text;
  v_employee_id text;
  v_normalized text;
  v_class jsonb;
  v_results jsonb := '[]'::jsonb;
  v_profile_id uuid;
  v_owner uuid;
  v_blocking boolean := false;
  v_summary jsonb;
begin
  if not (select private.can_manage_user_import()) then
    raise exception 'Bulk user import access required';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Invalid import rows payload';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'CSV contains no data rows';
  end if;

  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'CSV exceeds the maximum of 2000 rows';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_row_number := (v_row ->> 'row_number')::integer;
    v_name := v_row ->> 'full_name';
    v_email := v_row ->> 'email';
    v_employee_id := nullif(btrim(v_row ->> 'employee_id'), '');
    v_normalized := private.normalize_signup_email(v_email);

    v_class := private.classify_user_import_row(
      v_row_number,
      v_name,
      v_email,
      v_employee_id
    );

    v_class := v_class || jsonb_build_object(
      'full_name', v_name,
      'email', v_email,
      'employee_id', v_employee_id
    );

    v_results := v_results || jsonb_build_array(v_class);
  end loop;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_normalized := private.normalize_signup_email(v_row ->> 'email');
    v_row_number := (v_row ->> 'row_number')::integer;

    if v_normalized is not null and (
      select count(*)
      from jsonb_array_elements(p_rows) other
      where private.normalize_signup_email(other ->> 'email') = v_normalized
    ) > 1 then
      v_results := (
        select jsonb_agg(
          case
            when (e ->> 'row_number')::integer = v_row_number then
              jsonb_build_object(
                'row_number', v_row_number,
                'classification', 'error',
                'action_code', 'error',
                'preview_message', 'Duplicate email address in CSV.',
                'blocking', true,
                'full_name', e ->> 'full_name',
                'email', e ->> 'email',
                'employee_id', e ->> 'employee_id'
              )
            else e
          end
        )
        from jsonb_array_elements(v_results) e
      );
      v_blocking := true;
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_employee_id := nullif(btrim(v_row ->> 'employee_id'), '');
    v_row_number := (v_row ->> 'row_number')::integer;

    exit when v_employee_id is null;

    if (
      select count(*)
      from jsonb_array_elements(p_rows) other
      where nullif(btrim(other ->> 'employee_id'), '') = v_employee_id
    ) > 1 then
      v_results := (
        select jsonb_agg(
          case
            when (e ->> 'row_number')::integer = v_row_number then
              jsonb_build_object(
                'row_number', v_row_number,
                'classification', 'error',
                'action_code', 'error',
                'preview_message', format('Duplicate Employee ID %s in CSV.', v_employee_id),
                'blocking', true,
                'full_name', e ->> 'full_name',
                'email', e ->> 'email',
                'employee_id', e ->> 'employee_id'
              )
            else e
          end
        )
        from jsonb_array_elements(v_results) e
      );
      v_blocking := true;
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_employee_id := nullif(btrim(v_row ->> 'employee_id'), '');
    v_row_number := (v_row ->> 'row_number')::integer;
    v_normalized := private.normalize_signup_email(v_row ->> 'email');

    exit when v_employee_id is null;

    select sr.profile_id
    into v_owner
    from private.staff_registry sr
    where sr.employee_id = v_employee_id
    limit 1;

    select l.profile_id
    into v_profile_id
    from private.lookup_user_import_profile(v_normalized) l;

    if v_owner is not null and v_owner is distinct from v_profile_id then
      v_results := (
        select jsonb_agg(
          case
            when (e ->> 'row_number')::integer = v_row_number then
              jsonb_build_object(
                'row_number', v_row_number,
                'classification', 'error',
                'action_code', 'error',
                'preview_message', format('Employee ID %s is already assigned to another user.', v_employee_id),
                'blocking', true
              )
            else e
          end
        )
        from jsonb_array_elements(v_results) e
      );
      v_blocking := true;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(v_results) e
    where coalesce((e ->> 'blocking')::boolean, false)
  ) then
    v_blocking := true;
  end if;

  v_summary := jsonb_build_object(
    'total_rows', jsonb_array_length(p_rows),
    'new_users', (
      select count(*) from jsonb_array_elements(v_results) e
      where e ->> 'classification' in ('new_company', 'new_external', 'pending_signup', 'approved_incomplete', 'previously_rejected')
    ),
    'existing_users', (
      select count(*) from jsonb_array_elements(v_results) e
      where e ->> 'classification' in ('existing_active', 'existing_privileged')
    ),
    'existing_inactive', (
      select count(*) from jsonb_array_elements(v_results) e
      where e ->> 'classification' = 'existing_inactive'
    ),
    'onboarding_resumes', (
      select count(*) from jsonb_array_elements(v_results) e
      where e ->> 'classification' in ('pending_signup', 'approved_incomplete', 'previously_rejected')
    ),
    'errors', (
      select count(*) from jsonb_array_elements(v_results) e
      where e ->> 'classification' = 'error'
    ),
    'blocking_errors', v_blocking
  );

  return jsonb_build_object(
    'summary', v_summary,
    'rows', v_results,
    'can_confirm', not v_blocking
  );
end;
$$;

revoke execute on function public.validate_user_import_rows(jsonb) from public, anon;
grant execute on function public.validate_user_import_rows(jsonb) to authenticated;

create or replace function public.create_user_import_batch(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_validation jsonb;
  v_batch_id uuid;
  v_row jsonb;
  v_input jsonb;
  v_class jsonb;
  v_normalized text;
begin
  v_actor := (select private.current_user_id());

  if not (select private.can_manage_user_import()) then
    raise exception 'Bulk user import access required';
  end if;

  v_validation := public.validate_user_import_rows(p_rows);

  insert into private.user_import_batches (
    created_by,
    status,
    total_rows
  )
  values (
    v_actor,
    'draft',
    jsonb_array_length(p_rows)
  )
  returning id into v_batch_id;

  for v_input in select value from jsonb_array_elements(p_rows)
  loop
    v_class := (
      select e
      from jsonb_array_elements(v_validation -> 'rows') e
      where (e ->> 'row_number')::integer = (v_input ->> 'row_number')::integer
      limit 1
    );

    v_normalized := private.normalize_signup_email(v_input ->> 'email');

    insert into private.user_import_rows (
      batch_id,
      row_number,
      full_name,
      email,
      normalized_email,
      employee_id,
      classification,
      preview_message,
      action_code,
      status,
      profile_id,
      signup_request_id
    )
    values (
      v_batch_id,
      (v_input ->> 'row_number')::integer,
      btrim(v_input ->> 'full_name'),
      btrim(v_input ->> 'email'),
      v_normalized,
      nullif(btrim(v_input ->> 'employee_id'), ''),
      v_class ->> 'classification',
      v_class ->> 'preview_message',
      v_class ->> 'action_code',
      'draft',
      nullif(v_class ->> 'profile_id', '')::uuid,
      nullif(v_class ->> 'signup_request_id', '')::uuid
    );
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'validation', v_validation
  );
end;
$$;

revoke execute on function public.create_user_import_batch(jsonb) from public, anon;
grant execute on function public.create_user_import_batch(jsonb) to authenticated;

create or replace function public.confirm_user_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch private.user_import_batches%rowtype;
  v_revalidation jsonb;
  v_payload jsonb := '[]'::jsonb;
begin
  if not (select private.can_manage_user_import()) then
    raise exception 'Bulk user import access required';
  end if;

  select *
  into v_batch
  from private.user_import_batches b
  where b.id = p_batch_id
  for update;

  if not found then
    raise exception 'Import batch not found';
  end if;

  if v_batch.status <> 'draft' then
    raise exception 'Import batch is not in draft status';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'row_number', r.row_number,
      'full_name', r.full_name,
      'email', r.email,
      'employee_id', r.employee_id
    )
    order by r.row_number
  )
  into v_payload
  from private.user_import_rows r
  where r.batch_id = p_batch_id;

  v_revalidation := public.validate_user_import_rows(v_payload);

  if coalesce((v_revalidation -> 'summary' ->> 'blocking_errors')::boolean, false) then
    raise exception 'Import batch failed revalidation';
  end if;

  update private.user_import_rows r
  set status = case
    when r.classification = 'existing_inactive' then 'skipped'
    when r.classification = 'error' then 'failed'
    else 'queued'
  end
  where r.batch_id = p_batch_id;

  update private.user_import_batches b
  set
    status = 'queued',
    confirmed_at = now(),
    skipped_rows = (
      select count(*) from private.user_import_rows r
      where r.batch_id = p_batch_id and r.status = 'skipped'
    )
  where b.id = p_batch_id;

  return jsonb_build_object('ok', true, 'batch_id', p_batch_id);
end;
$$;

revoke execute on function public.confirm_user_import_batch(uuid) from public, anon;
grant execute on function public.confirm_user_import_batch(uuid) to authenticated;

create or replace function public.get_user_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch private.user_import_batches%rowtype;
  v_rows jsonb;
begin
  if not (select private.can_manage_user_import()) then
    raise exception 'Bulk user import access required';
  end if;

  select *
  into v_batch
  from private.user_import_batches b
  where b.id = p_batch_id;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'row_number', r.row_number,
      'full_name', r.full_name,
      'email', r.email,
      'employee_id', r.employee_id,
      'classification', r.classification,
      'preview_message', r.preview_message,
      'status', r.status,
      'result_message', r.result_message
    )
    order by r.row_number
  ), '[]'::jsonb)
  into v_rows
  from private.user_import_rows r
  where r.batch_id = p_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch.id,
    'status', v_batch.status,
    'total_rows', v_batch.total_rows,
    'processed_rows', v_batch.processed_rows,
    'succeeded_rows', v_batch.succeeded_rows,
    'skipped_rows', v_batch.skipped_rows,
    'failed_rows', v_batch.failed_rows,
    'created_at', v_batch.created_at,
    'confirmed_at', v_batch.confirmed_at,
    'completed_at', v_batch.completed_at,
    'rows', v_rows
  );
end;
$$;

revoke execute on function public.get_user_import_batch(uuid) from public, anon;
grant execute on function public.get_user_import_batch(uuid) to authenticated;

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

revoke execute on function public.authorize_rejected_signup_for_bulk_import(uuid, text) from public, anon;
grant execute on function public.authorize_rejected_signup_for_bulk_import(uuid, text) to authenticated;
grant execute on function public.authorize_rejected_signup_for_bulk_import(uuid, text) to service_role;

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
  v_id uuid;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  v_normalized := private.normalize_signup_email(p_email);

  select sr.id
  into v_existing
  from private.signup_requests sr
  where sr.normalized_email = v_normalized
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

revoke execute on function public.ensure_signup_request_for_bulk_import(text, text, text) from public, anon, authenticated;
grant execute on function public.ensure_signup_request_for_bulk_import(text, text, text) to service_role;

create or replace function public.worker_claim_user_import_rows(p_limit integer default 5)
returns setof private.user_import_rows
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  update private.user_import_batches b
  set status = 'processing'
  where b.id in (
    select distinct r.batch_id
    from private.user_import_rows r
    where r.status = 'queued'
  )
  and b.status = 'queued';

  return query
  with candidates as (
    select r.id
    from private.user_import_rows r
    inner join private.user_import_batches b on b.id = r.batch_id
    where r.status = 'queued'
      and b.status in ('queued', 'processing')
      and r.claimed_at is null
    order by b.confirmed_at nulls last, r.row_number
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 25))
  )
  update private.user_import_rows r
  set
    status = 'processing',
    claimed_at = now()
  from candidates c
  where r.id = c.id
  returning r.*;
end;
$$;

revoke execute on function public.worker_claim_user_import_rows(integer) from public, anon, authenticated;
grant execute on function public.worker_claim_user_import_rows(integer) to service_role;

create or replace function public.worker_complete_user_import_row(
  p_row_id uuid,
  p_outcome text,
  p_profile_id uuid default null,
  p_signup_request_id uuid default null,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.user_import_rows%rowtype;
  v_batch_id uuid;
  v_remaining integer;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  select *
  into v_row
  from private.user_import_rows r
  where r.id = p_row_id
  for update;

  if not found then
    raise exception 'Import row not found';
  end if;

  v_batch_id := v_row.batch_id;

  update private.user_import_rows r
  set
    status = case p_outcome
      when 'succeeded' then 'succeeded'
      when 'skipped' then 'skipped'
      else 'failed'
    end,
    profile_id = coalesce(p_profile_id, r.profile_id),
    signup_request_id = coalesce(p_signup_request_id, r.signup_request_id),
    result_message = nullif(btrim(p_message), ''),
    processed_at = now()
  where r.id = p_row_id;

  update private.user_import_batches b
  set
    processed_rows = (
      select count(*) from private.user_import_rows r
      where r.batch_id = v_batch_id
        and r.status in ('succeeded', 'skipped', 'failed')
    ),
    succeeded_rows = (
      select count(*) from private.user_import_rows r
      where r.batch_id = v_batch_id and r.status = 'succeeded'
    ),
    skipped_rows = (
      select count(*) from private.user_import_rows r
      where r.batch_id = v_batch_id and r.status = 'skipped'
    ),
    failed_rows = (
      select count(*) from private.user_import_rows r
      where r.batch_id = v_batch_id and r.status = 'failed'
    )
  where b.id = v_batch_id;

  select count(*)
  into v_remaining
  from private.user_import_rows r
  where r.batch_id = v_batch_id
    and r.status in ('queued', 'processing', 'draft');

  if v_remaining = 0 then
    update private.user_import_batches b
    set
      status = 'completed',
      completed_at = now()
    where b.id = v_batch_id;
  end if;
end;
$$;

revoke execute on function public.worker_complete_user_import_row(uuid, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.worker_complete_user_import_row(uuid, text, uuid, uuid, text) to service_role;

create or replace function public.service_apply_user_import_profile_update(
  p_import_row_id uuid,
  p_full_name text,
  p_employee_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.user_import_rows%rowtype;
  v_name text;
  v_email text;
  v_registry_id uuid;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  select *
  into v_row
  from private.user_import_rows r
  where r.id = p_import_row_id
  for update;

  if not found or v_row.status <> 'processing' then
    raise exception 'Import row is not processing';
  end if;

  if v_row.profile_id is null then
    raise exception 'Import row has no profile reference';
  end if;

  v_name := nullif(btrim(p_full_name), '');

  if v_name is not null then
    update public.profiles p
    set full_name = v_name
    where p.id = v_row.profile_id;
  end if;

  if p_employee_id is not null then
    perform private.assert_valid_staff_employee_id(p_employee_id);
    perform private.assert_signup_employee_id_available(p_employee_id, v_row.profile_id);

    select nullif(btrim(au.email::text), '')
    into v_email
    from auth.users au
    where au.id = v_row.profile_id;

    select sr.id
    into v_registry_id
    from private.staff_registry sr
    where sr.profile_id = v_row.profile_id
    for update;

    perform set_config('app.employee_id_change_source', 'bulk_user_import', true);

    if v_registry_id is null then
      insert into private.staff_registry (profile_id, email, employee_id)
      values (v_row.profile_id, v_email, p_employee_id);
    else
      update private.staff_registry sr
      set employee_id = p_employee_id
      where sr.id = v_registry_id;
    end if;
  end if;

  return v_row.profile_id;
end;
$$;

revoke execute on function public.service_apply_user_import_profile_update(uuid, text, text) from public, anon, authenticated;
grant execute on function public.service_apply_user_import_profile_update(uuid, text, text) to service_role;

create or replace function public.service_set_employee_id_for_bulk_import(
  p_profile_id uuid,
  p_employee_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_registry_id uuid;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  perform private.assert_valid_staff_employee_id(p_employee_id);
  perform private.assert_signup_employee_id_available(p_employee_id, p_profile_id);

  select nullif(btrim(au.email::text), '')
  into v_email
  from auth.users au
  where au.id = p_profile_id;

  select sr.id
  into v_registry_id
  from private.staff_registry sr
  where sr.profile_id = p_profile_id
  for update;

  perform set_config('app.employee_id_change_source', 'bulk_user_import', true);

  if v_registry_id is null then
    insert into private.staff_registry (profile_id, email, employee_id)
    values (p_profile_id, v_email, p_employee_id);
  else
    update private.staff_registry sr
    set employee_id = p_employee_id
    where sr.id = v_registry_id;
  end if;
end;
$$;

grant execute on function public.service_set_employee_id_for_bulk_import(uuid, text) to service_role;

grant execute on function public.get_signup_request(uuid) to service_role;
grant execute on function public.link_signup_request_profile(uuid, uuid, text) to service_role;
