-- Fix bulk import row insert when CSV supplies a malformed Employee ID:
-- classification may mark the row as an error, but the raw value must not
-- violate user_import_rows_employee_id_format_check on insert.

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

    v_employee_id := nullif(btrim(v_input ->> 'employee_id'), '');
    if v_employee_id is not null and v_employee_id !~ '^[0-9]{4}$' then
      v_employee_id := null;
    end if;

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
