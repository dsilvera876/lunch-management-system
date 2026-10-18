-- Standard Supabase recovery tokens with a short-lived HR-issued purpose nonce.

alter table private.signup_requests
  add column if not exists account_setup_recovery_nonce_hash text,
  add column if not exists account_setup_recovery_requested_at timestamptz;

alter table private.email_delivery_queue
  add column if not exists auth_action_type text,
  add column if not exists auth_user_id uuid,
  add column if not exists auth_token_hash text,
  add column if not exists auth_signup_request_id uuid;

-- Active authentication messages created before token-validation metadata existed
-- must never pass through the newer worker. Preserve their audit rows while removing
-- sensitive bodies through the terminal-redaction trigger installed by 1210.
update private.email_delivery_queue
set
  status = 'failed',
  last_error = 'Quarantined during authentication queue security upgrade.',
  claimed_at = null
where status in ('pending', 'processing')
  and message_type in ('auth_hook', 'account_setup_invite')
  and auth_action_type is null;

create index if not exists email_delivery_queue_auth_recovery_idx
  on private.email_delivery_queue (auth_user_id, created_at desc)
  where auth_action_type = 'recovery';

revoke all on table private.email_delivery_queue from public, anon, authenticated;

create or replace function private.hash_signup_recovery_nonce(p_nonce text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(p_nonce, 'UTF8'), 'sha256'), 'hex');
$$;

revoke all on function private.hash_signup_recovery_nonce(text)
  from public, anon, authenticated;

create or replace function public.prepare_signup_account_setup_recovery(
  p_request_id uuid,
  p_expected_profile_id uuid,
  p_nonce text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.signup_requests%rowtype;
  v_auth_email text;
begin
  if not (select private.is_worker_service_caller()) then
    if (select private.current_user_id()) is null then
      raise exception 'Authentication required';
    end if;
    if not (select private.can_manage_signup_requests()) then
      raise exception 'Signup request management access required';
    end if;
  end if;

  if p_nonce is null
     or p_nonce !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Invalid account setup recovery nonce';
  end if;

  select * into v_request
  from private.signup_requests sr
  where sr.id = p_request_id and sr.status = 'approved'
  for update;

  if not found then
    raise exception 'Approved signup request not found';
  end if;
  if v_request.onboarding_completed_at is not null then
    return 'completed';
  end if;
  if v_request.created_profile_id is null
     or v_request.created_profile_id is distinct from p_expected_profile_id then
    raise exception 'Signup request identity mismatch';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_expected_profile_id) then
    raise exception 'Linked profile does not exist';
  end if;

  select private.normalize_signup_email(au.email::text)
  into v_auth_email
  from auth.users au
  where au.id = p_expected_profile_id;

  if not found or v_auth_email is distinct from v_request.normalized_email then
    raise exception 'Signup request and Auth identity email mismatch';
  end if;

  update private.signup_requests sr
  set
    account_setup_recovery_nonce_hash = private.hash_signup_recovery_nonce(p_nonce),
    account_setup_recovery_requested_at = now()
  where sr.id = v_request.id;

  return 'prepared';
end;
$$;

revoke execute on function public.prepare_signup_account_setup_recovery(uuid, uuid, text)
  from public, anon;
