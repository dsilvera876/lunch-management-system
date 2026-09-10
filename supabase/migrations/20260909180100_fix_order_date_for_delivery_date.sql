create or replace function public.order_date_for_delivery_date(p_delivery_date date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_offset integer;
  v_candidate date;
begin
  if extract(isodow from p_delivery_date)::int not between 1 and 7 then
    return null;
  end if;

  foreach v_offset in array array[1, 2, 3, 4, 5]
  loop
    v_candidate := (p_delivery_date - v_offset)::date;

    if public.delivery_date_for_order_date(v_candidate) = p_delivery_date then
      return v_candidate;
    end if;
  end loop;

  return null;
end;
$$;
