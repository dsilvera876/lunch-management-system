-- Permanent deletion of clean user accounts (Admin/Owner only).

-- ------------------------------------------------------------
-- Business history guard
-- ------------------------------------------------------------

create or replace function private.user_has_business_history(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.orders o
      where o.profile_id = p_profile_id
    )
    or exists (
      select 1
      from public.orders o
      where o.late_order_created_by = p_profile_id
         or o.late_order_approved_by = p_profile_id
    )
    or exists (
      select 1
      from public.provider_late_order_dispatches d
      where d.created_by = p_profile_id
    )
    or exists (
      select 1
      from public.provider_late_order_dispatch_reviews r
      where r.resolved_by = p_profile_id
    )
    or exists (
      select 1
      from public.order_delivery_events e
      where e.actor_id = p_profile_id
    );
$$;

revoke all on function private.user_has_business_history(uuid) from public, anon, authenticated;

create or replace function private.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if not (select private.trusted_role_change_active()) then
      if old.role = 'owner' then
        raise exception 'Owner role can only change through ownership transfer';
      end if;

      raise exception 'Role changes must use assign_user_role or transfer_ownership';
    end if;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      raise exception 'Owner profile cannot be deleted';
    end if;

    if (select private.user_has_business_history(old.id)) then
      raise exception 'Profile with business history cannot be deleted';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

-- ------------------------------------------------------------
-- Deletion audit (survives profile removal)
-- ------------------------------------------------------------

create table private.user_account_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  deleted_profile_id uuid not null,
  normalized_email text not null,
  previous_role text not null,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now(),
  reason_category text not null
    check (reason_category in ('test_account', 'duplicate_error', 'other')),
  reason_note text
);

create index user_account_deletion_audit_deleted_at_idx
  on private.user_account_deletion_audit (deleted_at desc);

revoke all on table private.user_account_deletion_audit from public, anon, authenticated;

-- ------------------------------------------------------------
-- Identity cleanup helpers
-- ------------------------------------------------------------

