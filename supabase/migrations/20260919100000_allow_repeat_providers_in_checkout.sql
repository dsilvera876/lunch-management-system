-- Allow multiple cart entries for the same provider in one atomic checkout (Lunch Cart workflow).

create or replace function public.submit_provider_checkout(
  p_order_date date,
  p_office_location_id uuid,
  p_provider_orders jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_group_id uuid := gen_random_uuid();
  v_entry jsonb;
  v_provider_id uuid;
  v_items jsonb;
  v_special_instructions text;
  v_order_id uuid;
  v_order_ids uuid[] := '{}';
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_provider_orders) <> 'array' then
    raise exception 'Invalid checkout payload';
  end if;

  if jsonb_array_length(p_provider_orders) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  for v_entry in
    select value
    from jsonb_array_elements(p_provider_orders)
  loop
    begin
      v_provider_id := (v_entry ->> 'provider_id')::uuid;
    exception
      when others then
        raise exception 'Invalid checkout payload';
    end;

    v_items := v_entry -> 'items';

    if jsonb_typeof(v_items) <> 'object' then
      raise exception 'Invalid checkout payload';
    end if;

    v_special_instructions := v_entry ->> 'special_instructions';

    v_order_id := private.insert_provider_order(
      v_provider_id,
      p_order_date,
      v_items,
      v_special_instructions,
      p_office_location_id,
      v_order_group_id
    );

    v_order_ids := array_append(v_order_ids, v_order_id);
  end loop;

  return jsonb_build_object(
    'order_group_id',
    v_order_group_id,
    'order_ids',
    to_jsonb(v_order_ids)
  );
end;
$$;

revoke execute on function public.submit_provider_checkout(date, uuid, jsonb)
from public, anon;

grant execute on function public.submit_provider_checkout(date, uuid, jsonb)
to authenticated;
