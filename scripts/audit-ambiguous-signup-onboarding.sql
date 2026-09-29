-- Pre-deploy audit (read-only): approved signup requests linked to a profile
-- without strong application/business-history evidence.
--
-- Compatible with schema BEFORE onboarding-marker migrations (292200/292300).
-- Does not reference onboarding_completed_at or migration 292100+ helper functions.
--
-- Run as a role that can read private.signup_requests, public.profiles, and auth.users
-- (e.g. postgres / service context). Example:
--   psql "$DATABASE_URL" -f scripts/audit-ambiguous-signup-onboarding.sql

-- ---------------------------------------------------------------------------
-- A. Detail: ambiguous candidates for manual review (not a completion decision)
-- ---------------------------------------------------------------------------
select
  sr.id as signup_request_id,
  sr.normalized_email,
  sr.email,
  sr.status as signup_status,
  sr.created_profile_id,
  p.role as profile_role,
  p.account_status as profile_account_status,
  coalesce(sr.reviewed_at, sr.requested_at) as signup_approved_or_reviewed_at,
  sr.invite_sent_at,
  au.invited_at as auth_invited_at,
  au.email_confirmed_at as auth_email_confirmed_at,
  au.last_sign_in_at as auth_last_sign_in_at,
  private.user_has_business_history(sr.created_profile_id) as business_history,
  'approved_linked_no_business_history'::text as diagnostic_label
from private.signup_requests sr
inner join public.profiles p
  on p.id = sr.created_profile_id
left join auth.users au
  on au.id = sr.created_profile_id
where sr.status = 'approved'
  and sr.created_profile_id is not null
  and not private.user_has_business_history(sr.created_profile_id)
order by coalesce(sr.reviewed_at, sr.requested_at) desc nulls last, sr.normalized_email;

-- ---------------------------------------------------------------------------
-- B. Summary counts
-- ---------------------------------------------------------------------------
with approved_linked as (
  select
    sr.id,
    sr.created_profile_id
  from private.signup_requests sr
  inner join public.profiles p
    on p.id = sr.created_profile_id
  where sr.status = 'approved'
    and sr.created_profile_id is not null
),
classified as (
  select
    al.id,
    private.user_has_business_history(al.created_profile_id) as has_business_history
  from approved_linked al
)
select
  (select count(*)::bigint from approved_linked) as total_approved_linked,
  (select count(*)::bigint from classified where has_business_history) as with_business_history,
  (select count(*)::bigint from classified where not has_business_history) as ambiguous_no_business_history;
