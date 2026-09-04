-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'user'
    check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lunch days
create table public.lunch_days (
  id uuid primary key default gen_random_uuid(),
  lunch_date date not null unique,
  order_deadline timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'closed', 'completed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Menu items
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  lunch_day_id uuid not null
    references public.lunch_days(id) on delete cascade,
  name text not null
    check (length(trim(name)) > 0),
  description text,
  price numeric(10,2) not null
    check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint menu_items_id_lunch_day_unique
    unique (id, lunch_day_id)
);

-- Orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  lunch_day_id uuid not null
    references public.lunch_days(id) on delete restrict,
  status text not null default 'submitted'
    check (status in ('submitted', 'cancelled', 'fulfilled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint one_order_per_user_per_lunch_day
    unique (profile_id, lunch_day_id),

  constraint orders_id_lunch_day_unique
    unique (id, lunch_day_id)
);

-- Order items
create table public.order_items (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null,
  menu_item_id uuid not null,
  lunch_day_id uuid not null,

  quantity integer not null default 1
    check (quantity > 0),

  unit_price numeric(10,2) not null
    check (unit_price >= 0),

  created_at timestamptz not null default now(),

  constraint order_items_order_fk
    foreign key (order_id, lunch_day_id)
    references public.orders(id, lunch_day_id)
    on delete cascade,

  constraint order_items_menu_item_fk
    foreign key (menu_item_id, lunch_day_id)
    references public.menu_items(id, lunch_day_id)
    on delete restrict,

  constraint one_menu_item_per_order
    unique (order_id, menu_item_id)
);

-- Indexes
create index idx_menu_items_lunch_day
  on public.menu_items(lunch_day_id);

create index idx_orders_lunch_day
  on public.orders(lunch_day_id);

create index idx_order_items_menu_item
  on public.order_items(menu_item_id);

create index idx_order_items_lunch_day
  on public.order_items(lunch_day_id);