grant execute on function public.prepare_signup_account_setup_recovery(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.service_enqueue_signup_recovery_email(
  p_nonce text,
  p_auth_user_id uuid,
  p_recipient_email text,
  p_token_hash text,
  p_subject text,
  p_text_body text,
  p_html_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_auth_email text;
  v_request private.signup_requests%rowtype;
  v_queue_id uuid;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;
  if p_nonce is null or p_token_hash is null or btrim(p_token_hash) = '' then
    raise exception 'Invalid account setup recovery metadata';
  end if;

  v_email := private.normalize_signup_email(p_recipient_email);
  select private.normalize_signup_email(au.email::text)
  into v_auth_email
  from auth.users au
  where au.id = p_auth_user_id;

  if not found or v_email is null or v_auth_email is distinct from v_email then
    return jsonb_build_object('outcome', 'ordinary');
  end if;

  select * into v_request
  from private.signup_requests sr
  where sr.created_profile_id = p_auth_user_id
    and sr.normalized_email = v_email
    and sr.status = 'approved'
    and sr.onboarding_completed_at is null
    and sr.account_setup_recovery_nonce_hash = private.hash_signup_recovery_nonce(p_nonce)
    and sr.account_setup_recovery_requested_at > now() - interval '1 hour'
  order by sr.requested_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('outcome', 'ordinary');
  end if;

  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    correlation_type, correlation_id, auth_action_type, auth_user_id,
    auth_token_hash, auth_signup_request_id, available_at
  ) values (
    'account_setup_invite', v_email, btrim(p_subject), p_text_body, p_html_body,
    'signup_recovery_email', gen_random_uuid(), 'recovery', p_auth_user_id,
    p_token_hash, v_request.id, now() + interval '15 seconds'
  ) returning id into v_queue_id;

  update private.signup_requests sr
  set invite_queued_at = now(), invite_last_error = null
  where sr.id = v_request.id;

  return jsonb_build_object('outcome', 'queued', 'queue_id', v_queue_id);
end;
$$;

revoke execute on function public.service_enqueue_signup_recovery_email(text, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.service_enqueue_signup_recovery_email(text, uuid, text, text, text, text, text)
  to service_role;

create or replace function public.service_enqueue_ordinary_recovery_email(
  p_auth_user_id uuid,
  p_recipient_email text,
  p_token_hash text,
  p_subject text,
  p_text_body text,
  p_html_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_auth_email text;
  v_queue_id uuid;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  v_email := private.normalize_signup_email(p_recipient_email);
  select private.normalize_signup_email(au.email::text)
  into v_auth_email from auth.users au where au.id = p_auth_user_id;

  if not found or v_email is null or v_auth_email is distinct from v_email
     or p_token_hash is null or btrim(p_token_hash) = '' then
    raise exception 'Invalid ordinary recovery identity';
  end if;

  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    correlation_type, correlation_id, auth_action_type, auth_user_id,
    auth_token_hash, available_at
  ) values (
    'auth_hook', v_email, btrim(p_subject), p_text_body, p_html_body,
    'auth_recovery_email', gen_random_uuid(), 'recovery', p_auth_user_id,
    p_token_hash, now() + interval '15 seconds'
  ) returning id into v_queue_id;

  return v_queue_id;
end;
$$;

revoke execute on function public.service_enqueue_ordinary_recovery_email(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.service_enqueue_ordinary_recovery_email(uuid, text, text, text, text, text)
  to service_role;

create or replace function public.worker_should_deliver_email_queue_message(p_queue_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row private.email_delivery_queue%rowtype;
  v_email text;
begin
  select * into v_row
  from private.email_delivery_queue q
  where q.id = p_queue_id;

  if not found or v_row.status <> 'processing' then
    return false;
  end if;
  if private.email_queue_last_error_is_superseded(v_row.last_error) then
    return false;
  end if;

  v_email := private.normalize_signup_email(v_row.recipient_email);

  if v_row.auth_action_type = 'recovery' then
    if v_row.auth_user_id is null or v_row.auth_token_hash is null
       or not exists (
         select 1
         from auth.users au
         where au.id = v_row.auth_user_id
           and private.normalize_signup_email(au.email::text) = v_email
           and au.recovery_token = v_row.auth_token_hash
           and au.recovery_sent_at is not null
           and au.recovery_sent_at > now() - interval '1 hour'
       ) then
      return false;
    end if;
  end if;

  if v_row.auth_signup_request_id is not null then
    if not exists (
      select 1
      from private.signup_requests sr
      where sr.id = v_row.auth_signup_request_id
        and sr.created_profile_id = v_row.auth_user_id
        and sr.normalized_email = v_email
        and sr.status = 'approved'
        and sr.onboarding_completed_at is null
    ) then
      return false;
    end if;
  elsif v_row.correlation_type = 'signup_request'
        and v_row.correlation_id is not null then
    if not exists (
      select 1 from private.signup_requests sr
      where sr.id = v_row.correlation_id and sr.status = 'approved'
    ) then
      return false;
    end if;
  end if;

  if v_row.message_type = 'account_setup_invite'
     and v_row.auth_action_type is distinct from 'recovery' then
    return false;
  end if;

  if v_row.message_type = 'auth_hook'
     and v_row.auth_action_type is distinct from 'recovery'
     and (
       v_row.correlation_type is distinct from 'verified_auth_hook'
       or v_row.correlation_id is null
       or not exists (select 1 from auth.users au where au.id = v_row.correlation_id)
     ) then
    return false;
  end if;

  return true;
end;
$$;

revoke execute on function public.worker_should_deliver_email_queue_message(uuid)
  from public, anon, authenticated;
grant execute on function public.worker_should_deliver_email_queue_message(uuid)
  to service_role;

create or replace function private.redact_terminal_auth_queue_token()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('sent', 'failed') and old.status not in ('sent', 'failed') then
    new.auth_token_hash := null;
  end if;
  return new;
end;
$$;

revoke all on function private.redact_terminal_auth_queue_token()
  from public, anon, authenticated;

drop trigger if exists email_queue_redact_terminal_auth_token
  on private.email_delivery_queue;
create trigger email_queue_redact_terminal_auth_token
  before update of status on private.email_delivery_queue
  for each row execute function private.redact_terminal_auth_queue_token();

create or replace function private.sync_signup_recovery_queue_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_signup_request_id is null or new.status = old.status then
    return new;
  end if;

  if new.status = 'sent' then
    update private.signup_requests sr
    set invite_sent_at = coalesce(sr.invite_sent_at, now()), invite_last_error = null
    where sr.id = new.auth_signup_request_id;
  elsif new.status = 'failed'
        and not exists (
          select 1 from private.email_delivery_queue q
          where q.auth_signup_request_id = new.auth_signup_request_id
            and q.created_at > new.created_at
            and q.status in ('pending', 'processing', 'sent')
        ) then
    update private.signup_requests sr
    set invite_last_error = private.sanitize_signup_invite_error(
      coalesce(new.last_error, 'Account setup email delivery failed.')
    )
    where sr.id = new.auth_signup_request_id
      and sr.onboarding_completed_at is null;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_signup_recovery_queue_status()
  from public, anon, authenticated;

drop trigger if exists email_queue_sync_signup_recovery_status
  on private.email_delivery_queue;
create trigger email_queue_sync_signup_recovery_status
  after update of status on private.email_delivery_queue
  for each row execute function private.sync_signup_recovery_queue_status();
