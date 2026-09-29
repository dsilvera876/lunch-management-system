-- Bulk import Employee ID normalization (spreadsheet-friendly 1–4 digit input).

create or replace function private.is_bulk_import_employee_id_invalid(p_raw text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_raw), '') is not null
    and nullif(btrim(p_raw), '') !~ '^[0-9]{1,4}$';
$$;

revoke all on function private.is_bulk_import_employee_id_invalid(text) from public, anon, authenticated;

create or replace function private.normalize_bulk_import_employee_id(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(btrim(p_raw), '') is null then null
    when nullif(btrim(p_raw), '') !~ '^[0-9]{1,4}$' then null
    else lpad(nullif(btrim(p_raw), ''), 4, '0')
  end;
$$;

revoke all on function private.normalize_bulk_import_employee_id(text) from public, anon, authenticated;

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
  v_employee_id text;
  v_profile record;
  v_signup record;
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

  if private.is_bulk_import_employee_id_invalid(p_employee_id) then
    return jsonb_build_object(
      'row_number', p_row_number,
      'classification', 'error',
      'action_code', 'error',
      'preview_message', 'Employee ID must contain only digits (up to four).',
      'blocking', true
    );
  end if;

  v_employee_id := private.normalize_bulk_import_employee_id(p_employee_id);

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
  v_employee_id_norm text;
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
    v_employee_id_norm := private.normalize_bulk_import_employee_id(v_row ->> 'employee_id');
    v_normalized := private.normalize_signup_email(v_email);

    v_class := private.classify_user_import_row(
      v_row_number,
      v_name,
      v_email,
      v_row ->> 'employee_id'
    );

    v_class := v_class || jsonb_build_object(
      'full_name', v_name,
      'email', v_email,
      'employee_id', v_employee_id_norm
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
    v_employee_id_norm := private.normalize_bulk_import_employee_id(v_row ->> 'employee_id');
    v_row_number := (v_row ->> 'row_number')::integer;

    exit when v_employee_id_norm is null;

    if (
      select count(*)
      from jsonb_array_elements(p_rows) other
      where private.normalize_bulk_import_employee_id(other ->> 'employee_id') = v_employee_id_norm
    ) > 1 then
      v_results := (
        select jsonb_agg(
          case
            when (e ->> 'row_number')::integer = v_row_number then
              jsonb_build_object(
                'row_number', v_row_number,
                'classification', 'error',
                'action_code', 'error',
                'preview_message', format('Duplicate Employee ID %s in CSV.', v_employee_id_norm),
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
    v_employee_id_norm := private.normalize_bulk_import_employee_id(v_row ->> 'employee_id');
    v_row_number := (v_row ->> 'row_number')::integer;
    v_normalized := private.normalize_signup_email(v_row ->> 'email');

    exit when v_employee_id_norm is null;

    select sr.profile_id
    into v_owner
    from private.staff_registry sr
    where sr.employee_id = v_employee_id_norm
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
                'preview_message', format('Employee ID %s is already assigned to another user.', v_employee_id_norm),
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
  v_input jsonb;
  v_class jsonb;
  v_normalized text;
  v_employee_id text;
begin
  v_actor := (select private.current_user_id());

  if not (select private.can_manage_user_import()) then
    raise exception 'Bulk user import access required';
  end if;

  if v_actor is null then
    raise exception 'Authentication required for bulk user import';
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

    if v_class is null then
      v_class := jsonb_build_object(
        'classification', 'error',
        'action_code', 'error',
        'preview_message', 'Row could not be classified during import validation.',
        'blocking', true
      );
    end if;

    v_normalized := private.normalize_signup_email(v_input ->> 'email');
    v_employee_id := private.normalize_bulk_import_employee_id(v_input ->> 'employee_id');

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
      v_employee_id,
      v_class ->> 'classification',
      coalesce(v_class ->> 'preview_message', 'Validation error'),
      coalesce(v_class ->> 'action_code', 'error'),
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
