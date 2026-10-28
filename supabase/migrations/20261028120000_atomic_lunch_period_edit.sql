begin;

-- One transaction for the unified Accounts editor. Keep the existing setters
-- as the authority for label/end-date rules and trusted-write bookkeeping.
create function public.update_lunch_period_details(
  p_period_id uuid,
  p_label text,
  p_end_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.lunch_periods%rowtype;
  v_latest_id uuid;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;
  if not (select private.can_manage_lunch_periods()) then
    raise exception 'Lunch period management access required';
  end if;
  if p_label is null or length(trim(p_label)) = 0 then
    raise exception 'Label is required';
  end if;
  if p_end_date is null then
    raise exception 'End date is required';
  end if;

  -- Same advisory-lock-before-row-lock order as create_next_lunch_period.
  -- Serializes timeline appends against the latest-period check. Only lock
  -- the selected row: label-only historical edits must not lock another period.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.lunch_periods'));
  select lp.* into v_period
  from public.lunch_periods lp
  where lp.id = p_period_id
  for update;

  if not found then
    raise exception 'Lunch period does not exist';
  end if;
  -- Recheck after acquiring the same row lock used by finalization.
  if v_period.status = 'finalized' then
    raise exception 'Finalized lunch periods cannot be modified';
  end if;

  if p_end_date is distinct from v_period.end_date then
    select lp.id into v_latest_id
    from public.lunch_periods lp
    order by lp.end_date desc, lp.id desc
    limit 1;
    if v_latest_id is distinct from p_period_id then
      raise exception 'Only the latest lunch period end date may be adjusted';
    end if;
  end if;

  if trim(p_label) is distinct from v_period.label then
    perform public.update_lunch_period_label(p_period_id, p_label);
  end if;
  if p_end_date is distinct from v_period.end_date then
    -- This locks only our already-locked latest row and validates start/end.
    -- Any error rolls back the label update as well; never catch it here.
    perform public.update_latest_lunch_period_end_date(p_period_id, p_end_date);
  end if;
  -- No setter call for unchanged fields: no updated_at/updated_by churn.
end;
$$;

alter function public.update_lunch_period_details(uuid, text, date) owner to postgres;
revoke all on function public.update_lunch_period_details(uuid, text, date)
  from public, anon, authenticated, service_role;
grant execute on function public.update_lunch_period_details(uuid, text, date)
  to authenticated;

commit;