create or replace function private.cancel_email_deliveries_for_account_deletion(
  p_profile_id uuid,
  p_normalized_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.email_delivery_queue q
  set
    status = 'failed',
    last_error = 'Cancelled: account permanently deleted.',
    text_body = '[redacted: account deleted]',
    html_body = '[redacted: account deleted]'
  where q.status in ('pending', 'processing')
    and (
      lower(btrim(q.recipient_email)) = p_normalized_email
      or (
        q.correlation_type = 'signup_request'
        and q.correlation_id in (
          select sr.id
          from private.signup_requests sr
          where sr.created_profile_id = p_profile_id
             or sr.normalized_email = p_normalized_email
        )
      )
    );
end;
$$;

revoke all on function private.cancel_email_deliveries_for_account_deletion(uuid, text)
  from public, anon, authenticated;

create or replace function private.cleanup_identity_records_for_account_deletion(
  p_profile_id uuid,
  p_normalized_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cancel_email_deliveries_for_account_deletion(
    p_profile_id,
    p_normalized_email
  );

  delete from private.staff_registry sr
  where sr.profile_id = p_profile_id;

  delete from private.signup_requests sr
  where sr.created_profile_id = p_profile_id
     or sr.normalized_email = p_normalized_email;
end;
$$;

revoke all on function private.cleanup_identity_records_for_account_deletion(uuid, text)
  from public, anon, authenticated;

create or replace function public.worker_should_deliver_email_queue_message(p_queue_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row private.email_delivery_queue;
  v_email text;
begin
  select *
  into v_row
  from private.email_delivery_queue q
  where q.id = p_queue_id;

  if not found then
    return false;
  end if;

  v_email := lower(btrim(v_row.recipient_email));

  if v_row.correlation_type = 'signup_request'
     and v_row.correlation_id is not null then
    if not exists (
      select 1
      from private.signup_requests sr
      where sr.id = v_row.correlation_id
        and sr.status = 'approved'
    ) then
      return false;
    end if;
  end if;

  if v_row.message_type in ('auth_hook', 'account_setup_invite')
     and v_row.correlation_type is distinct from 'signup_request' then
    if not private.signup_email_has_application_account(v_email)
       and not exists (
         select 1
         from private.signup_requests sr
         where sr.normalized_email = v_email
           and sr.status = 'approved'
       ) then
      return false;
    end if;
  end if;

  return true;
end;
$$;

revoke execute on function public.worker_should_deliver_email_queue_message(uuid)
  from public, anon, authenticated;
grant execute on function public.worker_should_deliver_email_queue_message(uuid) to service_role;

-- ------------------------------------------------------------
-- Eligibility (Admin/Owner)
-- ------------------------------------------------------------

create or replace function public.get_user_deletion_eligibility(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role text;
  v_blockers jsonb := '[]'::jsonb;
  v_summary text;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_roles()) then
    raise exception 'Role management access required';
  end if;

  if p_profile_id is null then
    return jsonb_build_object(
      'profile_id', null,
      'can_delete', false,
      'blocker_codes', jsonb_build_array('not_found'),
      'blocker_summary', 'User not found.'
    );
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = p_profile_id;

  if v_role is null then
    return jsonb_build_object(
      'profile_id', p_profile_id,
      'can_delete', false,
      'blocker_codes', jsonb_build_array('not_found'),
      'blocker_summary', 'User not found.'
    );
  end if;

  if p_profile_id = v_actor then
    v_blockers := v_blockers || jsonb_build_array('self');
  end if;

  if v_role = 'owner' then
    v_blockers := v_blockers || jsonb_build_array('owner_target');
  end if;

  if (select private.user_has_business_history(p_profile_id)) then
    v_blockers := v_blockers || jsonb_build_array('business_history');
  end if;

  if jsonb_array_length(v_blockers) > 0 then
    v_summary := case
      when v_blockers @> '["self"]'::jsonb then
        'You cannot delete your own account.'
      when v_blockers @> '["owner_target"]'::jsonb then
        'This Owner account must be transferred before it can be deleted.'
      when v_blockers @> '["business_history"]'::jsonb then
        'This account has lunch history and cannot be permanently deleted. HR should deactivate the account instead.'
      else
        'This account cannot be permanently deleted.'
    end;

    return jsonb_build_object(
      'profile_id', p_profile_id,
      'can_delete', false,
      'blocker_codes', v_blockers,
      'blocker_summary', v_summary
    );
  end if;

  return jsonb_build_object(
    'profile_id', p_profile_id,
    'can_delete', true,
    'blocker_codes', '[]'::jsonb,
    'blocker_summary', null
  );
end;
$$;

revoke execute on function public.get_user_deletion_eligibility(uuid) from public, anon;
grant execute on function public.get_user_deletion_eligibility(uuid) to authenticated;

-- ------------------------------------------------------------
-- Application-side permanent delete (profile row; Auth via server)
-- ------------------------------------------------------------

create or replace function public.permanently_delete_user_account(
  p_profile_id uuid,
  p_reason_category text,
  p_reason_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role text;
  v_email text;
  v_normalized text;
  v_category text;
  v_note text;
  v_eligibility jsonb;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_roles()) then
    raise exception 'Role management access required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
  ) then
    if exists (
      select 1
      from private.user_account_deletion_audit a
      where a.deleted_profile_id = p_profile_id
    ) then
      return jsonb_build_object(
        'ok', true,
        'profile_id', p_profile_id,
        'normalized_email', coalesce(
          (
            select a.normalized_email
            from private.user_account_deletion_audit a
            where a.deleted_profile_id = p_profile_id
            order by a.deleted_at desc
            limit 1
          ),
          ''
        ),
        'already_deleted', true
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'User not found.'
    );
  end if;

  v_eligibility := public.get_user_deletion_eligibility(p_profile_id);

  if coalesce((v_eligibility ->> 'can_delete')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'ineligible',
      'message', v_eligibility ->> 'blocker_summary'
    );
  end if;

  v_category := lower(btrim(p_reason_category));
  if v_category not in ('test_account', 'duplicate_error', 'other') then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_reason',
      'message', 'Choose a valid deletion reason.'
    );
  end if;

  v_note := nullif(btrim(p_reason_note), '');

  select p.role, private.normalize_signup_email(au.email::text)
  into v_role, v_normalized
  from public.profiles p
  inner join auth.users au on au.id = p.id
  where p.id = p_profile_id;

  if v_role is null then
    if exists (
      select 1
      from private.user_account_deletion_audit a
      where a.deleted_profile_id = p_profile_id
    ) then
      return jsonb_build_object(
        'ok', true,
        'profile_id', p_profile_id,
        'normalized_email', coalesce(
          (
            select a.normalized_email
            from private.user_account_deletion_audit a
            where a.deleted_profile_id = p_profile_id
            order by a.deleted_at desc
            limit 1
          ),
          ''
        ),
        'already_deleted', true
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'User not found.'
    );
  end if;

  if v_normalized is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'User not found.'
    );
  end if;

  v_email := v_normalized;

  perform private.cleanup_identity_records_for_account_deletion(
    p_profile_id,
    v_normalized
  );

  insert into private.user_account_deletion_audit (
    deleted_profile_id,
    normalized_email,
    previous_role,
    deleted_by,
    reason_category,
    reason_note
  )
  values (
    p_profile_id,
    v_normalized,
    v_role,
    v_actor,
    v_category,
    v_note
  );

  delete from public.profiles p
  where p.id = p_profile_id;

  return jsonb_build_object(
    'ok', true,
    'profile_id', p_profile_id,
    'normalized_email', v_normalized
  );
exception
  when others then
    if sqlerrm like 'Profile with business history cannot be deleted%' then
      return jsonb_build_object(
        'ok', false,
        'code', 'business_history',
        'message', 'This account has lunch history and cannot be permanently deleted. HR should deactivate the account instead.'
      );
    end if;

    if sqlerrm like 'Owner profile cannot be deleted%' then
      return jsonb_build_object(
        'ok', false,
        'code', 'owner_target',
        'message', 'This Owner account must be transferred before it can be deleted.'
      );
    end if;

    raise;
end;
$$;

revoke execute on function public.permanently_delete_user_account(uuid, text, text)
  from public, anon;
grant execute on function public.permanently_delete_user_account(uuid, text, text) to authenticated;
