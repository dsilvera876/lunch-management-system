-- ============================================================
-- Lunch providers and recurring weekly menus (Batch 1)
-- ============================================================

create table public.lunch_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (length(trim(name)) > 0),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index lunch_providers_name_unique
  on public.lunch_providers (lower(trim(name)));

create table public.provider_menu_items (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null
    references public.lunch_providers(id) on delete cascade,
  name text not null
    check (length(trim(name)) > 0),
  description text,
  price numeric(10,2) not null
    check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_provider_menu_items_provider
  on public.provider_menu_items (provider_id);

create unique index provider_menu_items_provider_name_unique
  on public.provider_menu_items (provider_id, lower(trim(name)));

create table public.provider_menu_item_weekdays (
  provider_menu_item_id uuid not null
    references public.provider_menu_items(id) on delete cascade,
  weekday smallint not null
    check (weekday between 1 and 5),
  primary key (provider_menu_item_id, weekday)
);

create index idx_provider_menu_item_weekdays_item
  on public.provider_menu_item_weekdays (provider_menu_item_id);

-- ISO weekday: 1 = Monday, 5 = Friday
create or replace function public.next_business_weekday(p_weekday smallint)
returns smallint
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when p_weekday between 1 and 4 then p_weekday + 1
    when p_weekday = 5 then 1
    else null
  end;
$$;

revoke all on function public.next_business_weekday(smallint) from public;
grant execute on function public.next_business_weekday(smallint) to authenticated;

create trigger lunch_providers_set_updated_at
  before update on public.lunch_providers
  for each row execute function private.set_updated_at();

create trigger provider_menu_items_set_updated_at
  before update on public.provider_menu_items
  for each row execute function private.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.lunch_providers enable row level security;
alter table public.provider_menu_items enable row level security;
alter table public.provider_menu_item_weekdays enable row level security;

revoke all on public.lunch_providers from anon;
revoke all on public.provider_menu_items from anon;
revoke all on public.provider_menu_item_weekdays from anon;

grant select, insert, update, delete on public.lunch_providers to authenticated;
grant select, insert, update, delete on public.provider_menu_items to authenticated;
grant select, insert, update, delete on public.provider_menu_item_weekdays to authenticated;

create policy "Authenticated users can view active providers"
on public.lunch_providers
for select
to authenticated
using (active = true);

create policy "Admins can manage providers"
on public.lunch_providers
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Authenticated users can view active provider menu items"
on public.provider_menu_items
for select
to authenticated
using (
  active = true
  and exists (
    select 1
    from public.lunch_providers lp
    where lp.id = provider_id
      and lp.active = true
  )
);

create policy "Admins can manage provider menu items"
on public.provider_menu_items
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Authenticated users can view weekdays for visible menu items"
on public.provider_menu_item_weekdays
for select
to authenticated
using (
  exists (
    select 1
    from public.provider_menu_items pmi
    join public.lunch_providers lp on lp.id = pmi.provider_id
    where pmi.id = provider_menu_item_id
      and pmi.active = true
      and lp.active = true
  )
);

create policy "Admins can manage provider menu item weekdays"
on public.provider_menu_item_weekdays
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
