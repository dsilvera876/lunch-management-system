-- Fix bulk import regression: blank Employee ID must remain optional (28280000
-- reintroduced strict ^[0-9]{4}$ check on raw input instead of bulk-import helpers).

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

  if private.is_bulk_import_employee_id_invalid(p_employee_id) then
    return jsonb_build_object(
      'row_number', p_row_number,
      'classification', 'error',
      'action_code', 'error',
      'preview_message', 'Employee ID must contain only digits (up to four).',
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
